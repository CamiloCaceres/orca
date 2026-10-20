import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Trash2
} from 'lucide-react'
import type { PluginHostListEntry, PluginHostLogLine } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { PluginCatalogAvatar } from '../plugin-catalog/PluginCatalogAvatar'
import { invalidPluginErrorMessage } from './plugin-error-presentation'
import { cn } from '@/lib/utils'
import { usePluginLanguagePackStore } from '@/store/plugin-language-packs'
import { usePluginSyntaxFailureStore } from '@/store/plugin-syntax-failures'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../ui/dropdown-menu'
import { SettingsSwitch } from './SettingsFormControls'
import {
  isPluginEnabled,
  pluginNeedsReview,
  pluginStatusKind,
  pluginStatusLabel,
  type PluginStatusKind
} from './plugin-status-presentation'

export type PluginLogsState = {
  loading: boolean
  lines?: PluginHostLogLine[]
  error?: string
}

type PluginSettingsRowProps = {
  plugin: PluginHostListEntry
  busy: boolean
  logsOpen: boolean
  logsState?: PluginLogsState
  onReview: (pluginKey: string) => void
  onToggleEnabled: (plugin: PluginHostListEntry) => void
  onToggleLogs: (pluginKey: string) => void
  onRollbackRequest: (pluginKey: string) => void
  onRemoveRequest: (pluginKey: string) => void
}

const STATUS_PILL_CLASS: Record<PluginStatusKind, string> = {
  blocked: 'border-destructive/25 bg-destructive/8 text-destructive',
  review: 'border-foreground/20 bg-foreground/8 text-foreground',
  restarting: 'border-foreground/20 bg-foreground/8 text-foreground',
  error: 'border-destructive/25 bg-destructive/8 text-destructive',
  invalid: 'border-destructive/25 bg-destructive/8 text-destructive',
  disabled: 'border-border bg-muted/40 text-muted-foreground',
  running: 'border-status-success-border bg-status-success-background text-status-success',
  enabled: 'border-status-success-border bg-status-success-background text-status-success'
}

function PluginLogs({ pluginKey, state }: { pluginKey: string; state?: PluginLogsState }) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted/40">
      {state?.loading ? (
        <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {translate('auto.components.settings.PluginSettingsRow.loadingLogs', 'Loading logs…')}
        </div>
      ) : state?.error ? (
        <p className="p-3 text-xs text-destructive">{state.error}</p>
      ) : (
        <>
          <pre
            tabIndex={0}
            className="max-h-44 overflow-auto p-3 font-mono text-[11px] leading-5 scrollbar-sleek"
          >
            {state?.lines?.length
              ? state.lines
                  .map(
                    (entry) =>
                      `${new Date(entry.ts).toLocaleTimeString()} ${entry.level.padEnd(5)} ${entry.line}`
                  )
                  .join('\n')
              : translate(
                  'auto.components.settings.PluginSettingsRow.noLogs',
                  'No log lines recorded.'
                )}
          </pre>
          <div className="flex flex-wrap justify-between gap-2 border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              {translate(
                'auto.components.settings.PluginSettingsRow.logCount',
                'Last {{value0}} of up to 200 retained lines',
                { value0: state?.lines?.length ?? 0 }
              )}
            </span>
            <span className="font-mono">{pluginKey}</span>
          </div>
        </>
      )}
    </div>
  )
}

export function PluginSettingsRow({
  plugin,
  busy,
  logsOpen,
  logsState,
  onReview,
  onToggleEnabled,
  onToggleLogs,
  onRollbackRequest,
  onRemoveRequest
}: PluginSettingsRowProps): React.JSX.Element {
  const statusKind = pluginStatusKind(plugin)
  const syntaxFailed = usePluginSyntaxFailureStore((state) =>
    Object.keys(state.failures).some((id) => id.startsWith(`plugin:${plugin.pluginKey}/`))
  )
  // Why the raw store: I18nProvider already loads language packs; a row must not start a load.
  const languagePacks = usePluginLanguagePackStore((state) => state.entries).filter(
    (pack) => pack.pluginKey === plugin.pluginKey
  )
  const needsReview = pluginNeedsReview(plugin)
  const enabled = isPluginEnabled(plugin)
  const switchDisabled =
    busy || needsReview || plugin.status === 'invalid' || Boolean(plugin.blockedByKillList)

  // Why: the wide primary action ("Review & enable") renders on its own footer
  // row so it never wraps the compact toggle + overflow cluster to an
  // inconsistent position between card types.
  const reviewAction = needsReview ? (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={() => onReview(plugin.pluginKey)}
    >
      {translate('auto.components.settings.PluginSettingsRow.reviewAndEnable', 'Review & enable')}
    </Button>
  ) : null
  const footerAction = reviewAction

  return (
    <article
      className="flex min-h-36 flex-col rounded-xl border border-border/80 bg-card p-4 text-card-foreground shadow-xs"
      data-plugin-key={plugin.pluginKey}
    >
      <div className="flex items-start gap-3">
        <PluginCatalogAvatar name={plugin.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-semibold">{plugin.name}</h4>
            {plugin.official ? (
              <BadgeCheck
                className="size-4 shrink-0 text-muted-foreground"
                role="img"
                aria-label={translate(
                  'auto.components.settings.PluginSettingsRow.official',
                  'Official'
                )}
              />
            ) : null}
            {plugin.isDev ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {translate('auto.components.settings.PluginSettingsRow.dev', 'Dev')}
              </Badge>
            ) : null}
            {plugin.bundled ? (
              <Badge variant="secondary">
                {translate('auto.components.settings.PluginSettingsRow.bundled', 'Bundled')}
              </Badge>
            ) : null}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                STATUS_PILL_CLASS[statusKind]
              )}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {pluginStatusLabel(statusKind)}
            </span>
            {busy ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {plugin.publisher ? `${plugin.publisher} · ` : null}v{plugin.version}
            {languagePacks.map((pack) => (
              <span key={pack.id}>
                {' · '}
                {translate(
                  'auto.components.settings.PluginSettingsRow.languageCoverage',
                  '{{value0}} {{value1}}% translated',
                  { value0: pack.locale, value1: pack.coverage }
                )}
              </span>
            ))}
          </p>
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
            {plugin.description ??
              translate(
                'auto.components.settings.PluginSettingsRow.noDescription',
                'No description provided.'
              )}
          </p>
          {syntaxFailed ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {translate(
                'auto.components.settings.PluginSettingsRow.syntaxFailed',
                'Highlighting stopped: this grammar failed.'
              )}
            </p>
          ) : null}
          {plugin.blockedByKillList ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {translate(
                  'auto.components.settings.PluginSettingsRow.killListMessage',
                  "Orca's safety list disabled this plugin: {{value0}}",
                  { value0: plugin.blockedByKillList.reason }
                )}
                {plugin.blockedByKillList.advisoryUrl ? (
                  <>
                    {' '}
                    <a
                      href={plugin.blockedByKillList.advisoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      {translate(
                        'auto.components.settings.PluginSettingsRow.viewAdvisory',
                        'View advisory'
                      )}
                    </a>
                  </>
                ) : null}
              </span>
            </p>
          ) : null}
          {plugin.error ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {plugin.status === 'invalid'
                  ? invalidPluginErrorMessage(plugin.error)
                  : translate(
                      'auto.components.settings.PluginSettingsRow.runtimeError',
                      'Stopped after an error. View logs for details.'
                    )}
                {plugin.restarts > 0
                  ? translate(
                      'auto.components.settings.PluginSettingsRow.restartCount',
                      ' · {{value0}} restarts',
                      { value0: plugin.restarts }
                    )
                  : null}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={busy}
                aria-label={translate(
                  'auto.components.settings.PluginSettingsRow.moreActions',
                  'More actions for {{value0}}',
                  { value0: plugin.name }
                )}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onToggleLogs(plugin.pluginKey)}>
                <FileText />
                {logsOpen
                  ? translate('auto.components.settings.PluginSettingsRow.hideLogs', 'Hide logs')
                  : translate('auto.components.settings.PluginSettingsRow.viewLogs', 'View logs')}
              </DropdownMenuItem>
              {plugin.source?.kind === 'marketplace' ? (
                <DropdownMenuItem onSelect={() => onRollbackRequest(plugin.pluginKey)}>
                  <RotateCcw />
                  {translate('auto.components.settings.PluginSettingsRow.rollback', 'Roll back')}
                </DropdownMenuItem>
              ) : null}
              {!plugin.isDev && !plugin.bundled ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onRemoveRequest(plugin.pluginKey)}
                >
                  <Trash2 />
                  {translate('auto.components.settings.PluginSettingsRow.remove', 'Remove')}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <SettingsSwitch
            checked={enabled && !needsReview}
            disabled={switchDisabled}
            onChange={() => onToggleEnabled(plugin)}
            ariaLabel={
              enabled && !needsReview
                ? translate(
                    'auto.components.settings.PluginSettingsRow.disableLabel',
                    'Disable {{value0}}',
                    { value0: plugin.name }
                  )
                : translate(
                    'auto.components.settings.PluginSettingsRow.enableLabel',
                    'Enable {{value0}}',
                    { value0: plugin.name }
                  )
            }
          />
        </div>
      </div>
      {footerAction ? (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-3">
          {footerAction}
        </div>
      ) : null}
      {logsOpen ? <PluginLogs pluginKey={plugin.pluginKey} state={logsState} /> : null}
    </article>
  )
}
