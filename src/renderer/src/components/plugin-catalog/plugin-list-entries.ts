import type {
  PluginHostListEntry,
  PluginMarketplaceHostListing,
  PluginMarketplaceHostSourceState
} from '../../../../preload/api-types'
import { satisfiesOrcaEngineRange } from '../../../../shared/plugins/plugin-manifest'
import type { PluginCatalogType } from '../../../../shared/plugins/plugin-catalog-release'
import { compareAppVersions } from '../../../../shared/app-version'
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
  /** What the catalog says this release contributes; empty when unknown. */
  types: readonly PluginCatalogType[]
  /** Oldest Orca the catalog release supports, e.g. "1.6.0". */
  minimumOrca: string | null
  /** A newer catalog version than the installed one that this Orca can run, if any. */
  updateVersion: string | null
  /** Every catalog that lists this plugin, for filtering by catalog. */
  catalogIds: readonly string[]
  installed: PluginHostListEntry | null
  listing: PluginMarketplaceHostListing | null
}

// Why: v2 catalogs flatten release fields onto the listing; the raw record covers older hosts.
function catalogVersion(listing: PluginMarketplaceHostListing): string | null {
  return listing.version ?? listing.release?.version ?? null
}

function newerCatalogVersion(
  plugin: PluginHostListEntry,
  listing: PluginMarketplaceHostListing | null,
  orcaVersion: string | null
): string | null {
  const version = listing ? catalogVersion(listing) : null
  if (!version || plugin.source?.kind !== 'marketplace') {
    return null
  }
  const minimumOrca = listing?.release?.minimumOrca
  // Why: an update this Orca can't run isn't one to offer; Orca itself needs updating first.
  if (minimumOrca && orcaVersion && !satisfiesOrcaEngineRange(orcaVersion, `>=${minimumOrca}`)) {
    return null
  }
  return compareAppVersions(version, plugin.version) > 0 ? version : null
}

export function pluginListEntryFromInstalled(
  plugin: PluginHostListEntry,
  listing: PluginMarketplaceHostListing | null = null,
  {
    catalogIds = [],
    orcaVersion = null
  }: { catalogIds?: readonly string[]; orcaVersion?: string | null } = {}
): PluginListEntry {
  return {
    pluginKey: plugin.pluginKey,
    name: plugin.name,
    publisher: plugin.publisher || null,
    version: plugin.version,
    description: plugin.description ?? listing?.description ?? null,
    official: plugin.official,
    categories: listing?.categories ?? [],
    types: listing?.release?.types ?? [],
    minimumOrca: listing?.release?.minimumOrca ?? null,
    updateVersion: newerCatalogVersion(plugin, listing, orcaVersion),
    catalogIds,
    installed: plugin,
    listing
  }
}

export function pluginListEntryFromListing(
  listing: PluginMarketplaceHostListing,
  catalogIds: readonly string[] = [listing.marketplaceSourceId]
): PluginListEntry {
  return {
    pluginKey: listing.pluginKey,
    // Why: older catalogs carry no release name; the key is the only name they have.
    name: listing.name ?? listing.release?.name ?? pluginDisplayNameFromKey(listing.pluginKey),
    publisher: listing.marketplaceOwner || null,
    version: catalogVersion(listing),
    description: listing.description ?? null,
    official: listing.official,
    categories: listing.categories,
    types: listing.release?.types ?? [],
    minimumOrca: listing.release?.minimumOrca ?? null,
    updateVersion: null,
    catalogIds,
    installed: null,
    listing
  }
}

/** The listing from the catalog a plugin was installed from, else the first that lists it. */
function sourceListing(
  plugin: PluginHostListEntry,
  candidates: readonly PluginMarketplaceHostListing[],
  catalogUrlById: ReadonlyMap<string, string>
): PluginMarketplaceHostListing | null {
  const installedFrom = plugin.source?.marketplace?.reference
  return (
    (installedFrom
      ? candidates.find(
          (listing) => catalogUrlById.get(listing.marketplaceSourceId) === installedFrom
        )
      : undefined) ??
    candidates[0] ??
    null
  )
}

/**
 * Installed plugins first, each joined to the catalog it came from, then catalog plugins not
 * installed. A plugin listed by two catalogs shows once, under the first.
 */
export function buildPluginListEntries(
  installed: readonly PluginHostListEntry[],
  listings: readonly PluginMarketplaceHostListing[],
  {
    sources = [],
    orcaVersion = null
  }: { sources?: readonly PluginMarketplaceHostSourceState[]; orcaVersion?: string | null } = {}
): { installed: PluginListEntry[]; available: PluginListEntry[] } {
  const listingsByKey = new Map<string, PluginMarketplaceHostListing[]>()
  for (const listing of listings) {
    listingsByKey.set(listing.pluginKey, [...(listingsByKey.get(listing.pluginKey) ?? []), listing])
  }
  const catalogUrlById = new Map(sources.map((source) => [source.id, source.source.url]))
  const catalogIdsOf = (pluginKey: string): string[] =>
    (listingsByKey.get(pluginKey) ?? []).map((listing) => listing.marketplaceSourceId)
  const installedKeys = new Set(installed.map((plugin) => plugin.pluginKey))
  return {
    installed: installed.map((plugin) =>
      pluginListEntryFromInstalled(
        plugin,
        sourceListing(plugin, listingsByKey.get(plugin.pluginKey) ?? [], catalogUrlById),
        { catalogIds: catalogIdsOf(plugin.pluginKey), orcaVersion }
      )
    ),
    available: [...listingsByKey.entries()]
      .filter(([pluginKey]) => !installedKeys.has(pluginKey))
      .map(([pluginKey, candidates]) =>
        pluginListEntryFromListing(candidates[0], catalogIdsOf(pluginKey))
      )
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
