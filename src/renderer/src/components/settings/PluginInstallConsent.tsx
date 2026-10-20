import { useId } from 'react'
import { AlertTriangle, Check, Loader2, ShieldAlert } from 'lucide-react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { SecuritySurface } from '../ui/security-surface'
import { pluginCapabilityDescription } from './plugin-capability-presentation'
import type { PluginConsentTier } from './plugin-access-profile'
import { consentTierLabel, consentTierWarning } from './plugin-consent-copy'
import { PluginConsentProvenance, type PluginConsentSource } from './PluginConsentProvenance'
import { PluginKeybindingConsentPreview } from './PluginKeybindingConsentPreview'
import { PluginVmRecipeConsentPreview } from './PluginVmRecipeConsentPreview'

type PluginInstallConsentProps = {
  name: string
  /** `install` grants on install; `enable` reviews a plugin already installed. */
  mode: 'install' | 'enable'
  tier: PluginConsentTier
  /** Null until the plugin's own files were read; the button stays off until then. */
  capabilities: readonly { kind: string; description: string }[] | null
  /** Its files couldn't be read, so nothing is known about what it can do. */
  failed?: boolean
  onRetry?: () => void
  /** Installed only: its exact commands, shortcuts and recipe commands. */
  installed: PluginHostListEntry | null
  official: boolean
  publisher: string
  source?: PluginConsentSource
  busy: boolean
  /** The plugin changed since it was last approved, or since this page was opened. */
  changed: boolean
  error: string | null
  onConfirm: () => void
  onKeepOff?: () => void
}

/**
 * What a plugin that runs code or instructions may do, directly above the one button that grants
 * it. On the host's security surface so a plugin theme cannot restyle the decision.
 */
export function PluginInstallConsent({
  name,
  mode,
  tier,
  capabilities,
  failed = false,
  onRetry,
  installed,
  official,
  publisher,
  source,
  busy,
  changed,
  error,
  onConfirm,
  onKeepOff
}: PluginInstallConsentProps): React.JSX.Element {
  const headingId = useId()
  const ready = capabilities !== null
  const confirmLabel =
    mode === 'install'
      ? translate('auto.components.settings.PluginInstallConsent.install', 'Install & enable')
      : translate('auto.components.settings.PluginConsentDialog.enable', 'Enable plugin')
  return (
    <SecuritySurface>
      <section
        aria-labelledby={headingId}
        data-plugin-consent=""
        className="mt-5 overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5">
          <ShieldAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 id={headingId} className="min-w-0 flex-1 text-sm font-medium">
            {mode === 'install'
              ? translate(
                  'auto.components.settings.PluginInstallConsent.installHeading',
                  'If you install {{value0}}, it can:',
                  { value0: name }
                )
              : translate(
                  'auto.components.settings.PluginInstallConsent.enableHeading',
                  'If you enable {{value0}}, it can:',
                  { value0: name }
                )}
          </h3>
          <span className="shrink-0 rounded-md border border-border px-1.5 py-px text-2xs font-medium text-muted-foreground">
            {consentTierLabel(tier)}
          </span>
        </div>
        <div className="space-y-2 px-4 py-3 text-sm leading-6">
          {changed ? (
            <p className="rounded-md bg-muted px-2.5 py-1.5 text-xs leading-5">
              {translate(
                'auto.components.settings.PluginConsentDialog.reconsent',
                'This plugin changed since you approved it. Review it to run it again.'
              )}
            </p>
          ) : null}
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <span>{consentTierWarning(tier)}</span>
          </p>
          {ready && capabilities.length === 0 ? (
            // Why a row: the reading row it replaces keeps its height, so nothing below moves.
            <p className="flex items-start gap-2 text-muted-foreground">
              <Check className="mt-1 size-4 shrink-0" />
              {translate(
                'auto.components.settings.PluginInstallConsent.noOtherAccess',
                'It asks for no other access.'
              )}
            </p>
          ) : ready ? (
            capabilities.map((capability) => (
              <p key={capability.kind} className="flex items-start gap-2">
                <Check className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <span>
                  {pluginCapabilityDescription(capability.kind, capability.description)}{' '}
                  <span className="font-mono text-2xs text-muted-foreground">
                    ({capability.kind})
                  </span>
                </span>
              </p>
            ))
          ) : failed ? (
            <p className="flex items-center gap-2 text-status-warning-text">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {translate(
                  'auto.components.settings.PluginDetailSections.accessFailed',
                  'Couldn’t read what it can access'
                )}
              </span>
              {onRetry ? (
                <Button variant="ghost" size="xs" onClick={onRetry}>
                  {translate('auto.components.settings.PluginDetailSections.retry', 'Retry')}
                </Button>
              ) : null}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
              {translate(
                'auto.components.settings.PluginDetailSections.accessLoading',
                'Reading the plugin…'
              )}
            </p>
          )}
          {installed ? (
            <>
              <PluginKeybindingConsentPreview commands={installed.commands} />
              <PluginVmRecipeConsentPreview recipes={installed.vmRecipes ?? []} />
            </>
          ) : null}
        </div>
        {error ? <p className="px-4 pb-2 text-xs text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          <Button
            size="sm"
            className="w-36"
            disabled={!ready || busy}
            aria-label={`${confirmLabel}: ${name}`}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
          {onKeepOff ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onKeepOff}>
              {translate('auto.components.settings.PluginInstallConsent.keepOff', 'Keep off')}
            </Button>
          ) : null}
          <div className="ml-auto">
            <PluginConsentProvenance official={official} publisher={publisher} source={source} />
          </div>
        </div>
      </section>
    </SecuritySurface>
  )
}
