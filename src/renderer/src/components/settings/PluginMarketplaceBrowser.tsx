import { useMemo, useState } from 'react'
import { Blocks, Loader2, RefreshCw, SearchX, Settings2, Store } from 'lucide-react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { PluginCatalogEmptyState } from '../plugin-catalog/PluginCatalogEmptyState'
import {
  matchesPluginSearch,
  pluginListEntryFromListing
} from '../plugin-catalog/plugin-list-entries'
import {
  PluginCatalogLayout,
  type PluginCatalogFilter
} from '../plugin-catalog/PluginCatalogLayout'
import { Button } from '../ui/button'
import { PluginMarketplaceListingRow } from './PluginMarketplaceListingRow'
import { PluginMarketplacePreviewDialog } from './PluginMarketplacePreviewDialog'
import { PluginMarketplaceSourceDialog } from './PluginMarketplaceSourceDialog'
import { usePluginCatalog } from './use-plugin-catalog'

type PluginMarketplaceBrowserProps = {
  installedPlugins: readonly PluginHostListEntry[]
  onInstalled: (pluginKey: string) => Promise<void>
  onRefreshInstalled?: () => Promise<void>
  renderInstalledContent?: (search: string) => React.ReactNode
}

export function PluginMarketplaceBrowser({
  installedPlugins,
  onInstalled,
  onRefreshInstalled,
  renderInstalledContent
}: PluginMarketplaceBrowserProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PluginCatalogFilter>('all')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const {
    sources,
    listings,
    loading,
    refreshBusy,
    error,
    preview,
    previewMode,
    previewBusyKey,
    installBusy,
    actionError,
    installedByKey,
    currentVersion,
    loadMarketplaceData,
    refresh,
    openPreview,
    installPreview,
    closePreview
  } = usePluginCatalog({ installedPlugins, onInstalled, onRefreshInstalled })
  const visibleListings = useMemo(
    () =>
      listings.filter((listing) =>
        matchesPluginSearch(pluginListEntryFromListing(listing), search)
      ),
    [listings, search]
  )

  return (
    <>
      <PluginCatalogLayout
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        allCount={listings.length}
        installedCount={installedPlugins.length}
        toolbar={
          <>
            <Button variant="ghost" size="xs" onClick={() => setSourcesOpen(true)}>
              <Settings2 />
              {translate(
                'auto.components.settings.PluginMarketplaceBrowser.manageSources',
                'Manage sources'
              )}
            </Button>
            <Button variant="ghost" size="xs" disabled={refreshBusy} onClick={() => void refresh()}>
              <RefreshCw className={refreshBusy ? 'animate-spin' : undefined} />
              {refreshBusy
                ? translate(
                    'auto.components.settings.PluginMarketplaceBrowser.refreshing',
                    'Refreshing…'
                  )
                : translate('auto.components.settings.PluginMarketplaceBrowser.refresh', 'Refresh')}
            </Button>
          </>
        }
      >
        {filter === 'installed' ? (
          renderInstalledContent ? (
            renderInstalledContent(search)
          ) : (
            <PluginCatalogEmptyState
              icon={Blocks}
              title={translate(
                'auto.components.settings.PluginMarketplaceBrowser.noInstalledTitle',
                'No plugins installed'
              )}
              description={translate(
                'auto.components.settings.PluginMarketplaceBrowser.noInstalled',
                'Plugins you install appear here.'
              )}
            />
          )
        ) : loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[13px] text-muted-foreground">
            <Loader2 className="animate-spin" />
            {translate(
              'auto.components.settings.PluginMarketplaceBrowser.loading',
              'Loading marketplace plugins…'
            )}
          </div>
        ) : (
          <>
            {error ? (
              <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <p>{error}</p>
                <Button variant="outline" size="xs" className="mt-2" onClick={loadMarketplaceData}>
                  {translate(
                    'auto.components.settings.PluginMarketplaceBrowser.tryAgain',
                    'Try again'
                  )}
                </Button>
              </div>
            ) : null}
            {sources.length === 0 ? (
              <PluginCatalogEmptyState
                icon={Store}
                title={translate(
                  'auto.components.settings.PluginMarketplaceBrowser.noSourcesTitle',
                  'No marketplaces configured'
                )}
                description={translate(
                  'auto.components.settings.PluginMarketplaceBrowser.noSources',
                  'Add an official, community, or private Git marketplace to browse plugins.'
                )}
                action={
                  <Button variant="outline" size="sm" onClick={() => setSourcesOpen(true)}>
                    {translate(
                      'auto.components.settings.PluginMarketplaceBrowser.addSource',
                      'Add marketplace'
                    )}
                  </Button>
                }
              />
            ) : visibleListings.length === 0 ? (
              search ? (
                <PluginCatalogEmptyState
                  icon={SearchX}
                  title={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.noResultsTitle',
                    'No matching plugins'
                  )}
                  description={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.noResults',
                    'No marketplace plugins match this search.'
                  )}
                  action={
                    <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                      {translate(
                        'auto.components.settings.PluginMarketplaceBrowser.clearSearch',
                        'Clear search'
                      )}
                    </Button>
                  }
                />
              ) : (
                <PluginCatalogEmptyState
                  icon={Blocks}
                  title={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.emptyTitle',
                    'Nothing listed yet'
                  )}
                  description={translate(
                    'auto.components.settings.PluginMarketplaceBrowser.empty',
                    'The configured marketplaces do not list any plugins.'
                  )}
                />
              )
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleListings.map((listing) => (
                  <PluginMarketplaceListingRow
                    key={`${listing.marketplaceSourceId}:${listing.pluginKey}`}
                    listing={listing}
                    installed={installedByKey.get(listing.pluginKey) ?? null}
                    busy={previewBusyKey === listing.pluginKey}
                    onPreview={(entry, update) => void openPreview(entry, update)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </PluginCatalogLayout>
      <PluginMarketplaceSourceDialog
        open={sourcesOpen}
        sources={sources}
        onOpenChange={setSourcesOpen}
        onChanged={loadMarketplaceData}
      />
      <PluginMarketplacePreviewDialog
        key={preview ? `${preview.pluginKey}:${preview.contentHash}` : 'closed'}
        preview={preview}
        mode={previewMode}
        busy={installBusy}
        currentVersion={currentVersion}
        error={actionError}
        onClose={closePreview}
        onConfirm={() => void installPreview()}
      />
    </>
  )
}
