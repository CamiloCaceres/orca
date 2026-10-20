import { useEffect, useMemo, useState } from 'react'
import { Blocks, RefreshCw, SearchX, Settings2 } from 'lucide-react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
  PluginCatalogLayout,
  type PluginCatalogFilter
} from '../plugin-catalog/PluginCatalogLayout'
import { PluginCatalogEmptyState } from '../plugin-catalog/PluginCatalogEmptyState'
import { PluginListGroup } from '../plugin-catalog/PluginListGroup'
import { PluginListSkeleton } from '../plugin-catalog/PluginListSkeleton'
import {
  buildPluginListEntries,
  matchesPluginSearch,
  type PluginListEntry
} from '../plugin-catalog/plugin-list-entries'
import { InstalledPluginRow, type InstalledRowHandlers } from './PluginManagerRows'
import { PluginMarketplacePreviewDialog } from './PluginMarketplacePreviewDialog'
import { PluginMarketplaceSourceDialog } from './PluginMarketplaceSourceDialog'
import { usePluginCatalog } from './use-plugin-catalog'
import { CatalogNotice, PluginCatalogGroups } from './PluginCatalogGroups'
import { PluginFilterPopover } from './PluginFilterPopover'
import { PluginUpdateAllDialog } from './PluginUpdateAllDialog'
import {
  matchesPluginFilter,
  NO_PLUGIN_LIST_FILTER,
  pluginFilterCategories,
  pluginFilterSize,
  type PluginListFilter
} from '../plugin-catalog/plugin-list-filter'
import { PluginDetailPage } from './PluginDetailPage'
import { useOrcaVersion, usePluginPageNavigation } from './use-plugin-page-navigation'
import type { PluginLogsState } from './use-plugin-logs'

function resultCountLabel(count: number): string {
  return count === 1
    ? translate('auto.components.settings.PluginManager.resultCountOne', '1 plugin matches')
    : translate('auto.components.settings.PluginManager.resultCount', '{{value0}} plugins match', {
        value0: count
      })
}

/** Rows a group shows before "Show N more"; search and filters show everything. */
export const PLUGIN_GROUP_ROW_CAP = 6

type PluginManagerProps = {
  plugins: readonly PluginHostListEntry[]
  pluginsLoading: boolean
  pluginsError: string | null
  busyPluginKeys: ReadonlySet<string>
  handlers: Omit<InstalledRowHandlers, 'onCheckUpdate'>
  onRefreshInstalled: () => Promise<void>
  onInstalled: (pluginKey: string) => Promise<void>
  logsByPlugin: Readonly<Record<string, PluginLogsState>>
  onShowLogs: (pluginKey: string) => void
  onOpenShortcuts: () => void
  /** A plugin page replaces the whole pane body, so the parent hides its other blocks. */
  onPageOpenChange: (open: boolean) => void
}

export function PluginManager({
  plugins,
  pluginsLoading,
  pluginsError,
  busyPluginKeys,
  handlers,
  onRefreshInstalled,
  onInstalled,
  logsByPlugin,
  onShowLogs,
  onOpenShortcuts,
  onPageOpenChange
}: PluginManagerProps): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PluginCatalogFilter>('all')
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [listFilter, setListFilter] = useState<PluginListFilter>(NO_PLUGIN_LIST_FILTER)
  const [updateAllOpen, setUpdateAllOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set())
  const catalog = usePluginCatalog({ installedPlugins: plugins, onInstalled, onRefreshInstalled })
  const { openKey, open, back } = usePluginPageNavigation()
  const orcaVersion = useOrcaVersion()
  useEffect(() => onPageOpenChange(openKey !== null), [openKey, onPageOpenChange])

  const entries = useMemo(
    () => buildPluginListEntries(plugins, catalog.listings),
    [plugins, catalog.listings]
  )
  const query = search.trim()
  const narrowed = Boolean(query) || pluginFilterSize(listFilter) > 0
  const matches = (entry: PluginListEntry): boolean =>
    matchesPluginSearch(entry, query) && matchesPluginFilter(entry, listFilter)
  const installed = entries.installed.filter(matches)
  const updates = entries.installed.filter((entry) => entry.updateVersion)
  const visibleInstalled = filter === 'updates' ? updates.filter(matches) : installed
  const capped = (groupId: string, rows: PluginListEntry[]): PluginListEntry[] =>
    narrowed || filter !== 'all' || expandedGroups.has(groupId)
      ? rows
      : rows.slice(0, PLUGIN_GROUP_ROW_CAP)
  const showAll = (groupId: string) => () =>
    setExpandedGroups((current) => new Set(current).add(groupId))

  const openEntry = (pluginKey: string): void => {
    open(pluginKey)
    if (plugins.find((plugin) => plugin.pluginKey === pluginKey)?.hasWorker) {
      onShowLogs(pluginKey)
    }
  }
  const rowHandlers: InstalledRowHandlers = {
    ...handlers,
    onOpen: openEntry,
    onViewLogs: openEntry,
    onCheckUpdate: (entry) => {
      if (entry.listing) {
        void catalog.openPreview(entry.listing, true)
      }
    }
  }
  const installedRow = (entry: PluginListEntry) => (
    <InstalledPluginRow
      key={entry.pluginKey}
      entry={entry}
      busy={busyPluginKeys.has(entry.pluginKey) || catalog.previewBusyKey === entry.pluginKey}
      canCheckUpdate={entry.installed?.source?.kind === 'marketplace' && Boolean(entry.listing)}
      handlers={rowHandlers}
    />
  )

  const visibleAvailableCount = entries.available.filter(
    (entry) =>
      catalog.sources.some((source) => source.id === entry.listing?.marketplaceSourceId) &&
      matches(entry)
  ).length
  const showInstalledGroup = filter !== 'all' || visibleInstalled.length > 0
  const nothingMatches =
    narrowed && visibleInstalled.length === 0 && (filter !== 'all' || visibleAvailableCount === 0)

  const installedGroup = pluginsLoading ? (
    <PluginListGroup
      title={translate('auto.components.settings.PluginManager.installed', 'Installed')}
      showHeading={filter === 'all'}
    >
      <PluginListSkeleton rows={3} />
    </PluginListGroup>
  ) : pluginsError ? (
    <PluginListGroup
      title={translate('auto.components.settings.PluginManager.installed', 'Installed')}
      showHeading={filter === 'all'}
      notice={
        <CatalogNotice
          tone="error"
          title={translate(
            'auto.components.settings.PluginManager.installedFailedTitle',
            'Couldn’t read your installed plugins.'
          )}
          body={pluginsError}
          actions={
            <Button variant="ghost" size="xs" onClick={() => void onRefreshInstalled()}>
              {translate('auto.components.settings.PluginManager.retry', 'Retry')}
            </Button>
          }
        />
      }
    />
  ) : showInstalledGroup && visibleInstalled.length > 0 ? (
    <PluginListGroup
      title={
        filter === 'updates'
          ? translate('auto.components.settings.PluginManager.updatesTitle', 'Updates')
          : translate('auto.components.settings.PluginManager.installed', 'Installed')
      }
      showHeading={filter === 'all'}
      aside={
        filter === 'updates' && updates.length > 0 ? (
          <Button variant="outline" size="xs" onClick={() => setUpdateAllOpen(true)}>
            {translate('auto.components.settings.PluginManager.updateAll', 'Update all…')}
          </Button>
        ) : (
          String(visibleInstalled.length)
        )
      }
      hiddenCount={visibleInstalled.length - capped('installed', visibleInstalled).length}
      onShowAll={showAll('installed')}
    >
      {capped('installed', visibleInstalled).map(installedRow)}
    </PluginListGroup>
  ) : null

  const openedEntry = openKey
    ? ([...entries.installed, ...entries.available].find((entry) => entry.pluginKey === openKey) ??
      null)
    : null
  // Why: a plugin removed while its page is open closes the page, so a reinstall starts fresh.
  const pageGone = openKey !== null && openedEntry === null && !pluginsLoading && !catalog.loading
  useEffect(() => {
    if (pageGone) {
      back()
    }
  }, [pageGone, back])
  const dialogs = (
    <>
      <PluginUpdateAllDialog
        open={updateAllOpen}
        entries={updates}
        onClose={() => setUpdateAllOpen(false)}
        onUpdated={async () => {
          await onRefreshInstalled()
        }}
      />
      <PluginMarketplaceSourceDialog
        open={sourcesOpen}
        sources={catalog.sources}
        onOpenChange={setSourcesOpen}
        onChanged={catalog.loadMarketplaceData}
      />
      <PluginMarketplacePreviewDialog
        key={
          catalog.preview ? `${catalog.preview.pluginKey}:${catalog.preview.contentHash}` : 'closed'
        }
        preview={catalog.preview}
        mode={catalog.previewMode}
        busy={catalog.installBusy}
        currentVersion={catalog.currentVersion}
        accessOnly={catalog.previewAccessOnly}
        error={catalog.actionError}
        onClose={catalog.closePreview}
        onConfirm={() => void catalog.installPreview()}
      />
    </>
  )
  if (openedEntry) {
    return (
      <>
        <PluginDetailPage
          entry={openedEntry}
          busy={
            busyPluginKeys.has(openedEntry.pluginKey) ||
            catalog.previewBusyKey === openedEntry.pluginKey
          }
          orcaVersion={orcaVersion}
          logsState={logsByPlugin[openedEntry.pluginKey]}
          handlers={rowHandlers}
          fetchPreview={catalog.fetchPreview}
          onInstall={(target) => {
            if (target.listing) {
              void catalog.openPreview(target.listing, false, true)
            }
          }}
          onBack={back}
          onOpenShortcuts={onOpenShortcuts}
        />
        {dialogs}
      </>
    )
  }

  return (
    <>
      <PluginCatalogLayout
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        installedCount={plugins.length}
        updateCount={updates.length}
        toolbar={
          <>
            <PluginFilterPopover
              filter={listFilter}
              categories={pluginFilterCategories([...entries.installed, ...entries.available])}
              sources={catalog.sources}
              onChange={setListFilter}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate(
                    'auto.components.settings.PluginManager.sourcesLabel',
                    'Catalog sources'
                  )}
                  onClick={() => setSourcesOpen(true)}
                >
                  <Settings2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.settings.PluginManager.sourcesLabel',
                  'Catalog sources'
                )}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={catalog.refreshBusy}
                  aria-label={translate(
                    'auto.components.settings.PluginManager.refreshLabel',
                    'Refresh catalogs'
                  )}
                  onClick={() => void catalog.refresh()}
                >
                  <RefreshCw className={catalog.refreshBusy ? 'animate-spin' : undefined} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate(
                  'auto.components.settings.PluginManager.refreshLabel',
                  'Refresh catalogs'
                )}
              </TooltipContent>
            </Tooltip>
          </>
        }
      >
        {nothingMatches ? (
          <PluginCatalogEmptyState
            icon={SearchX}
            title={translate(
              'auto.components.settings.PluginManager.noResultsTitle',
              'No plugins match “{{value0}}”',
              {
                value0: query
              }
            )}
            description={translate(
              'auto.components.settings.PluginManager.noResults',
              'Search looks at names, descriptions, publishers and categories.'
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
        ) : filter !== 'all' &&
          !pluginsLoading &&
          !pluginsError &&
          visibleInstalled.length === 0 ? (
          <PluginCatalogEmptyState
            icon={Blocks}
            title={translate(
              'auto.components.settings.PluginManager.noneInstalledTitle',
              'No plugins installed'
            )}
            description={translate(
              'auto.components.settings.PluginManager.noneInstalled',
              'Browse the catalog for themes, languages and commands, or add one from a folder or Git.'
            )}
            action={
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                {translate(
                  'auto.components.settings.PluginManager.browseAll',
                  'Browse all plugins'
                )}
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card/50 shadow-xs">
            {installedGroup}
            <PluginCatalogGroups
              catalog={catalog}
              available={entries.available}
              matches={matches}
              narrowed={narrowed}
              filter={filter}
              capped={capped}
              showAll={showAll}
              openEntry={openEntry}
              openSources={() => setSourcesOpen(true)}
              orcaVersion={orcaVersion}
            />
          </div>
        )}
        <p className="sr-only" aria-live="polite">
          {query
            ? resultCountLabel(
                visibleInstalled.length + (filter === 'all' ? visibleAvailableCount : 0)
              )
            : ''}
        </p>
      </PluginCatalogLayout>
      {dialogs}
    </>
  )
}
