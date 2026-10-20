import { z } from 'zod'
import { pluginManifestV2Object } from './plugin-manifest'
import { pluginMarketplaceV2DocumentSchema } from './plugin-marketplace'
import { renderPluginSchemaReference } from './plugin-schema-reference-doc'

export const PLUGIN_SCHEMA_BASE_URL =
  'https://raw.githubusercontent.com/stablyai/orca/main/schemas/plugins/'
export const PLUGIN_MANIFEST_SCHEMA_FILE = 'orca-plugin.schema.json'
export const PLUGIN_CATALOG_SCHEMA_FILE = 'orca-marketplace.v2.schema.json'

export type PluginJsonSchema = z.core.JSONSchema.BaseSchema

function toPublishedSchema(
  schema: z.ZodType,
  file: string,
  title: string,
  description: string
): PluginJsonSchema {
  // Why input side: authors write what Orca reads, before defaults and transforms apply.
  const generated = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
    unrepresentable: 'any'
  })
  const { $schema, ...body } = generated
  return { $schema, $id: `${PLUGIN_SCHEMA_BASE_URL}${file}`, title, description, ...body }
}

export function pluginManifestJsonSchema(): PluginJsonSchema {
  return toPublishedSchema(
    pluginManifestV2Object,
    PLUGIN_MANIFEST_SCHEMA_FILE,
    'Orca plugin manifest',
    'The orca-plugin.json file at the root of an Orca plugin (manifest format 2).'
  )
}

export function pluginCatalogJsonSchema(): PluginJsonSchema {
  return toPublishedSchema(
    pluginMarketplaceV2DocumentSchema,
    PLUGIN_CATALOG_SCHEMA_FILE,
    'Orca plugin catalog',
    'The orca-marketplace.v2.json file that lists installable plugin releases.'
  )
}

/** Every generated file, keyed by repo-relative path. One list keeps the writer and the drift
 *  test from disagreeing about what is generated. */
export function pluginSchemaGeneratedFiles(): Record<string, string> {
  const manifest = pluginManifestJsonSchema()
  const catalog = pluginCatalogJsonSchema()
  return {
    [`schemas/plugins/${PLUGIN_MANIFEST_SCHEMA_FILE}`]: `${JSON.stringify(manifest, null, 2)}\n`,
    [`schemas/plugins/${PLUGIN_CATALOG_SCHEMA_FILE}`]: `${JSON.stringify(catalog, null, 2)}\n`,
    'docs/reference/plugin-manifest.md': renderPluginSchemaReference(manifest, {
      file: 'orca-plugin.json',
      schemaFile: PLUGIN_MANIFEST_SCHEMA_FILE,
      sinceNote:
        '`Since` is the first Orca release that reads the field; raise `engines.orca` when you use a newer one.'
    }),
    'docs/reference/plugin-catalog.md': renderPluginSchemaReference(catalog, {
      file: 'orca-marketplace.v2.json',
      schemaFile: PLUGIN_CATALOG_SCHEMA_FILE,
      sinceNote:
        '`Since` is the first Orca release that reads the field. Older releases ignore fields they do not know.'
    })
  }
}
