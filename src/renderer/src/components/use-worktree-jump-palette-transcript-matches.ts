import { useCallback, useMemo, useState } from 'react'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { SESSION_SEARCH_LIMIT_MAX } from '../../../shared/ai-vault-search-limit'
import { resolveAiVaultSearchSettings } from '../../../shared/ai-vault-search-settings'
import {
  aiVaultSearchNeedsLocalConsent,
  useAiVaultSearch
} from './right-sidebar/use-ai-vault-search'
import {
  fitPaletteTranscriptMatches,
  resolvePaletteTranscriptEligibleTabs,
  resolvePaletteTranscriptMatches,
  type PaletteTranscriptMatch
} from './worktree-jump-palette-transcript-matches'
import type { PaletteTranscriptSnippet } from './worktree-jump-palette-model'
import type { WorktreeJumpPaletteLocalState } from './use-worktree-jump-palette-local-state'
import type { WorktreeJumpPaletteStoreState } from './use-worktree-jump-palette-store-state'
import type { AiVaultSearchHit } from '../../../shared/ai-vault-search-types'
import {
  classifyPaletteTranscriptProof,
  preparePaletteTranscriptProofQuery
} from './cmd-j/palette-transcript-proof'

const TRANSCRIPT_MATCH_DEBOUNCE_MS = 120
const NO_HITS: readonly AiVaultSearchHit[] = []
const NO_MATCHES: readonly PaletteTranscriptMatch[] = []

type TranscriptMatchesInput = Pick<
  WorktreeJumpPaletteStoreState,
  | 'settings'
  | 'visible'
  | 'agentStatusByPaneKey'
  | 'retainedAgentsByPaneKey'
  | 'sleepingAgentSessionsByPaneKey'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
> &
  Pick<WorktreeJumpPaletteLocalState, 'deferredQuery' | 'query' | 'filter'>

/** This desktop's evidence, invalidated on raw input before deferred work commits. */
export function useWorktreeJumpPaletteTranscriptMatches({
  settings,
  visible,
  agentStatusByPaneKey,
  retainedAgentsByPaneKey,
  sleepingAgentSessionsByPaneKey,
  tabsByWorktree,
  terminalLayoutsByTabId,
  deferredQuery,
  query,
  filter
}: TranscriptMatchesInput) {
  const policy = useMemo(() => resolveAiVaultSearchSettings(settings), [settings])
  const transcriptGenerationKey = JSON.stringify([query, filter, policy, visible])
  const transcriptSearchEnabled =
    visible &&
    query.trim().length > 0 &&
    !aiVaultSearchNeedsLocalConsent(LOCAL_EXECUTION_HOST_ID, policy.enabled)
  const request = useMemo(
    () =>
      transcriptSearchEnabled && deferredQuery === query
        ? { query: query.trim(), limit: SESSION_SEARCH_LIMIT_MAX }
        : null,
    [transcriptSearchEnabled, deferredQuery, query]
  )
  const { hits } = useAiVaultSearch(
    request,
    LOCAL_EXECUTION_HOST_ID,
    transcriptGenerationKey,
    TRANSCRIPT_MATCH_DEBOUNCE_MS
  )
  const paneState = useMemo(
    () => ({
      agentStatusByPaneKey,
      retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey,
      tabsByWorktree,
      terminalLayoutsByTabId
    }),
    [
      agentStatusByPaneKey,
      retainedAgentsByPaneKey,
      sleepingAgentSessionsByPaneKey,
      tabsByWorktree,
      terminalLayoutsByTabId
    ]
  )
  const stableHits = hits.length ? hits : NO_HITS
  const proofWindows = useMemo(() => {
    const requirements = preparePaletteTranscriptProofQuery(query)
    return new Map(
      stableHits
        .slice(0, SESSION_SEARCH_LIMIT_MAX)
        .map((hit) => [
          hit,
          classifyPaletteTranscriptProof(hit.evidence?.originalExcerpt?.text ?? '', requirements)
        ])
    )
  }, [stableHits, query])
  const candidates = useMemo(
    () => resolvePaletteTranscriptMatches(stableHits, paneState, query, proofWindows),
    [stableHits, paneState, query, proofWindows]
  )
  const transcriptEligibleTabs = useMemo(
    () =>
      transcriptSearchEnabled ? resolvePaletteTranscriptEligibleTabs(paneState) : new Set<string>(),
    [paneState, transcriptSearchEnabled]
  )
  const [measured, setMeasured] = useState<{
    proofWindows: typeof proofWindows
    fits: ReadonlyMap<number, PaletteTranscriptSnippet>
    displayKey: string
  } | null>(null)
  const onFits = useCallback(
    (fits: ReadonlyMap<number, PaletteTranscriptSnippet>, displayKey: string) => {
      setMeasured({ proofWindows, fits, displayKey })
    },
    [proofWindows]
  )
  const transcriptMatches = useMemo(
    () =>
      measured?.proofWindows === proofWindows
        ? fitPaletteTranscriptMatches(candidates, measured.fits)
        : NO_MATCHES,
    [candidates, measured, proofWindows]
  )
  return {
    transcriptMatches,
    transcriptEligibleTabs,
    transcriptGenerationKey,
    transcriptDisplayKey: measured?.displayKey ?? '',
    transcriptSearchEnabled,
    transcriptMeasurement: { generationKey: transcriptGenerationKey, candidates, onFits }
  }
}

export type WorktreeJumpPaletteTranscriptMatches = ReturnType<
  typeof useWorktreeJumpPaletteTranscriptMatches
>
