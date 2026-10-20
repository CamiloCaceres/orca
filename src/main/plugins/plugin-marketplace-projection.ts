import type {
  PluginMarketplaceEntry,
  PluginMarketplaceGitSource
} from '../../shared/plugins/plugin-marketplace'
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
  /** Exact release the catalog vouches for; absent for v1 catalogs. */
  release?: PluginCatalogRelease
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
