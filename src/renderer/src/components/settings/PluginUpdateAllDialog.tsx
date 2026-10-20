import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PluginMarketplaceHostInstallPreview } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { PluginCatalogAvatar } from '../plugin-catalog/PluginCatalogAvatar'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { pluginCapabilityDescription } from './plugin-capability-presentation'

type UpdateCandidate = {
  entry: PluginListEntry
  preview: PluginMarketplaceHostInstallPreview | null
  error: boolean
}

/** Capabilities the update asks for that the installed version doesn't have. */
export function newAccess(
  entry: PluginListEntry,
  preview: PluginMarketplaceHostInstallPreview
): string[] {
  const held = new Set(entry.installed?.capabilities.map((capability) => capability.kind) ?? [])
  return preview.manifest.capabilities
    .map((capability) => capability.kind)
    .filter((kind) => !held.has(kind))
}

/**
 * One review for every pending update. Plugins whose access grows are expanded with what's new;
 * the rest are one line. Any can be unticked; nothing installs until Update.
 */
export function PluginUpdateAllDialog({
  open,
  entries,
  onClose,
  onUpdated
}: {
  open: boolean
  entries: readonly PluginListEntry[]
  onClose: () => void
  onUpdated: (pluginKeys: string[]) => Promise<void>
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<UpdateCandidate[] | null>(null)
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setCandidates(null)
      setSkipped(new Set())
      setFailed([])
      return
    }
    let stale = false
    void Promise.all(
      entries.map(async (entry): Promise<UpdateCandidate> => {
        try {
          const preview = await window.api.plugins.previewMarketplaceUpdate({
            pluginKey: entry.pluginKey
          })
          return { entry, preview, error: false }
        } catch (cause) {
          console.warn('[plugins] update preview failed:', cause)
          return { entry, preview: null, error: true }
        }
      })
    ).then((next) => {
      if (!stale) {
        setCandidates(next)
      }
    })
    return () => {
      stale = true
    }
  }, [open, entries])

  const chosen = (candidates ?? []).filter(
    (candidate) => candidate.preview && !skipped.has(candidate.entry.pluginKey)
  )
  const growing = (candidates ?? []).filter(
    (candidate) => candidate.preview && newAccess(candidate.entry, candidate.preview).length > 0
  ).length

  const update = async (): Promise<void> => {
    setBusy(true)
    const done: string[] = []
    const errors: string[] = []
    // Why sequential: each install re-reads the plugin list; parallel installs race that refresh.
    for (const { entry, preview } of chosen) {
      if (!preview) {
        continue
      }
      try {
        const result = await window.api.plugins.installMarketplacePlugin({
          marketplaceSourceId: preview.marketplaceSourceId,
          marketplaceCommit: preview.marketplaceCommit,
          pluginKey: preview.pluginKey,
          resolvedCommit: preview.resolvedCommit
        })
        if (result.ok) {
          done.push(result.pluginKey)
        } else {
          errors.push(entry.name)
        }
      } catch (cause) {
        console.warn('[plugins] update failed:', cause)
        errors.push(entry.name)
      }
    }
    await onUpdated(done)
    setBusy(false)
    setFailed(errors)
    if (errors.length === 0) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent surface="security" scrollable>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.PluginUpdateAllDialog.title', 'Update plugins?')}
          </DialogTitle>
          <DialogDescription>
            {candidates === null
              ? translate(
                  'auto.components.settings.PluginUpdateAllDialog.reading',
                  'Reading what each update changes…'
                )
              : growing > 0
                ? translate(
                    'auto.components.settings.PluginUpdateAllDialog.someGrow',
                    'Updates that ask for new access are expanded below. The others change only what they add.'
                  )
                : translate(
                    'auto.components.settings.PluginUpdateAllDialog.noneGrow',
                    'None of these updates asks for new access.'
                  )}
          </DialogDescription>
        </DialogHeader>
        {candidates === null ? (
          <Loader2 className="mx-auto my-4 size-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y divide-border">
            {candidates.map(({ entry, preview, error }) => {
              const added = preview ? newAccess(entry, preview) : []
              const checkboxId = `plugin-update-${entry.pluginKey}`
              return (
                <li key={entry.pluginKey} className="flex items-start gap-3 py-2.5">
                  <PluginCatalogAvatar name={entry.name} className="size-7 rounded-md text-3xs" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={checkboxId} className="text-sm font-medium">
                      {entry.name}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {entry.installed?.version} →{' '}
                        {preview?.manifest.version ?? entry.updateVersion}
                      </span>
                    </label>
                    {error ? (
                      <p className="mt-0.5 text-xs text-destructive">
                        {translate(
                          'auto.components.settings.PluginUpdateAllDialog.previewError',
                          'Couldn’t read this update. It will be skipped.'
                        )}
                      </p>
                    ) : added.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 border-l-2 border-status-warning pl-2 text-xs">
                        {added.map((kind) => (
                          <li key={kind} className="text-status-warning">
                            {translate(
                              'auto.components.settings.PluginUpdateAllDialog.newAccess',
                              'New access: {{value0}}',
                              { value0: pluginCapabilityDescription(kind, kind) }
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {translate(
                          'auto.components.settings.PluginUpdateAllDialog.noNewAccess',
                          'No new access'
                        )}
                      </p>
                    )}
                  </div>
                  <Checkbox
                    id={checkboxId}
                    checked={Boolean(preview) && !skipped.has(entry.pluginKey)}
                    disabled={!preview || busy}
                    onCheckedChange={(checked) =>
                      setSkipped((current) => {
                        const next = new Set(current)
                        if (checked) {
                          next.delete(entry.pluginKey)
                        } else {
                          next.add(entry.pluginKey)
                        }
                        return next
                      })
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
        {failed.length > 0 ? (
          <p className="text-xs text-destructive">
            {translate(
              'auto.components.settings.PluginUpdateAllDialog.failed',
              'Couldn’t update {{value0}}. The others were updated.',
              { value0: failed.join(', ') }
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {translate('auto.components.settings.PluginUpdateAllDialog.cancel', 'Cancel')}
          </Button>
          <Button disabled={busy || chosen.length === 0} onClick={() => void update()}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {chosen.length === 1
              ? translate(
                  'auto.components.settings.PluginUpdateAllDialog.updateOne',
                  'Update 1 plugin'
                )
              : translate(
                  'auto.components.settings.PluginUpdateAllDialog.updateMany',
                  'Update {{value0}} plugins',
                  { value0: chosen.length }
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
