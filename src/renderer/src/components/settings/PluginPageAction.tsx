import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import type {
  PluginMarketplaceHostInstallPreview,
  PluginMarketplaceHostListing
} from '../../../../preload/api-types'
import type { PluginExecutionProfile } from '../../../../shared/plugins/plugin-execution-profile'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { pluginConsentTier } from './plugin-access-profile'
import { consentTierForExecution } from './plugin-consent-copy'
import { pluginConsentErrorMessage } from './plugin-error-presentation'
import { pluginNeedsReview } from './plugin-status-presentation'
import { PluginDetailAlert } from './PluginDetailAlert'
import { PluginInstallConsent } from './PluginInstallConsent'
import type { usePluginInstallAction } from './use-plugin-install-action'

type PluginPageActionProps = {
  entry: PluginListEntry
  /** The name the page shows: the manifest's once read, else the catalog's. */
  name: string
  /** The listing this page is pinned to. */
  listing: PluginMarketplaceHostListing | null
  execution: PluginExecutionProfile | null
  preview: PluginMarketplaceHostInstallPreview | null
  previewFailed: boolean
  onRetryPreview: () => void
  unavailable: boolean
  busy: boolean
  install: ReturnType<typeof usePluginInstallAction>
  onConsent: (
    pluginKey: string,
    reviewedFingerprint: string,
    decision: 'approve' | 'keep-disabled'
  ) => Promise<void>
}

/**
 * The page's one decision: Install for content only, otherwise the consent above Install & enable,
 * or Enable for an installed plugin waiting for review. Nothing here opens a dialog.
 */
export function PluginPageAction({
  entry,
  name,
  listing,
  execution,
  preview,
  previewFailed,
  onRetryPreview,
  unavailable,
  busy,
  install,
  onConsent
}: PluginPageActionProps): React.JSX.Element | null {
  const [consentError, setConsentError] = useState<string | null>(null)
  const plugin = entry.installed
  const phase = install.phaseOf(entry.pluginKey)

  if (plugin) {
    if (!pluginNeedsReview(plugin) || !plugin.consentFingerprint) {
      return null
    }
    const fingerprint = plugin.consentFingerprint
    const decide = (decision: 'approve' | 'keep-disabled'): void => {
      setConsentError(null)
      void onConsent(plugin.pluginKey, fingerprint, decision).catch((cause: unknown) => {
        console.warn('[plugins] consent update failed:', cause)
        setConsentError(pluginConsentErrorMessage(cause))
      })
    }
    return (
      <PluginInstallConsent
        name={plugin.name}
        mode="enable"
        tier={pluginConsentTier(plugin)}
        capabilities={plugin.capabilities}
        installed={plugin}
        official={plugin.official}
        publisher={plugin.publisher}
        source={plugin.source}
        busy={busy}
        changed={plugin.needsReconsent}
        error={consentError}
        onConfirm={() => decide('approve')}
        onKeepOff={() => decide('keep-disabled')}
      />
    )
  }
  if (!listing || unavailable) {
    return null
  }
  const installing = phase?.kind === 'installing'
  const errorAlert =
    phase?.kind === 'error' ? (
      <PluginDetailAlert
        tone="destructive"
        title={translate(
          'auto.components.settings.PluginPageAction.failedTitle',
          'Couldn’t install {{value0}}',
          { value0: name }
        )}
        body={phase.message}
      />
    ) : null

  if (execution === 'data') {
    return (
      <>
        <div className="mt-5 flex min-h-9 flex-wrap items-center gap-3">
          <Button
            className="w-36"
            disabled={installing}
            aria-label={translate(
              'auto.components.settings.PluginManagerRows.installName',
              'Install {{value0}}',
              { value0: name }
            )}
            onClick={() => void install.install(listing)}
          >
            {installing ? <Loader2 className="animate-spin" /> : null}
            {installing
              ? translate('auto.components.settings.PluginCardAction.installing', 'Installing…')
              : phase?.kind === 'error'
                ? translate('auto.components.settings.PluginCardAction.retry', 'Try again')
                : translate(
                    'auto.components.settings.PluginMarketplaceListingRow.install',
                    'Install'
                  )}
          </Button>
          <span className="plugin-security-chrome inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {translate(
              'auto.components.settings.PluginPageAction.contentOnly',
              'Can’t reach anything outside its own files'
            )}
          </span>
        </div>
        {errorAlert}
      </>
    )
  }
  return (
    <>
      <PluginInstallConsent
        name={name}
        mode="install"
        // Why instructional when unknown: an unread profile is never presented as content only.
        tier={execution ? consentTierForExecution(execution) : 'instructional'}
        capabilities={
          preview
            ? preview.manifest.capabilities.map((capability) => ({
                kind: capability.kind,
                description: capability.kind
              }))
            : null
        }
        failed={previewFailed}
        onRetry={onRetryPreview}
        installed={null}
        official={listing.official}
        publisher={entry.publisher ?? ''}
        busy={installing}
        changed={false}
        error={null}
        onConfirm={() => {
          if (preview) {
            void install.install(listing, { preview })
          }
        }}
      />
      {errorAlert}
    </>
  )
}
