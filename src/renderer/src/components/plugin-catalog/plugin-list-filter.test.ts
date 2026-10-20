import { describe, expect, it } from 'vitest'
import type { PluginListEntry } from './plugin-list-entries'
import { matchesPluginFilter, pluginFilterCategories } from './plugin-list-filter'

function entry(categories: string[], sourceId: string | null): PluginListEntry {
  return {
    pluginKey: `p.${categories.join('-')}`,
    name: 'P',
    publisher: null,
    version: null,
    description: null,
    official: false,
    categories,
    types: [],
    minimumOrca: null,
    updateVersion: null,
    installed: null,
    listing: sourceId
      ? {
          marketplaceSourceId: sourceId,
          marketplaceName: 'Catalog',
          marketplaceOwner: 'owner',
          marketplaceCommit: 'c',
          pluginKey: 'p',
          source: { kind: 'git', url: 'https://example.invalid/c.git', ref: 'main' },
          categories,
          official: false,
          bundled: false
        }
      : null
  }
}

describe('plugin list filter', () => {
  it('counts categories without the trust label, and matches category and catalog together', () => {
    const themes = entry(['themes', 'official'], 'official')
    const icons = entry(['icons'], 'acme')
    expect(pluginFilterCategories([themes, icons])).toEqual([
      ['icons', 1],
      ['themes', 1]
    ])
    const filter = { categories: new Set(['themes']), sourceIds: new Set(['official']) }
    expect(matchesPluginFilter(themes, filter)).toBe(true)
    expect(matchesPluginFilter(icons, filter)).toBe(false)
    expect(matchesPluginFilter(entry(['themes'], null), filter)).toBe(false)
    expect(matchesPluginFilter(icons, { categories: new Set(), sourceIds: new Set() })).toBe(true)
  })
})
