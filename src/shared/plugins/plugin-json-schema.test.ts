import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import {
  pluginCatalogJsonSchema,
  pluginManifestJsonSchema,
  pluginSchemaGeneratedFiles,
  type PluginJsonSchema
} from './plugin-json-schema'
import { parsePluginManifest } from './plugin-manifest'
import { pluginMarketplaceV2Schema } from './plugin-marketplace'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

function compile(schema: PluginJsonSchema) {
  // Why no format plugin: every format the schemas use also carries a `pattern`.
  const ajv = new Ajv2020({ allErrors: true, validateFormats: false })
  ajv.addKeyword('x-orca-since')
  return { ajv, validate: ajv.compile(schema) }
}

/** Every property in the schema with its JSON pointer, including fragments and nested objects. */
function properties(schema: PluginJsonSchema, pointer = ''): [string, PluginJsonSchema][] {
  const own = Object.entries(schema.properties ?? {}).flatMap(([key, node]) => {
    const field = typeof node === 'object' ? node : {}
    const at = `${pointer}/properties/${key}`
    const entry: [string, PluginJsonSchema] = [at, field]
    return [entry, ...properties(field, at)]
  })
  const defs = Object.entries(schema.$defs ?? {}).flatMap(([name, def]) =>
    properties(def, `${pointer}/$defs/${name}`)
  )
  return [...own, ...defs]
}

function manifestFixtures(): { file: string; raw: unknown }[] {
  return ['examples/plugins', 'resources/plugins/launch'].flatMap((dir) =>
    readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name, 'orca-plugin.json'))
      .map((file) => ({ file, raw: JSON.parse(readFileSync(path.join(REPO_ROOT, file), 'utf8')) }))
  )
}

function v2Manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2,
    execution: 'data',
    id: 'demo',
    publisher: 'acme',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: '>=1.4.223' },
    pluginApi: 1,
    ...overrides
  }
}

describe('published plugin schemas', () => {
  it('match the committed files (run `pnpm generate:plugin-schemas` when this fails)', () => {
    for (const [file, content] of Object.entries(pluginSchemaGeneratedFiles())) {
      const committed = readFileSync(path.join(REPO_ROOT, file), 'utf8')
      expect(committed, `${file} is stale: run pnpm generate:plugin-schemas`).toBe(content)
    }
  })

  it.each([
    ['manifest', pluginManifestJsonSchema()],
    ['catalog', pluginCatalogJsonSchema()]
  ])('documents every %s field with a description and a since-version', (_name, schema) => {
    // Why skip $ref fields: they point at a fragment, which is checked below.
    for (const [pointer, field] of properties(schema).filter(([, field]) => !field.$ref)) {
      expect(field.description, pointer).toBeTruthy()
      expect(field['x-orca-since'], pointer).toBeTruthy()
    }
    for (const [name, def] of Object.entries(schema.$defs ?? {})) {
      expect(def.description, name).toBeTruthy()
    }
  })

  it.each([
    ['manifest', pluginManifestJsonSchema()],
    ['catalog', pluginCatalogJsonSchema()]
  ])('accepts every documented %s example', (_name, schema) => {
    const { ajv } = compile(schema)
    for (const [pointer, field] of properties(schema)) {
      for (const example of field.examples ?? []) {
        const validate = ajv.getSchema(`${schema.$id}#${pointer}`)
        expect(validate?.(example), `${pointer}: ${JSON.stringify(example)}`).toBe(true)
      }
    }
  })

  it('accepts every bundled and example v2 manifest that Orca accepts', () => {
    const { validate } = compile(pluginManifestJsonSchema())
    const v2 = manifestFixtures().filter(
      ({ raw }) =>
        parsePluginManifest(raw).ok && JSON.stringify(raw).includes('"manifestVersion":2')
    )
    expect(v2.length).toBeGreaterThan(0)
    for (const { file, raw } of v2) {
      expect(validate(raw), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true)
    }
  })

  it.each([
    ['an unknown key', { surprise: true }],
    ['a reserved-shape id', { id: 'Not_Kebab' }],
    ['an escaping path', { main: '../escape.js', execution: 'trusted-worker' }],
    ['a range Orca cannot gate on', { engines: { orca: '^1.4.0' } }],
    ['an unknown execution profile', { execution: 'root' }],
    ['an unknown contribution point', { contributes: { widgets: [] } }]
  ])('rejects %s in both the schema and the runtime', (_label, overrides) => {
    const { validate } = compile(pluginManifestJsonSchema())
    const raw = v2Manifest(overrides)
    expect(validate(raw)).toBe(false)
    expect(parsePluginManifest(raw).ok).toBe(false)
  })

  it('accepts a release-bearing catalog Orca accepts', () => {
    const { validate } = compile(pluginCatalogJsonSchema())
    const catalog = {
      $schema: pluginCatalogJsonSchema().$id,
      name: 'Acme Plugins',
      owner: 'acme',
      plugins: [
        {
          id: 'acme.gleam-syntax',
          source: { kind: 'git', url: 'https://github.com/acme/gleam.git', ref: 'main' },
          categories: ['syntax'],
          release: {
            version: '1.0.0',
            commit: 'a'.repeat(40),
            contentHash: 'b'.repeat(64),
            execution: 'data',
            minimumOrca: '1.4.223',
            types: ['syntax'],
            name: 'Gleam',
            fileTypes: ['gleam'],
            license: 'Apache-2.0',
            repository: 'https://github.com/acme/gleam',
            homepage: 'https://gleam.example.com',
            updatedAt: '2026-10-20T09:30:00Z',
            changelog: 'Highlights use expressions.'
          }
        }
      ]
    }
    expect(validate(catalog), JSON.stringify(validate.errors)).toBe(true)
    expect(pluginMarketplaceV2Schema.parse(catalog).plugins).toHaveLength(1)
  })
})
