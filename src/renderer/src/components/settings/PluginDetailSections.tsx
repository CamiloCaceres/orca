import {
  AlertTriangle,
  Command,
  FileCode,
  Loader2,
  PanelRight,
  Server,
  ShieldCheck
} from 'lucide-react'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostInstallPreview
} from '../../../../preload/api-types'
import { formatKeybinding } from '../../../../shared/keybindings/formatting'
import type { PluginCatalogType } from '../../../../shared/plugins/plugin-catalog-release'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ShortcutKeyCombo } from '../ShortcutKeyCombo'
import { Button } from '../ui/button'
import { shadowedKeybindingTitles } from './PluginKeybindingConsentPreview'
import { pluginCapabilityDescription } from './plugin-capability-presentation'
import { contributionSummary } from './PluginMarketplacePreviewDialog'
import type { PluginLogsState } from './use-plugin-logs'

function shortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

export function DetailSection({
  title,
  count,
  children
}: {
  title: string
  count?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-baseline gap-2 px-0.5 text-2xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {title}
        {count ? <span className="font-normal tracking-normal normal-case">{count}</span> : null}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card/50 shadow-xs">
        {children}
      </div>
    </section>
  )
}

function DetailRow({
  icon,
  title,
  detail,
  detailTone = 'default',
  trailing
}: {
  icon: React.ReactNode
  title: string
  detail?: React.ReactNode
  detailTone?: 'default' | 'warning'
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-center gap-3 border-t border-border px-3.5 py-2 text-sm first:border-t-0">
      <span className="shrink-0 text-muted-foreground [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate">{title}</p>
        {detail ? (
          <p
            data-tone={detailTone}
            className="mt-px text-xs text-muted-foreground data-[tone=warning]:text-status-warning"
          >
            {detail}
          </p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  )
}

function catalogTypeLabel(type: PluginCatalogType): string {
  switch (type) {
    case 'interface-language':
      return translate(
        'auto.components.settings.PluginDetailSections.typeLanguagePack',
        'Interface language'
      )
    case 'app-theme':
      return translate('auto.components.settings.PluginDetailSections.typeAppTheme', 'App theme')
    case 'terminal-theme':
      return translate(
        'auto.components.settings.PluginDetailSections.typeTerminalTheme',
        'Terminal theme'
      )
    case 'icon-theme':
      return translate(
        'auto.components.settings.PluginDetailSections.typeIconTheme',
        'File icon theme'
      )
    case 'syntax':
      return translate(
        'auto.components.settings.PluginDetailSections.typeSyntax',
        'Syntax highlighting'
      )
    case 'instructions':
      return translate(
        'auto.components.settings.PluginDetailSections.typeInstructions',
        'Agent instructions'
      )
    case 'panel':
      return translate('auto.components.settings.PluginDetailSections.typePanel', 'Sidebar panel')
    case 'worker':
      return translate(
        'auto.components.settings.PluginDetailSections.typeWorker',
        'Background code'
      )
  }
}

/** What the plugin adds: commands with their shortcuts, panels, recipes, then catalog types. */
export function PluginAddsSection({
  plugin,
  preview,
  types,
  onOpenShortcuts
}: {
  plugin: PluginHostListEntry | null
  preview: PluginMarketplaceHostInstallPreview | null
  types: readonly PluginCatalogType[]
  onOpenShortcuts: () => void
}): React.JSX.Element | null {
  const overrides = useAppStore((state) => state.keybindings)
  const platform = shortcutPlatform()
  const commands =
    plugin?.commands ??
    preview?.manifest.contributes.commands.map((command) => ({
      id: command.id,
      title: command.title,
      context: 'global' as const,
      keybindings: preview.manifest.contributes.keybindings
        .filter((binding) => binding.command === command.id)
        .map((binding) => ({ key: binding.key, when: 'global' as const }))
    })) ??
    []
  const panels =
    plugin?.panels.map((panel) => panel.title) ??
    preview?.manifest.contributes.panels.map((panel) => panel.title) ??
    []
  const recipes =
    plugin?.vmRecipes?.map((recipe) => recipe.name) ??
    preview?.manifest.contributes.vmRecipes.map((recipe) => recipe.path) ??
    []
  // Why: a fetched manifest is exact; catalog types are the fallback for an installed plugin.
  const summary = preview
    ? contributionSummary(preview).filter(
        (item) => !['commands', 'keybindings', 'panels', 'vmRecipes'].includes(item.key)
      )
    : []
  const listedTypes = preview ? [] : types.filter((type) => type !== 'panel' && type !== 'worker')
  const total =
    commands.length + panels.length + recipes.length + listedTypes.length + summary.length
  if (total === 0) {
    return null
  }
  return (
    <DetailSection
      title={translate('auto.components.settings.PluginDetailSections.adds', 'Adds to Orca')}
      count={String(total)}
    >
      {summary.map((item) => (
        <DetailRow key={item.key} icon={<FileCode />} title={item.label} />
      ))}
      {listedTypes.map((type) => (
        <DetailRow key={type} icon={<FileCode />} title={catalogTypeLabel(type)} />
      ))}
      {commands.map((command) => {
        const binding = command.keybindings[0]
        const shadowed = binding ? shadowedKeybindingTitles(binding.key, platform, overrides) : []
        return (
          <DetailRow
            key={command.id}
            icon={<Command />}
            title={command.title}
            detailTone={shadowed.length > 0 ? 'warning' : 'default'}
            detail={
              shadowed.length > 0 ? (
                <>
                  {translate(
                    'auto.components.settings.PluginDetailSections.replaces',
                    'Replaces your shortcut for {{value0}}',
                    { value0: shadowed.join(', ') }
                  )}
                  {' · '}
                  <Button variant="link" size="xs" onClick={onOpenShortcuts}>
                    {translate(
                      'auto.components.settings.PluginDetailSections.changeShortcuts',
                      'Change in Shortcuts'
                    )}
                  </Button>
                </>
              ) : binding?.when === 'worktree' ? (
                translate(
                  'auto.components.settings.PluginKeybindingConsentPreview.worktree',
                  'Runs only while a workspace is active.'
                )
              ) : (
                translate('auto.components.settings.PluginDetailSections.command', 'Command')
              )
            }
            trailing={
              binding ? <ShortcutKeyCombo keys={formatKeybinding(binding.key, platform)} /> : null
            }
          />
        )
      })}
      {panels.map((title) => (
        <DetailRow
          key={`panel:${title}`}
          icon={<PanelRight />}
          title={title}
          detail={translate('auto.components.settings.PluginDetailSections.panel', 'Sidebar panel')}
        />
      ))}
      {recipes.map((name) => (
        <DetailRow
          key={`recipe:${name}`}
          icon={<Server />}
          title={name}
          detail={translate(
            'auto.components.settings.PluginDetailSections.recipe',
            'Machine recipe'
          )}
        />
      ))}
    </DetailSection>
  )
}

/** What the plugin can reach, in the consent dialog's words. */
export function PluginAccessSection({
  capabilities,
  runsCode,
  loading
}: {
  capabilities: readonly { kind: string; description: string }[] | null
  runsCode: boolean
  loading: boolean
}): React.JSX.Element {
  return (
    <DetailSection
      title={translate('auto.components.settings.PluginDetailSections.access', 'Can access')}
    >
      {loading || capabilities === null ? (
        <DetailRow
          icon={<Loader2 className="animate-spin" />}
          title={translate(
            'auto.components.settings.PluginDetailSections.accessLoading',
            'Reading the plugin…'
          )}
        />
      ) : capabilities.length > 0 ? (
        capabilities.map((capability) => (
          <DetailRow
            key={capability.kind}
            icon={<AlertTriangle />}
            title={pluginCapabilityDescription(capability.kind, capability.description)}
          />
        ))
      ) : (
        <DetailRow
          icon={<ShieldCheck />}
          title={translate(
            'auto.components.settings.PluginDetailSections.noAccess',
            'Nothing outside its own files'
          )}
          detail={
            runsCode
              ? translate(
                  'auto.components.settings.PluginDetailSections.noAccessCode',
                  'Its code runs in a sandbox with no extra access.'
                )
              : translate(
                  'auto.components.settings.PluginDetailSections.noAccessContent',
                  'Content only. It has no code that runs.'
                )
          }
        />
      )}
    </DetailSection>
  )
}

export function PluginLogsSection({
  state
}: {
  state: PluginLogsState | undefined
}): React.JSX.Element {
  const lines = state?.lines ?? []
  const text = lines
    .map(
      (entry) => `${new Date(entry.ts).toLocaleTimeString()} ${entry.level.padEnd(5)} ${entry.line}`
    )
    .join('\n')
  return (
    <DetailSection
      title={translate('auto.components.settings.PluginDetailSections.logs', 'Logs')}
      count={
        state?.lines
          ? translate(
              'auto.components.settings.PluginSettingsRow.logCount',
              'Last {{value0}} of up to 200 retained lines',
              {
                value0: lines.length
              }
            )
          : undefined
      }
    >
      {state?.loading ? (
        <p className="flex items-center gap-2 px-3.5 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {translate('auto.components.settings.PluginSettingsRow.loadingLogs', 'Loading logs…')}
        </p>
      ) : state?.error ? (
        <p className="px-3.5 py-3 text-xs text-destructive">{state.error}</p>
      ) : (
        <>
          <pre
            tabIndex={0}
            className="scrollbar-sleek max-h-44 overflow-auto bg-muted/40 px-3.5 py-2.5 font-mono text-2xs leading-5"
          >
            {text ||
              translate(
                'auto.components.settings.PluginSettingsRow.noLogs',
                'No log lines recorded.'
              )}
          </pre>
          {text ? (
            <div className="flex justify-end border-t border-border px-2 py-1">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void window.api.ui.writeClipboardText(text)}
              >
                {translate('auto.components.settings.PluginDetailSections.copyLogs', 'Copy')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </DetailSection>
  )
}
