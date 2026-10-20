import { useCallback, useMemo, useState } from 'react'
import { resolveWorktreeFilterHostId } from '@/components/cmd-j/palette-filter-options'
import type { PaletteSearchContext } from '@/lib/palette-match/palette-ranking'
import type { SearchableWorkspaceTab } from '@/lib/workspace-tab-palette-search'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import type { WorktreeJumpPaletteFilter } from './use-worktree-jump-palette-filter'
import type { WorktreeJumpPaletteTranscriptMatches } from './use-worktree-jump-palette-transcript-matches'
import type {
  BrowserPaletteItem,
  OpenTabPaletteItem,
  SimulatorPaletteItem,
  WorkspaceTabPaletteItem
} from './worktree-jump-palette-model'
import { buildOpenTabPaletteItems } from './worktree-jump-palette-open-tab-items'
import { mergeWorkspaceTabTranscriptMatches } from './worktree-jump-palette-transcript-matches'

type WorkspaceTabTranscriptMergeInput = Pick<WorktreeJumpPaletteFilter, 'filterModel'> &
  Pick<
    WorktreeJumpPaletteTranscriptMatches,
    'transcriptMatches' | 'transcriptEligibleTabs' | 'transcriptGenerationKey'
  > & {
    titleWorkspaceTabItems: WorkspaceTabPaletteItem[]
    workspaceTabEntries: readonly SearchableWorkspaceTab[]
    browserItems: BrowserPaletteItem[]
    simulatorItems: SimulatorPaletteItem[]
    paletteSearchContext: PaletteSearchContext
  }

function reserveWorkspaceTabExcerpt(
  item: WorkspaceTabPaletteItem,
  reserved: boolean
): WorkspaceTabPaletteItem {
  if (reserved) {
    return item.transcriptReserved ? item : { ...item, transcriptReserved: true }
  }
  if (!item.transcriptReserved && !item.transcriptSnippet && !item.transcript?.complete) {
    return item
  }
  return {
    id: item.id,
    type: item.type,
    result: item.result,
    transcriptReserved: false,
    ...(item.transcript ? { transcript: { ...item.transcript, complete: false } } : {})
  }
}

/** Merges transcript matches into the title-matched chats and assembles the open-tab rows. */
export function useWorkspaceTabTranscriptMerge({
  filterModel,
  transcriptMatches,
  transcriptEligibleTabs,
  transcriptGenerationKey,
  titleWorkspaceTabItems,
  workspaceTabEntries,
  browserItems,
  simulatorItems,
  paletteSearchContext
}: WorkspaceTabTranscriptMergeInput): {
  workspaceTabItems: WorkspaceTabPaletteItem[]
  openTabItems: OpenTabPaletteItem[]
} {
  // Host-less worktrees are local even while a runtime is focused; runtime-owned ones carry an owner id.
  const isLocalWorktree = useCallback(
    (worktree: Worktree) =>
      !worktree.runtimeOwnerEnvironmentId &&
      resolveWorktreeFilterHostId(worktree, filterModel.repoById, LOCAL_EXECUTION_HOST_ID) ===
        LOCAL_EXECUTION_HOST_ID,
    [filterModel]
  )
  const merged = useMemo(
    () =>
      mergeWorkspaceTabTranscriptMatches({
        titleItems: titleWorkspaceTabItems,
        entries: workspaceTabEntries,
        matches: transcriptMatches,
        context: paletteSearchContext,
        isLocalWorktree,
        eligibleTabs: transcriptEligibleTabs
      }),
    [
      isLocalWorktree,
      paletteSearchContext,
      titleWorkspaceTabItems,
      transcriptMatches,
      transcriptEligibleTabs,
      workspaceTabEntries
    ]
  )
  const currentReservations = useMemo(
    () =>
      new Map(
        [...merged.titleItems, ...merged.transcriptOnlyItems].map(
          (item) => [item.id, Boolean(item.transcriptReserved)] as const
        )
      ),
    [merged]
  )
  const [reservation, setReservation] = useState({
    key: transcriptGenerationKey,
    tabs: currentReservations
  })
  let reservedTabs = reservation.tabs
  if (
    reservation.key !== transcriptGenerationKey ||
    reservedTabs.size !== currentReservations.size ||
    [...currentReservations.keys()].some((key) => !reservedTabs.has(key))
  ) {
    // A surviving destination keeps its geometry through title/transcript match transitions.
    reservedTabs = new Map(
      [...currentReservations].map(
        ([key, eligible]) =>
          [
            key,
            reservation.key === transcriptGenerationKey
              ? (reservation.tabs.get(key) ?? eligible)
              : eligible
          ] as const
      )
    )
    setReservation({ key: transcriptGenerationKey, tabs: reservedTabs })
  }
  const { workspaceTabItems, transcriptOnlyItems } = useMemo(
    () => ({
      workspaceTabItems: merged.titleItems.map((item) =>
        reserveWorkspaceTabExcerpt(item, reservedTabs.get(item.id) ?? false)
      ),
      transcriptOnlyItems: merged.transcriptOnlyItems.map((item) =>
        reserveWorkspaceTabExcerpt(item, reservedTabs.get(item.id) ?? false)
      )
    }),
    [merged, reservedTabs]
  )
  const openTabItems = useMemo<OpenTabPaletteItem[]>(
    () =>
      buildOpenTabPaletteItems({
        browserItems,
        simulatorItems,
        workspaceTabItems,
        transcriptOnlyItems
      }),
    [browserItems, simulatorItems, transcriptOnlyItems, workspaceTabItems]
  )
  return { workspaceTabItems, openTabItems }
}
