import { ArrowUpCircle, Check, Loader2, Undo2 } from 'lucide-react'
import { satisfiesOrcaEngineRange } from '../../../../shared/plugins/plugin-manifest'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { StatusWord } from '../plugin-catalog/PluginStatusWord'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { pluginNeedsReview } from './plugin-status-presentation'
import type { PluginInstallPhase } from './use-plugin-install-action'

export function needsNewerOrca(entry: PluginListEntry, orcaVersion: string | null): string | null {
  return entry.minimumOrca &&
    orcaVersion &&
    !satisfiesOrcaEngineRange(orcaVersion, `>=${entry.minimumOrca}`)
    ? entry.minimumOrca
    : null
}

/** One click installs only what the catalog verifies as content only; anything else is reviewed. */
export function installsInOneClick(entry: PluginListEntry): boolean {
  return entry.listing?.release?.execution === 'data'
}

/** What a catalog card's single action slot offers, by state. */
export function PluginCardAction({
  entry,
  phase,
  orcaVersion,
  onInstall,
  onOpen,
  onUndo,
  onUpdate
}: {
  entry: PluginListEntry
  phase: PluginInstallPhase | null
  orcaVersion: string | null
  onInstall: () => void
  onOpen: () => void
  onUndo: () => void
  onUpdate: () => void
}): React.JSX.Element | null {
  const installed = entry.installed
  if (phase?.kind === 'undoable') {
    return (
      <>
        <span className="inline-flex items-center gap-1 text-xs text-foreground">
          <Check className="size-3.5" aria-hidden="true" />
          {translate('auto.components.settings.PluginCardAction.installed', 'Installed')}
        </span>
        <Button
          variant="outline"
          size="xs"
          aria-label={translate(
            'auto.components.settings.PluginCardAction.undoLabel',
            'Undo installing {{value0}}',
            { value0: entry.name }
          )}
          onClick={onUndo}
        >
          <Undo2 />
          {translate('auto.components.settings.PluginCardAction.undo', 'Undo')}
        </Button>
      </>
    )
  }
  if (installed) {
    if (pluginNeedsReview(installed)) {
      return (
        <Button size="xs" onClick={onOpen}>
          {translate('auto.components.settings.PluginManagerRows.review', 'Review')}
        </Button>
      )
    }
    if (entry.updateVersion) {
      return (
        <Button variant="outline" size="xs" onClick={onUpdate}>
          <ArrowUpCircle />
          {translate('auto.components.settings.PluginManagerRows.update', 'Update {{value0}}', {
            value0: entry.updateVersion
          })}
        </Button>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden="true" />
        {translate('auto.components.settings.PluginCardAction.installed', 'Installed')}
      </span>
    )
  }
  if (entry.listing?.blockedByKillList) {
    return <StatusWord kind="blocked" />
  }
  const needsOrca = needsNewerOrca(entry, orcaVersion)
  if (needsOrca) {
    return (
      <span className="text-xs whitespace-nowrap text-status-warning-text">
        {translate(
          'auto.components.settings.PluginManagerRows.needsOrca',
          'Needs Orca {{value0}}',
          {
            value0: needsOrca
          }
        )}
      </span>
    )
  }
  if (phase?.kind === 'installing') {
    return (
      <Button variant="outline" size="xs" className="w-28" disabled>
        <Loader2 className="animate-spin" />
        {translate('auto.components.settings.PluginCardAction.installing', 'Installing…')}
      </Button>
    )
  }
  if (!installsInOneClick(entry)) {
    return (
      <Button
        variant="outline"
        size="xs"
        aria-label={translate(
          'auto.components.settings.PluginCardAction.reviewLabel',
          'Review and install {{value0}}',
          { value0: entry.name }
        )}
        onClick={onOpen}
      >
        {translate('auto.components.settings.PluginCardAction.review', 'Review & install')}
      </Button>
    )
  }
  return (
    <Button
      variant="outline"
      size="xs"
      className="w-28"
      aria-label={translate(
        'auto.components.settings.PluginManagerRows.installName',
        'Install {{value0}}',
        { value0: entry.name }
      )}
      onClick={onInstall}
    >
      {phase?.kind === 'error'
        ? translate('auto.components.settings.PluginCardAction.retry', 'Try again')
        : translate('auto.components.settings.PluginMarketplaceListingRow.install', 'Install')}
    </Button>
  )
}
