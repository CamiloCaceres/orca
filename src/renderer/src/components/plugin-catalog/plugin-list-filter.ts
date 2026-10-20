import type { PluginListEntry } from './plugin-list-entries'

/** Narrowing the list by category and by catalog; empty sets mean "any". */
export type PluginListFilter = {
  categories: ReadonlySet<string>
  sourceIds: ReadonlySet<string>
}

export const NO_PLUGIN_LIST_FILTER: PluginListFilter = {
  categories: new Set(),
  sourceIds: new Set()
}

// Why: "official" is trust, shown by the verified mark; it isn't a kind of plugin to filter by.
const NON_KIND_CATEGORIES = new Set(['official'])

export function pluginFilterCategories(entries: readonly PluginListEntry[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const category of entry.categories) {
      if (!NON_KIND_CATEGORIES.has(category)) {
        counts.set(category, (counts.get(category) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export function matchesPluginFilter(entry: PluginListEntry, filter: PluginListFilter): boolean {
  if (filter.categories.size > 0 && !entry.categories.some((c) => filter.categories.has(c))) {
    return false
  }
  if (filter.sourceIds.size > 0) {
    const sourceId = entry.listing?.marketplaceSourceId
    return sourceId !== undefined && filter.sourceIds.has(sourceId)
  }
  return true
}

export function pluginFilterSize(filter: PluginListFilter): number {
  return filter.categories.size + filter.sourceIds.size
}
