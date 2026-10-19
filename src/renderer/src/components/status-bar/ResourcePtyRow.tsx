import { memo } from 'react'
import { ArrowUpRight, ChevronRight, Copy, MoreHorizontal, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { ResourcePtyRow as PtyRow } from './resource-pty-view-model'
import { ResourcePtyDetails, resourcePtyBindingLabel } from './ResourcePtyDetails'

export const ResourcePtyRow = memo(function ResourcePtyRow({
  row,
  observedAt,
  unverifiable,
  ending,
  error,
  onEnd,
  onNavigate
}: {
  row: PtyRow
  observedAt: number | null
  unverifiable: boolean
  ending: boolean
  error?: string
  onEnd: (row: PtyRow) => void
  onNavigate: (tabId: string, paneKey: string | null) => void
}) {
  const endUnavailable = unverifiable
    ? translate('resourceManager.pty.refreshBeforeEnd', 'Refresh PTYs before ending this terminal.')
    : !row.session.incarnationId || !row.session.fencedTermination
      ? translate(
          'resourceManager.pty.endUnsupported',
          'End this terminal manually from its terminal tab or on its host.'
        )
      : null
  const processName = row.session.foregroundProcess?.trim()
  const context = processName
    ? translate('resourceManager.pty.lastProcess', 'Last seen process: {{process}}', {
        process: processName
      })
    : null
  const folder = !row.workspace ? row.session.cwd : null
  const copySessionId = async (): Promise<void> => {
    try {
      await window.api.ui.writeClipboardText(row.session.id)
      toast.success(translate('resourceManager.pty.idCopied', 'Session ID copied'))
    } catch {
      toast.error(translate('resourceManager.pty.copyFailed', 'Could not copy session ID'))
    }
  }
  return (
    <div data-resource-pty-row={row.identity} className="px-2 py-1">
      <Collapsible>
        <div className="flex min-w-0 items-center gap-1">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="group min-w-0 flex-1 justify-start"
              aria-label={translate(
                'resourceManager.pty.detailsNamed',
                'Details for {{terminal}}',
                {
                  terminal: row.label
                }
              )}
            >
              <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
              <Terminal className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs">{row.label}</span>
            </Button>
          </CollapsibleTrigger>
          {row.binding === 'unbound' && (
            <span className="shrink-0 text-2xs text-muted-foreground">
              {resourcePtyBindingLabel(row.binding)}
            </span>
          )}
          {row.tabId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('resourceManager.pty.openNamed', 'Open {{terminal}}', {
                    terminal: row.label
                  })}
                  onClick={() => {
                    if (row.tabId) {
                      onNavigate(row.tabId, row.paneKey)
                    }
                  }}
                >
                  <ArrowUpRight className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {translate('resourceManager.pty.goToTerminal', 'Go to terminal')}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex" tabIndex={endUnavailable ? 0 : undefined}>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={ending || !!endUnavailable}
                  aria-label={translate('resourceManager.pty.endNamed', 'End {{terminal}}', {
                    terminal: row.label
                  })}
                  onClick={() => onEnd(row)}
                >
                  {ending
                    ? translate('resourceManager.pty.ending', 'Ending…')
                    : translate('resourceManager.pty.endShort', 'End')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {endUnavailable ??
                translate(
                  'resourceManager.pty.endHint',
                  'End this terminal and its child processes.'
                )}
            </TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={translate(
                  'resourceManager.pty.actionsNamed',
                  'Actions for {{terminal}}',
                  {
                    terminal: row.label
                  }
                )}
              >
                <MoreHorizontal className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copySessionId()}>
                <Copy className="size-3.5" />
                {translate('resourceManager.pty.copyId', 'Copy session ID')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {(context || folder) && (
          <p
            className="truncate px-2.5 pb-1 text-xs text-muted-foreground"
            title={folder || context || undefined}
          >
            {context}
            {context && folder ? ' · ' : ''}
            {folder}
          </p>
        )}
        <CollapsibleContent>
          <ResourcePtyDetails row={row} observedAt={observedAt} />
        </CollapsibleContent>
        {error && (
          <p role="alert" className="px-2.5 pb-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </Collapsible>
    </div>
  )
})
