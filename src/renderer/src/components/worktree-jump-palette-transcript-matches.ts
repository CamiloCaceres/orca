import type { AiVaultSearchHit } from '../../../shared/ai-vault-search-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { SESSION_SEARCH_LIMIT_MAX } from '../../../shared/ai-vault-search-limit'
import type { Worktree } from '../../../shared/worktree/types'
import type { PaletteSearchContext } from '@/lib/palette-match/palette-ranking'
import { buildWorkspaceTabBaseResult } from '@/lib/workspace-tab-palette-results'
import type { SearchableWorkspaceTab } from '@/lib/workspace-tab-palette-search'
import {
  resolveOriginalPaneTarget,
  type OriginalPaneState
} from './right-sidebar/ai-vault-original-pane'
import {
  buildAiVaultOriginalPaneIndex,
  findOriginalAiVaultSessionPaneInIndex
} from './right-sidebar/ai-vault-original-pane-index'
import { aiVaultSearchHitToSession } from './right-sidebar/ai-vault-search-session'
import { parseAiVaultSnippetMarks } from './right-sidebar/ai-vault-search-snippet-marks'
import type {
  PaletteTranscriptSnippet,
  WorkspaceTabPaletteItem
} from './worktree-jump-palette-model'
import {
  classifyPaletteTranscriptProof,
  preparePaletteTranscriptProofQuery,
  type PaletteTranscriptWindow
} from './cmd-j/palette-transcript-proof'

/** A local index hit that belongs to a terminal tab with a live or sleeping pane. */
export type PaletteTranscriptMatch = {
  worktreeId: string
  terminalTabId: string
  snippet: PaletteTranscriptSnippet | null
  ordinal: number
  complete: boolean
  windows: readonly PaletteTranscriptWindow[]
}

const NO_TRANSCRIPT_MATCHES: readonly PaletteTranscriptMatch[] = []
const NO_WORKSPACE_TAB_ITEMS: readonly WorkspaceTabPaletteItem[] = []

export function terminalTabKey(worktreeId: string, terminalTabId: string): string {
  return `${worktreeId}\u0000${terminalTabId}`
}

export function resolvePaletteTranscriptEligibleTabs(
  state: OriginalPaneState
): ReadonlySet<string> {
  const keys = new Set<string>()
  const panes = [
    ...Object.values(state.agentStatusByPaneKey).filter((entry) => entry.agentType),
    ...Object.values(state.retainedAgentsByPaneKey)
      .filter((entry) => entry?.agentType)
      .map((entry) => entry.entry),
    ...Object.values(state.sleepingAgentSessionsByPaneKey).filter((entry) => entry !== undefined)
  ]
  for (const pane of panes) {
    const target = resolveOriginalPaneTarget({
      state,
      paneKey: pane.paneKey,
      worktreeIdHint: pane.worktreeId,
      tabIdHint: pane.tabId
    })
    if (target) {
      keys.add(terminalTabKey(target.worktreeId, target.tabId))
    }
  }
  return keys
}

/** Keeps host order; hits with no pane are dropped because Cmd+J lists only open chats. */
export function resolvePaletteTranscriptMatches(
  hits: readonly AiVaultSearchHit[],
  paneState: OriginalPaneState,
  query = '',
  proofWindows?: ReadonlyMap<AiVaultSearchHit, readonly PaletteTranscriptWindow[]>
): readonly PaletteTranscriptMatch[] {
  if (hits.length === 0) {
    return NO_TRANSCRIPT_MATCHES
  }
  const index = buildAiVaultOriginalPaneIndex(paneState)
  const requirements = preparePaletteTranscriptProofQuery(query)
  const matches: PaletteTranscriptMatch[] = []
  for (const [ordinal, hit] of hits.slice(0, SESSION_SEARCH_LIMIT_MAX).entries()) {
    if (hit.executionHostId && hit.executionHostId !== LOCAL_EXECUTION_HOST_ID) {
      continue
    }
    const pane = findOriginalAiVaultSessionPaneInIndex(
      index,
      aiVaultSearchHitToSession(hit, LOCAL_EXECUTION_HOST_ID)
    )
    if (!pane) {
      continue
    }
    matches.push({
      worktreeId: pane.worktreeId,
      terminalTabId: pane.tabId,
      snippet: hit.evidence ? parseAiVaultSnippetMarks(hit.evidence.snippet) : null,
      ordinal,
      complete: false,
      windows:
        proofWindows?.get(hit) ??
        classifyPaletteTranscriptProof(hit.evidence?.originalExcerpt?.text ?? '', requirements)
    })
  }
  return matches
}

/** Fit and classify before folding sessions onto one destination. */
export function fitPaletteTranscriptMatches(
  matches: readonly PaletteTranscriptMatch[],
  fits: ReadonlyMap<number, PaletteTranscriptSnippet>
): readonly PaletteTranscriptMatch[] {
  const byTab = new Map<string, PaletteTranscriptMatch>()
  for (const match of matches) {
    const snippet = fits.get(match.ordinal)
    const fitted = snippet ? { ...match, snippet, complete: true } : match
    const key = terminalTabKey(match.worktreeId, match.terminalTabId)
    const previous = byTab.get(key)
    if (
      !previous ||
      (fitted.complete && !previous.complete) ||
      (fitted.complete === previous.complete && fitted.ordinal < previous.ordinal)
    ) {
      byTab.set(key, fitted)
    }
  }
  return [...byTab.values()].sort((a, b) => a.ordinal - b.ordinal)
}

/** Keeps ordinary evidence separate; the Cmd+J adapter chooses the stronger band. */
export function mergeWorkspaceTabTranscriptMatches({
  titleItems,
  entries,
  matches,
  context,
  isLocalWorktree,
  eligibleTabs
}: {
  titleItems: WorkspaceTabPaletteItem[]
  entries: readonly SearchableWorkspaceTab[]
  matches: readonly PaletteTranscriptMatch[]
  context: PaletteSearchContext
  /** Index hits come from this desktop only, and worktree ids can repeat across hosts. */
  isLocalWorktree: (worktree: Worktree) => boolean
  eligibleTabs: ReadonlySet<string>
}): {
  titleItems: WorkspaceTabPaletteItem[]
  transcriptOnlyItems: readonly WorkspaceTabPaletteItem[]
} {
  const entryByTerminalTab = new Map<string, SearchableWorkspaceTab>()
  for (const entry of entries) {
    const tabHost = entry.tab.executionHostId
    if (
      entry.tab.contentType !== 'terminal' ||
      !isLocalWorktree(entry.worktree) ||
      (tabHost !== undefined && tabHost !== LOCAL_EXECUTION_HOST_ID)
    ) {
      continue
    }
    const key = terminalTabKey(entry.worktree.id, entry.tab.entityId)
    if (!entryByTerminalTab.has(key)) {
      entryByTerminalTab.set(key, entry)
    }
  }
  const titleItemIds = new Set(titleItems.map((item) => item.id))
  const matchByItemId = new Map<string, PaletteTranscriptMatch>()
  const reservedItemIds = new Set<string>()
  for (const [key, entry] of entryByTerminalTab) {
    if (eligibleTabs.has(key)) {
      reservedItemIds.add(buildWorkspaceTabBaseResult(entry, context).paletteIdentity)
    }
  }
  const transcriptOnlyItems: WorkspaceTabPaletteItem[] = []
  for (const match of matches) {
    const entry = entryByTerminalTab.get(terminalTabKey(match.worktreeId, match.terminalTabId))
    if (!entry) {
      continue
    }
    const result = buildWorkspaceTabBaseResult(entry, context)
    if (titleItemIds.has(result.paletteIdentity)) {
      matchByItemId.set(result.paletteIdentity, match)
      continue
    }
    transcriptOnlyItems.push({
      id: result.paletteIdentity,
      type: 'workspace-tab',
      result,
      transcript: { complete: match.complete, ordinal: match.ordinal },
      transcriptReserved: true,
      ...(match.snippet ? { transcriptSnippet: match.snippet } : {})
    })
  }
  return {
    titleItems:
      matchByItemId.size === 0 && reservedItemIds.size === 0
        ? titleItems
        : titleItems.map((item) => {
            const match = matchByItemId.get(item.id)
            return {
              ...item,
              transcriptReserved: reservedItemIds.has(item.id) || Boolean(match),
              ...(match
                ? {
                    transcript: { complete: match.complete, ordinal: match.ordinal },
                    ...(match.snippet ? { transcriptSnippet: match.snippet } : {})
                  }
                : {})
            }
          }),
    transcriptOnlyItems: transcriptOnlyItems.length ? transcriptOnlyItems : NO_WORKSPACE_TAB_ITEMS
  }
}
