import { describe, expect, it } from 'vitest'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostListing
} from '../../../../preload/api-types'
import {
  buildPluginListEntries,
  matchesPluginSearch,
  pluginListEntryFromListing
} from './plugin-list-entries'

function listing(pluginKey: string, extra: Partial<PluginMarketplaceHostListing> = {}) {
  const value: PluginMarketplaceHostListing = {
    marketplaceSourceId: 'official',
    marketplaceName: 'Orca Official Plugins',
    marketplaceOwner: 'stablyai',
    marketplaceCommit: 'abc123',
    pluginKey,
    source: { kind: 'git', url: 'https://example.invalid/plugins.git', ref: 'main' },
    description: 'A quiet dark theme.',
    categories: ['themes'],
    official: true,
    bundled: false,
    ...extra
  }
  return value
}

function installed(pluginKey: string, name: string): PluginHostListEntry {
  return {
    pluginKey,
    consentFingerprint: null,
    name,
    version: '1.0.0',
    publisher: 'stablyai',
    status: 'running',
    needsReconsent: false,
    isDev: false,
    official: true,
    bundled: false,
    capabilities: [],
    panels: [],
    commands: [],
    hasWorker: false,
    restarts: 0
  }
}

describe('plugin list entries', () => {
  it('lists installed plugins once, joined to their listing, and the rest as available', () => {
    const result = buildPluginListEntries(
      [installed('stablyai.orca-midnight-theme', 'Orca Midnight')],
      [
        listing('stablyai.orca-midnight-theme'),
        listing('stablyai.orca-nord-theme'),
        listing('stablyai.orca-nord-theme', { marketplaceSourceId: 'mirror' })
      ]
    )
    expect(result.installed.map((entry) => [entry.name, entry.categories])).toEqual([
      ['Orca Midnight', ['themes']]
    ])
    expect(
      result.available.map((entry) => [entry.name, entry.listing?.marketplaceSourceId])
    ).toEqual([['Orca Nord Theme', 'official']])
  })

  it('names and versions a listing from its flat release fields, then the raw release', () => {
    const flat = pluginListEntryFromListing(
      listing('stablyai.orca-midnight-theme', { name: 'Orca Midnight', version: '2.0.0' })
    )
    expect(flat).toMatchObject({ name: 'Orca Midnight', version: '2.0.0' })
    const bare = pluginListEntryFromListing(listing('stablyai.orca-midnight-theme'))
    expect(bare.version).toBeNull()
    expect(bare.name).not.toBe('')
  })

  it('searches names, publishers, catalogs and categories', () => {
    const [entry] = buildPluginListEntries([], [listing('stablyai.orca-nord-theme')]).available
    expect(matchesPluginSearch(entry!, 'nord')).toBe(true)
    expect(matchesPluginSearch(entry!, 'THEMES')).toBe(true)
    expect(matchesPluginSearch(entry!, 'official plugins')).toBe(true)
    expect(matchesPluginSearch(entry!, 'gleam')).toBe(false)
    expect(matchesPluginSearch(entry!, '  ')).toBe(true)
  })
})
