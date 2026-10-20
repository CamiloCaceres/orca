import { describe, expect, it } from 'vitest'
import { parsePluginManifest } from './plugin-manifest'
import { formatPluginSchemaPath, pluginSchemaIssueLines } from './plugin-schema-issues'

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

function manifestError(raw: unknown): string {
  const parsed = parsePluginManifest(raw)
  if (parsed.ok) {
    throw new Error('expected the manifest to be rejected')
  }
  return parsed.error
}

describe('plugin schema issues', () => {
  it('formats paths with bracketed indexes', () => {
    expect(formatPluginSchemaPath(['contributes', 'themes', 0, 'path'])).toBe(
      'contributes.themes[0].path'
    )
    expect(formatPluginSchemaPath([])).toBe('(root)')
  })

  it('reports every mistake in one pass with author-facing wording', () => {
    const error = manifestError(
      v2Manifest({
        name: undefined,
        execution: 'root',
        surprise: true,
        contributes: {
          themes: [{ id: 'dusk', label: '', path: 'themes/dusk.json' }],
          syntaxes: Array.from({ length: 17 }, (_, index) => ({
            id: `lang-${index}`,
            label: 'Lang',
            scopeName: 'source.lang',
            path: 'lang.json'
          }))
        }
      })
    )
    expect(error.split('; ')).toEqual([
      'execution: must be one of "data", "instructional", "sandboxed-ui", "trusted-worker"',
      'name: is required',
      'contributes.themes[0].label: must not be empty',
      'contributes.syntaxes: must be at most 16 items',
      '(root): unknown key "surprise"'
    ])
  })

  it('keeps messages the schema states itself', () => {
    expect(manifestError(v2Manifest({ engines: { orca: '^1.4.0' } }))).toBe(
      'engines.orca: must be a ">=x.y.z" version range'
    )
    expect(manifestError(v2Manifest({ execution: 'trusted-worker' }))).toBe(
      'main: trusted-worker requires a Node entry'
    )
  })

  it('names the supported manifest formats', () => {
    expect(manifestError(v2Manifest({ manifestVersion: 7 }))).toBe(
      'manifestVersion: must be one of 1, 2'
    )
  })

  it('dedupes identical lines and caps the count', () => {
    const issue = (index: number) => ({
      code: 'custom' as const,
      path: ['items', index],
      message: 'bad',
      input: undefined
    })
    const lines = pluginSchemaIssueLines(
      [issue(0), issue(0), ...Array.from({ length: 10 }, (_, index) => issue(index + 1))],
      3
    )
    expect(lines).toEqual(['items[0]: bad', 'items[1]: bad', 'items[2]: bad', '(8 more)'])
  })
})
