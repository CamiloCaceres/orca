import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  CircleAlert,
  Info,
  TriangleAlert
} from 'lucide-react'
import type { PluginMarketplaceHostInstallPreview } from '../../../../preload/api-types'
import { satisfiesOrcaEngineRange } from '../../../../shared/plugins/plugin-manifest'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { PluginCatalogAvatar } from '../plugin-catalog/PluginCatalogAvatar'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { PluginAccessSection, PluginAddsSection, PluginLogsSection } from './PluginDetailSections'
import { installedPluginControls, type InstalledRowHandlers } from './PluginManagerRows'
import { PluginChips } from './plugin-row-parts'
import type { PluginLogsState } from './use-plugin-logs'

type PluginDetailPageProps = {
  entry: PluginListEntry
  busy: boolean
  orcaVersion: string | null
  logsState: PluginLogsState | undefined
  handlers: InstalledRowHandlers
  fetchPreview: (
    listing: NonNullable<PluginListEntry['listing']>
  ) => Promise<PluginMarketplaceHostInstallPreview | null>
  onInstall: (entry: PluginListEntry) => void
  onBack: () => void
  onOpenShortcuts: () => void
}

function sourceLabel(entry: PluginListEntry): string {
  const source = entry.installed?.source
  if (entry.installed?.bundled || source?.kind === 'bundled') {
    return translate('auto.components.settings.PluginDetailPage.bundled', 'Bundled with Orca')
  }
  if (source?.kind === 'local-path') {
    return translate('auto.components.settings.PluginDetailPage.localFolder', 'Local folder')
  }
  if (source?.kind === 'git') {
    return translate('auto.components.settings.PluginDetailPage.gitUrl', 'Git URL')
  }
  return entry.listing?.marketplaceName ?? ''
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        data-mono={mono}
        className="min-w-0 truncate text-right data-[mono=true]:font-mono"
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function Alert({
  tone,
  title,
  body,
  action
}: {
  tone: 'info' | 'warning' | 'destructive'
  title: string
  body: string
  action?: React.ReactNode
}): React.JSX.Element {
  const Icon = tone === 'info' ? Info : tone === 'warning' ? TriangleAlert : CircleAlert
  return (
    <div
      role="status"
      data-tone={tone}
      className="mt-5 flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3 text-sm data-[tone=destructive]:border-destructive/35 data-[tone=destructive]:bg-destructive/7 data-[tone=warning]:border-status-warning/45 data-[tone=warning]:bg-status-warning/7"
    >
      <Icon
        aria-hidden="true"
        data-tone={tone}
        className="mt-0.5 size-4 shrink-0 data-[tone=destructive]:text-destructive data-[tone=warning]:text-status-warning"
      />
      <div className="min-w-0 flex-1">
        <p data-tone={tone} className="font-medium data-[tone=destructive]:text-destructive">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  )
}

/** One plugin's page: what it adds, what it can reach, where it came from, and its logs. */
export function PluginDetailPage({
  entry,
  busy,
  orcaVersion,
  logsState,
  handlers,
  fetchPreview,
  onInstall,
  onBack,
  onOpenShortcuts
}: PluginDetailPageProps): React.JSX.Element {
  const plugin = entry.installed
  const listing = entry.listing
  const [preview, setPreview] = useState<PluginMarketplaceHostInstallPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(!plugin && Boolean(listing))
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [entry.pluginKey])

  useEffect(() => {
    if (plugin || !listing) {
      return
    }
    let stale = false
    setPreviewLoading(true)
    void fetchPreview(listing).then((next) => {
      if (!stale) {
        setPreview(next)
        setPreviewLoading(false)
      }
    })
    return () => {
      stale = true
    }
  }, [plugin, listing, fetchPreview])

  const controls = plugin
    ? installedPluginControls(plugin, entry, {
        busy,
        canCheckUpdate: plugin.source?.kind === 'marketplace' && Boolean(listing),
        handlers
      })
    : null
  const tooNew =
    Boolean(entry.minimumOrca && orcaVersion) &&
    !satisfiesOrcaEngineRange(orcaVersion ?? '', `>=${entry.minimumOrca}`)
  const version = plugin?.version ?? preview?.manifest.version ?? entry.version
  // Why: a fetched manifest names the plugin exactly; older catalogs only give its key.
  const name = plugin?.name ?? preview?.manifest.name ?? entry.name
  // Why: "official" is trust, already shown by the verified mark.
  const categories = entry.categories.filter((category) => category !== 'official')
  const description = plugin?.description ?? preview?.manifest.description ?? entry.description
  const repository =
    listing?.source.url ?? (plugin?.source?.kind === 'git' ? plugin.source.reference : null)

  let alert: React.ReactNode = null
  if (plugin?.blockedByKillList) {
    alert = (
      <Alert
        tone="destructive"
        title={translate('auto.components.settings.PluginSettingsRow.blocked', 'Blocked')}
        body={translate(
          'auto.components.settings.PluginSettingsRow.killListMessage',
          "Orca's safety list disabled this plugin: {{value0}}",
          { value0: plugin.blockedByKillList.reason }
        )}
      />
    )
  } else if (controls?.kind === 'error') {
    alert = (
      <Alert
        tone="destructive"
        title={translate(
          'auto.components.settings.PluginDetailPage.stoppedTitle',
          'Stopped after an error'
        )}
        body={translate(
          'auto.components.settings.PluginDetailPage.stoppedBody',
          'Its code kept crashing, so Orca stopped restarting it. It’s still switched on; Restart tries again.'
        )}
      />
    )
  } else if (controls?.kind === 'invalid') {
    alert = (
      <Alert
        tone="destructive"
        title={translate(
          'auto.components.settings.PluginDetailPage.invalidTitle',
          'Orca can’t load this plugin'
        )}
        body={typeof controls.description === 'string' ? controls.description : ''}
      />
    )
  } else if (controls?.kind === 'review') {
    alert = (
      <Alert
        tone="info"
        title={translate('auto.components.settings.PluginSettingsRow.needsReview', 'Needs review')}
        body={translate(
          'auto.components.settings.PluginDetailPage.reviewBody',
          'Review what it adds and what it can reach, then enable it. Nothing runs before that.'
        )}
      />
    )
  } else if (!plugin && tooNew) {
    alert = (
      <Alert
        tone="warning"
        title={translate(
          'auto.components.settings.PluginDetailPage.needsOrcaTitle',
          'Needs Orca {{value0}} or later',
          {
            value0: entry.minimumOrca ?? ''
          }
        )}
        body={translate(
          'auto.components.settings.PluginDetailPage.needsOrcaBody',
          'You have Orca {{value0}}. Update Orca to install this plugin.',
          {
            value0: orcaVersion ?? ''
          }
        )}
      />
    )
  }

  return (
    <article aria-labelledby="plugin-detail-heading" className="@container/plugin-detail">
      <Button variant="ghost" size="xs" className="-ml-2" onClick={onBack}>
        <ChevronLeft />
        {translate('auto.components.settings.PluginDetailPage.back', 'Plugins')}
      </Button>
      <div className="mt-4 grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-x-3.5 @max-xl/plugin-detail:grid-cols-[2.75rem_minmax(0,1fr)]">
        <PluginCatalogAvatar name={entry.name} className="size-11 rounded-xl text-xs" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="plugin-detail-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold outline-none"
            >
              {name}
            </h3>
            {entry.official ? (
              <BadgeCheck
                className="plugin-security-chrome size-4 text-muted-foreground"
                role="img"
                aria-label={translate(
                  'auto.components.pluginCatalog.PluginListRow.official',
                  'Official'
                )}
              />
            ) : null}
            <PluginChips entry={entry} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[entry.publisher, version ? `v${version}` : null, sourceLabel(entry)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {controls ? <div className="mt-2">{controls.status}</div> : null}
        </div>
        <div className="flex items-center gap-2 @max-xl/plugin-detail:col-start-2 @max-xl/plugin-detail:mt-3">
          {controls ? (
            <>
              {controls.action}
              {controls.toggle}
              {controls.more}
            </>
          ) : (
            <Button
              size="sm"
              disabled={tooNew || Boolean(listing?.blockedByKillList)}
              onClick={() => onInstall(entry)}
            >
              {translate('auto.components.settings.PluginDetailPage.install', 'Install…')}
            </Button>
          )}
        </div>
      </div>
      {alert}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_14.5rem] gap-7 @max-2xl/plugin-detail:grid-cols-1 @max-2xl/plugin-detail:gap-0">
        <div className="min-w-0">
          {description ? <p className="mt-5 max-w-prose text-sm leading-6">{description}</p> : null}
          <PluginAddsSection
            plugin={plugin}
            preview={preview}
            types={entry.types}
            onOpenShortcuts={onOpenShortcuts}
          />
          <PluginAccessSection
            capabilities={
              plugin?.capabilities ??
              preview?.manifest.capabilities.map((capability) => ({
                kind: capability.kind,
                description: capability.kind
              })) ??
              (previewLoading ? null : [])
            }
            runsCode={plugin?.hasWorker ?? entry.types.includes('worker')}
            loading={previewLoading}
          />
          {plugin?.hasWorker ? <PluginLogsSection state={logsState} /> : null}
        </div>
        <aside className="mt-6">
          <h3 className="mb-2 text-2xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            {translate('auto.components.settings.PluginDetailPage.info', 'Info')}
          </h3>
          <dl>
            {version ? (
              <InfoRow
                label={translate('auto.components.settings.PluginDetailPage.version', 'Version')}
                value={version}
              />
            ) : null}
            {entry.updateVersion ? (
              <InfoRow
                label={translate('auto.components.settings.PluginDetailPage.latest', 'Latest')}
                value={entry.updateVersion}
              />
            ) : null}
            {entry.minimumOrca ? (
              <InfoRow
                label={translate('auto.components.settings.PluginDetailPage.requires', 'Requires')}
                value={translate(
                  'auto.components.settings.PluginDetailPage.requiresValue',
                  'Orca {{value0}} or later',
                  {
                    value0: entry.minimumOrca
                  }
                )}
              />
            ) : null}
            {categories.length > 0 ? (
              <InfoRow
                label={translate(
                  'auto.components.settings.PluginDetailPage.categories',
                  'Categories'
                )}
                value={categories.join(', ')}
              />
            ) : null}
            <InfoRow
              label={translate('auto.components.settings.PluginDetailPage.pluginId', 'Plugin ID')}
              value={entry.pluginKey}
              mono
            />
            {plugin?.source?.contentHash ? (
              <InfoRow
                label={translate('auto.components.settings.PluginDetailPage.content', 'Content')}
                value={plugin.source.contentHash}
                mono
              />
            ) : null}
          </dl>
          {repository && repository.startsWith('https://') ? (
            <Button
              variant="link"
              size="xs"
              className="mt-2 -ml-2"
              onClick={() => void window.api.shell.openUrl(repository)}
            >
              {translate('auto.components.settings.PluginDetailPage.repository', 'Repository')}
              <ArrowUpRight />
            </Button>
          ) : null}
        </aside>
      </div>
    </article>
  )
}
