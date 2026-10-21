import { Puzzle } from 'lucide-react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { PluginListGroup } from '../plugin-catalog/PluginListGroup'
import { PluginListRow } from '../plugin-catalog/PluginListRow'
import { pluginListEntryFromInstalled } from '../plugin-catalog/plugin-list-entries'
import { PluginManager } from './PluginManager'
import type { InstalledRowHandlers } from './PluginManagerRows'
import { PluginChips } from '../plugin-catalog/PluginChips'
import type { PluginLogsState } from './use-plugin-logs'
import type { PluginPageNavigation } from './use-plugin-page-navigation'

type PluginSettingsOverviewProps = {
  featureEnabled: boolean
  settingsError: string | null
  loading: boolean
  error: string | null
  plugins: PluginHostListEntry[]
  busyPluginKeys: ReadonlySet<string>
  /** Records a review decision made on the plugin's page. */
  onConsent: (
    pluginKey: string,
    reviewedFingerprint: string,
    decision: 'approve' | 'keep-disabled'
  ) => Promise<void>
  handlers: Omit<InstalledRowHandlers, 'onCheckUpdate'>
  onRefresh: () => Promise<void>
  onMarketplaceInstalled: (pluginKeys: string | readonly string[]) => Promise<void>
  /** Removes a plugin installed moments ago without leaving its page. */
  onUndoInstall: (pluginKey: string) => Promise<void>
  logsByPlugin: Readonly<Record<string, PluginLogsState>>
  onShowLogs: (pluginKey: string) => void
  onOpenShortcuts: () => void
  sourcesOpen: boolean
  setSourcesOpen: (open: boolean) => void
  page: PluginPageNavigation
}

/** The Settings body card; the section body is transparent so each block draws its own. */
function SettingsCard({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/50 shadow-xs', className)}>
      {children}
    </div>
  )
}

/** With plugins off (only by policy): what off means and who is installed (inert). */
function PluginsOffState({
  plugins
}: {
  plugins: readonly PluginHostListEntry[]
}): React.JSX.Element {
  return (
    <>
      {/* Why no switch: plugins are on; only a policy can turn them off, so this only explains. */}
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 py-2.5 pr-3 pl-4">
        <Puzzle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">
            {translate(
              'auto.components.settings.PluginSettingsOverview.offTitle',
              'Plugins are off'
            )}
          </span>
          <span className="text-muted-foreground">
            {' · '}
            {translate(
              'auto.components.settings.PluginSettingsOverview.offShort',
              'Nothing from your plugins runs.'
            )}
          </span>
        </p>
      </div>
      {plugins.length > 0 ? (
        <SettingsCard className="@container/plugin-list overflow-hidden">
          <PluginListGroup
            title={translate('auto.components.settings.PluginManager.installed', 'Installed')}
            aside={translate(
              'auto.components.settings.PluginSettingsOverview.pausedCount',
              '{{value0}} paused',
              { value0: plugins.length }
            )}
          >
            {plugins.map((plugin) => {
              const entry = pluginListEntryFromInstalled(plugin)
              return (
                <PluginListRow
                  key={plugin.pluginKey}
                  entry={entry}
                  description={entry.description ?? ''}
                  chips={<PluginChips entry={entry} />}
                  dimmed
                  inert
                />
              )
            })}
          </PluginListGroup>
        </SettingsCard>
      ) : null}
    </>
  )
}

export function PluginSettingsOverview({
  featureEnabled,
  settingsError,
  loading,
  error,
  plugins,
  busyPluginKeys,
  onConsent,
  handlers,
  onRefresh,
  onMarketplaceInstalled,
  onUndoInstall,
  logsByPlugin,
  onShowLogs,
  onOpenShortcuts,
  sourcesOpen,
  setSourcesOpen,
  page
}: PluginSettingsOverviewProps): React.JSX.Element {
  return (
    <>
      {featureEnabled ? null : <PluginsOffState plugins={plugins} />}
      {settingsError ? <p className="text-xs text-destructive">{settingsError}</p> : null}
      {featureEnabled ? (
        <PluginManager
          plugins={plugins}
          pluginsLoading={loading}
          pluginsError={error}
          busyPluginKeys={busyPluginKeys}
          onConsent={onConsent}
          handlers={handlers}
          onRefreshInstalled={onRefresh}
          onInstalled={onMarketplaceInstalled}
          logsByPlugin={logsByPlugin}
          onShowLogs={onShowLogs}
          onOpenShortcuts={onOpenShortcuts}
          page={page}
          sourcesOpen={sourcesOpen}
          setSourcesOpen={setSourcesOpen}
          onUndoInstall={onUndoInstall}
        />
      ) : null}
    </>
  )
}
