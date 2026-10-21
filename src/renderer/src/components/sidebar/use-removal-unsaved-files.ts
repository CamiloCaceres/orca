import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store'
import { attemptEditorFileSave } from '@/components/editor/editor-file-save-attempt'
import {
  collectRemovalUnsavedFiles,
  countRemovalUnsavedFiles,
  flushAndCollectRemovalUnsavedFiles,
  flushRemovalPendingEdits,
  type EditorRemovalTarget,
  type RemovalUnsavedFiles
} from '@/components/editor/removal-unsaved-editor-files'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isFolderWorkspaceDelete } from './delete-worktree-dialog-copy'

/**
 * Removal targets for workspace rows. With `repoMap`, Git worktree folders count as deleted;
 * folder-project workspaces never delete their folder. Without it nothing is deleted from disk.
 */
export function toWorktreeEditorRemovalTargets(
  worktrees: readonly Pick<Worktree, 'id' | 'hostId' | 'path' | 'repoId'>[],
  repoMap: ReadonlyMap<string, Repo> | null
): EditorRemovalTarget[] {
  return worktrees.map((worktree) => ({
    worktreeId: worktree.id,
    hostId: worktree.hostId ?? null,
    deletedFolderPath: repoMap && !isFolderWorkspaceDelete(repoMap, worktree) ? worktree.path : null
  }))
}

const NO_FILES: RemovalUnsavedFiles = { discarded: [], surviving: [] }

/**
 * Unsaved editor files a removal confirm must list. `targets` must be memoized by the caller.
 * Saving surviving files is the only action; the files drop off the list as they turn clean.
 */
export function useRemovalUnsavedFiles(
  targets: readonly EditorRemovalTarget[],
  enabled: boolean
): {
  files: RemovalUnsavedFiles
  count: number
  isSaving: boolean
  saveSurviving: () => void
} {
  const openFiles = useAppStore((s) => s.openFiles)
  const editorDrafts = useAppStore((s) => s.editorDrafts)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (enabled) {
      // Why: rich Markdown, CSV and notebook views hold recent typing until they flush; the
      // flushed drafts land in the store, which re-runs the collect below.
      flushRemovalPendingEdits(
        useAppStore.getState(),
        targets.map((target) => target.worktreeId)
      )
    }
  }, [enabled, targets])

  const files = useMemo(
    () =>
      enabled
        ? collectRemovalUnsavedFiles(
            { ...useAppStore.getState(), openFiles, editorDrafts },
            targets
          )
        : NO_FILES,
    [enabled, targets, openFiles, editorDrafts]
  )

  const saveSurviving = (): void => {
    if (isSaving || files.surviving.length === 0) {
      return
    }
    setIsSaving(true)
    void Promise.all(files.surviving.map((file) => attemptEditorFileSave({ fileId: file.id })))
      // Failures already toasted; the unsaved files stay listed.
      .finally(() => setIsSaving(false))
  }

  return { files, count: countRemovalUnsavedFiles(files), isSaving, saveSurviving }
}

/** For flows that may skip their confirm: removing these rows would close unsaved editor files. */
export function removalHasUnsavedEditorFiles(
  getState: () => AppState,
  worktrees: readonly Pick<Worktree, 'id' | 'hostId' | 'path' | 'repoId'>[],
  deletesFolders = true
): boolean {
  const state = getState()
  const repoMap = deletesFolders ? new Map(state.repos.map((repo) => [repo.id, repo])) : null
  const targets = toWorktreeEditorRemovalTargets(worktrees, repoMap)
  return countRemovalUnsavedFiles(flushAndCollectRemovalUnsavedFiles(getState, targets)) > 0
}
