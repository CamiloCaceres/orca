import type {
  PluginMarketplaceEntry,
  PluginMarketplaceGitSource
} from '../../shared/plugins/plugin-marketplace'
import { selectPluginCatalogRelease } from '../../shared/plugins/plugin-catalog'
import type { PluginCatalogRelease } from '../../shared/plugins/plugin-catalog-release'

export type PluginMarketplaceSourceState = {
  id: string
  source: PluginMarketplaceGitSource
  addedAt: number
  marketplace: {
    name: string
    owner: string
    resolvedCommit: string
    fetchedAt: number
  } | null
  stale: boolean
  official: boolean
  error?: string
}

export type PluginMarketplaceListing = {
  marketplaceSourceId: string
  marketplaceName: string
  marketplaceOwner: string
  marketplaceCommit: string
  pluginKey: string
  source: PluginMarketplaceEntry['source']
  description?: string
  categories: string[]
  official: boolean
  bundled: boolean
  blockedByKillList?: { reason: string; advisoryUrl?: string }
  /** The release offered to this host: the newest it can install, else the one needing the least
   *  newer Orca. Absent for v1 catalogs. */
  release?: PluginCatalogRelease
  /** Every release the catalog lists for this plugin, newest first. */
  releases?: PluginCatalogRelease[]
} & PluginCatalogListingDetails

/** Display fields a release carries, flattened so list rows need not know release records. */
export type PluginCatalogListingDetails = {
  name?: string
  version?: string
  license?: string
  repository?: string
  homepage?: string
  updatedAt?: string
  changelog?: string
}

const DETAIL_KEYS = [
  'name',
  'license',
  'repository',
  'homepage',
  'updatedAt',
  'changelog'
] as const satisfies readonly (keyof PluginCatalogListingDetails & keyof PluginCatalogRelease)[]

/** The release to offer this host; without a host version, the newest. */
export function offeredCatalogRelease(
  releases: readonly PluginCatalogRelease[] | undefined,
  hostVersion: string | null
): PluginCatalogRelease | undefined {
  if (!releases) {
    return undefined
  }
  return hostVersion ? selectPluginCatalogRelease(releases, hostVersion) : releases[0]
}

export function pluginCatalogListingDetails(
  release: PluginCatalogRelease | undefined
): PluginCatalogListingDetails {
  if (!release) {
    return {}
  }
  const details: PluginCatalogListingDetails = { version: release.version }
  for (const key of DETAIL_KEYS) {
    const value = release[key]
    if (value !== undefined) {
      details[key] = value
    }
  }
  return details
}
