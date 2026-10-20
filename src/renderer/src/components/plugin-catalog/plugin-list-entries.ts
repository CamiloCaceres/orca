import type {
  PluginHostListEntry,
  PluginMarketplaceHostListing
} from '../../../../preload/api-types'
import { pluginDisplayNameFromKey } from './plugin-display-name'

/** One plugin as the list and detail page show it, whether installed, listed, or both. */
export type PluginListEntry = {
  pluginKey: string
  name: string
  publisher: string | null
  version: string | null
  description: string | null
  official: boolean
  categories: readonly string[]
  installed: PluginHostListEntry | null
  listing: PluginMarketplaceHostListing | null
}

export function pluginListEntryFromInstalled(
  plugin: PluginHostListEntry,
  listing: PluginMarketplaceHostListing | null = null
): PluginListEntry {
  return {
    pluginKey: plugin.pluginKey,
    name: plugin.name,
    publisher: plugin.publisher || null,
    version: plugin.version,
    description: plugin.description ?? listing?.description ?? null,
    official: plugin.official,
    categories: listing?.categories ?? [],
    installed: plugin,
    listing
  }
}

export function pluginListEntryFromListing(listing: PluginMarketplaceHostListing): PluginListEntry {
  return {
    pluginKey: listing.pluginKey,
    // Why: listings carry no manifest name yet; the key is the only name they have.
    name: pluginDisplayNameFromKey(listing.pluginKey),
    publisher: listing.marketplaceOwner || null,
    version: null,
    description: listing.description ?? null,
    official: listing.official,
    categories: listing.categories,
    installed: null,
    listing
  }
}

/**
 * Installed plugins first (joined to their listing when a catalog has one), then catalog
 * plugins not installed. A plugin listed by two catalogs keeps the first listing.
 */
export function buildPluginListEntries(
  installed: readonly PluginHostListEntry[],
  listings: readonly PluginMarketplaceHostListing[]
): { installed: PluginListEntry[]; available: PluginListEntry[] } {
  const listingByKey = new Map<string, PluginMarketplaceHostListing>()
  for (const listing of listings) {
    if (!listingByKey.has(listing.pluginKey)) {
      listingByKey.set(listing.pluginKey, listing)
    }
  }
  const installedKeys = new Set(installed.map((plugin) => plugin.pluginKey))
  return {
    installed: installed.map((plugin) =>
      pluginListEntryFromInstalled(plugin, listingByKey.get(plugin.pluginKey) ?? null)
    ),
    available: [...listingByKey.values()]
      .filter((listing) => !installedKeys.has(listing.pluginKey))
      .map(pluginListEntryFromListing)
  }
}

/** Search across what a user can see or would type: name, key, publisher, description, categories. */
export function matchesPluginSearch(entry: PluginListEntry, search: string): boolean {
  const query = search.trim().toLocaleLowerCase()
  if (!query) {
    return true
  }
  return [
    entry.name,
    entry.pluginKey,
    entry.publisher ?? '',
    entry.description ?? '',
    entry.listing?.marketplaceName ?? '',
    ...entry.categories
  ].some((value) => value.toLocaleLowerCase().includes(query))
}
