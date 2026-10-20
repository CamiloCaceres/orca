import { describe, expect, it } from 'vitest'
import {
  catalogEntryFixture,
  catalogFixture,
  v2ManifestFixture
} from './plugin-json-schema.test-fixture'
import { validatePluginFile } from './plugin-file-validation'

const VALID_RELEASE = {
  version: '1.0.0',
  commit: 'a'.repeat(40),
  contentHash: 'b'.repeat(64),
  execution: 'data',
  minimumOrca: '1.4.0',
  types: ['syntax']
}

describe('validatePluginFile', () => {
  it('passes valid files and reports manifest errors', () => {
    expect(validatePluginFile('orca-plugin.json', v2ManifestFixture())).toEqual([])
    expect(
      validatePluginFile('orca-catalog.json', catalogFixture([catalogEntryFixture()]))
    ).toEqual([])
    expect(
      validatePluginFile('orca-plugin.json', v2ManifestFixture({ engines: { orca: '>=1.0.0' } }))
    ).toEqual([expect.stringContaining('engines.orca: must be at least')])
  })

  it('turns every runtime repair of a catalog into an error', () => {
    const errors = validatePluginFile(
      'orca-catalog.json',
      catalogFixture([
        catalogEntryFixture({ categories: ['syntax', 'syntax'], description: 5 }),
        catalogEntryFixture(),
        catalogEntryFixture({
          id: 'acme.other',
          releases: [{ version: 'x' }, VALID_RELEASE]
        }),
        catalogEntryFixture({ id: 'acme.broken', releases: [] })
      ])
    )
    expect(errors).toEqual([
      'plugins[0].categories: has invalid, repeated or extra categories',
      'plugins[0].description: must be text of 1 to 4096 characters',
      'plugins[1].id: duplicate plugin id acme.gleam-syntax',
      'plugins[2].releases: 1 release(s) are unreadable or over the limit',
      'plugins[3]: releases: needs at least one release this Orca can read'
    ])
  })

  it('refuses a newer catalog format', () => {
    expect(
      validatePluginFile('orca-catalog.json', { ...catalogFixture([]), catalogVersion: 3 })
    ).toEqual(['uses catalog format 3; update Orca to browse this catalog'])
  })
})
