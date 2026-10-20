import { z } from 'zod'
import { pluginManifestV2Object } from './plugin-manifest'
import { pluginMarketplaceV2DocumentSchema } from './plugin-marketplace'
import { renderPluginSchemaReference } from './plugin-schema-reference-doc'
import { PLUGIN_SCHEMA_SINCE_V1 } from './plugin-schema-field-docs'

// Why a versioned directory: a later breaking format publishes beside v2, so a URL an author
// pinned never changes meaning under them.
export const PLUGIN_SCHEMA_DIRECTORY = 'schemas/plugins/v2'
export const PLUGIN_SCHEMA_BASE_URL = `https://raw.githubusercontent.com/stablyai/orca/main/${PLUGIN_SCHEMA_DIRECTORY}/`
export const PLUGIN_MANIFEST_SCHEMA_FILE = 'orca-plugin.schema.json'
export const PLUGIN_CATALOG_SCHEMA_FILE = 'orca-marketplace.schema.json'
/** The starter plugin authors copy; it carries the schema so completion works offline. */
const PLUGIN_TEMPLATE_DIRECTORY = 'examples/plugins/orca-gleam-syntax'

const LEGACY_MANIFEST_NOTES = [
  '## Legacy format 1',
  '',
  `Orca still loads \`"manifestVersion": 1\` manifests (read since ${PLUGIN_SCHEMA_SINCE_V1}), but new plugins should use format 2. Format 1 differs in three ways:`,
  '',
  '- It has no `execution` field. Orca derives the least profile that can run what the manifest declares.',
  '- Unknown top-level keys are ignored instead of rejected.',
  '- The published JSON Schema does not describe it, so editors offer no completion for it.'
]

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
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
  return {
    [`${PLUGIN_SCHEMA_DIRECTORY}/${PLUGIN_MANIFEST_SCHEMA_FILE}`]: manifestJson,
    [`${PLUGIN_TEMPLATE_DIRECTORY}/${PLUGIN_MANIFEST_SCHEMA_FILE}`]: manifestJson,
    [`${PLUGIN_SCHEMA_DIRECTORY}/${PLUGIN_CATALOG_SCHEMA_FILE}`]: `${JSON.stringify(catalog, null, 2)}\n`,
    'docs/reference/plugin-manifest.md': renderPluginSchemaReference(manifest, {
      file: 'orca-plugin.json',
      schemaFile: PLUGIN_MANIFEST_SCHEMA_FILE,
      sinceNote:
        '`Since` is the first Orca release that reads the field; raise `engines.orca` when you use a newer one.',
      appendix: LEGACY_MANIFEST_NOTES
    }),
    'docs/reference/plugin-catalog.md': renderPluginSchemaReference(catalog, {
      file: 'orca-marketplace.v2.json',
      schemaFile: PLUGIN_CATALOG_SCHEMA_FILE,
      sinceNote:
        '`Since` is the first Orca release that reads the field. Older releases ignore fields they do not know.'
    })
  }
}
