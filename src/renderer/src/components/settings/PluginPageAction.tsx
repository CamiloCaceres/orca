import { useState } from 'react'
import { Check, Loader2, ShieldCheck, Undo2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { installedPluginTrust } from './plugin-access-profile'
import { pluginConsentErrorMessage } from './plugin-error-presentation'
import { pluginNeedsReview } from './plugin-status-presentation'
import { PluginDetailAlert } from './PluginDetailAlert'
import { PluginInstallConsent } from './PluginInstallConsent'
import { PluginThemeUseNow } from './PluginThemeUseNow'
import type { usePluginInstallAction } from './use-plugin-install-action'
import type { usePluginPageModel } from './use-plugin-page-model'

type PluginPageActionProps = {
  entry: PluginListEntry
  /** The name the page shows: the manifest's once read, else the catalog's. */
  name: string
  model: ReturnType<typeof usePluginPageModel>
  unavailable: boolean
  busy: boolean
  install: ReturnType<typeof usePluginInstallAction>
  onConsent: (
    pluginKey: string,
    reviewedFingerprint: string,
    decision: 'approve' | 'keep-disabled'
  ) => Promise<void>
}

function ContentOnlyNote(): React.JSX.Element {
  return (
    <span className="plugin-security-chrome inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      {translate(
        'auto.components.settings.PluginPageAction.contentOnly',
        'Can’t reach anything outside its own files'
      )}
    </span>
  )
}

/**
 * The page's one decision: Install for content only, otherwise the consent above Install & enable,
 * or Enable for an installed plugin waiting for review. Nothing here opens a dialog. A content-only
 * plugin keeps this row after install (Undo, Use now) so installing never moves the page.
 */
export function PluginPageAction({
  entry,
  name,
  model,
  unavailable,
  busy,
  install,
  onConsent
}: PluginPageActionProps): React.JSX.Element | null {
  const [consentError, setConsentError] = useState<string | null>(null)
  const { plugin, listing, execution, preview, trust } = model
  const phase = install.phaseOf(entry.pluginKey)

  if (plugin && pluginNeedsReview(plugin) && plugin.consentFingerprint) {
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
        trust={trust ?? installedPluginTrust(plugin, null)}
        capabilities={plugin.capabilities}
        shortcuts={model.shortcuts}
        armed
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
  if (plugin) {
    if (plugin.execution !== 'data') {
      return null
    }
    return (
      <div className="mt-4 flex min-h-9 flex-wrap items-center gap-3">
        {phase?.kind === 'undoable' ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm">
              <Check className="size-4" aria-hidden="true" />
              {translate('auto.components.settings.PluginCardAction.installed', 'Installed')}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={translate(
                'auto.components.settings.PluginCardAction.undoLabel',
                'Undo installing {{value0}}',
                { value0: name }
              )}
              onClick={() => void install.undo(entry.pluginKey)}
            >
              <Undo2 />
              {translate('auto.components.settings.PluginCardAction.undo', 'Undo')}
            </Button>
          </>
        ) : null}
        <PluginThemeUseNow pluginKey={plugin.pluginKey} fallback={<ContentOnlyNote />} />
      </div>
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
        <div className="mt-4 flex min-h-9 flex-wrap items-center gap-3">
          <Button
            className="w-36"
            disabled={installing || model.stale}
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
          <ContentOnlyNote />
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
        trust={trust ?? installedPluginTrust({ panels: [], hasWorker: false }, null)}
        capabilities={model.capabilities}
        shortcuts={model.shortcuts}
        // Why the preview: it carries the fingerprint approved, and must be the release shown.
        armed={preview !== null && !model.stale}
        failed={model.previewFailed}
        onRetry={model.retryPreview}
        installed={null}
        official={listing.official}
        publisher={entry.publisher ?? ''}
        busy={installing}
        changed={false}
        error={null}
        onConfirm={() => {
          if (preview && !model.stale) {
            void install.install(listing, { preview })
          }
        }}
      />
      {errorAlert}
    </>
  )
}
