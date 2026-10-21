import type { AppState } from '../../../types'
import { lastViewUnsavedFiles } from '@/components/editor/removal-unsaved-editor-files'
import {
  getEditorModelOwnerKey,
  resolveEditorModelOwner,
  type EditorModelOwner
} from '@/components/editor/editor-model-owner'
import { folderWorkspaceKey } from '../../../../../../shared/workspace-scope'

/** Set by a removal the user confirmed in a dialog that listed its unsaved files. */
export type RemovalUnsavedEditsOptions = { unsavedEditsConfirmed?: boolean }

/** Unsaved text a removal with no prompt closed, owned by that removal's notice alone. */
export type ClosedUnsavedFile = {
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  content: string
  lastKnownDiskSignature?: string
  runtimeEnvironmentId?: string | null
  externalSshTargetId?: string
  owner: EditorModelOwner
  /** Host-qualified model owner; a reopen must land on the same host. */
  ownerKey: string
}

function workspaceLabel(s: AppState, worktreeId: string): string {
  const worktree = Object.values(s.worktreesByRepo)
    .flat()
    .find((candidate) => candidate.id === worktreeId)
  const folder = s.folderWorkspaces?.find(
    (candidate) => folderWorkspaceKey(candidate.id) === worktreeId
  )
  return worktree?.displayName ?? folder?.name ?? worktreeId
}

/**
 * Captures removed tabs' unsaved text and offers it back in one toast. Runs inside purge updaters,
 * so the toast waits for the commit. A confirmed removal discards instead.
 */
export function noticeRemovedUnsavedFiles(
  s: AppState,
  removedFileIds: ReadonlySet<string>,
  options?: RemovalUnsavedEditsOptions
): void {
  if (options?.unsavedEditsConfirmed || removedFileIds.size === 0) {
    return
  }
  try {
    captureAndNotice(s, removedFileIds)
  } catch (error) {
    // Why: the notice is best-effort; it must never block the purge it runs inside.
    console.error('[editor] capturing unsaved edits from a removed workspace failed', error)
  }
}

function captureAndNotice(s: AppState, removedFileIds: ReadonlySet<string>): void {
  const closed: ClosedUnsavedFile[] = []
  for (const file of lastViewUnsavedFiles(s, removedFileIds)) {
    const content = s.editorDrafts[file.id]
    if (content === undefined) {
      console.warn('[editor] removed workspace closed a dirty tab with no draft text', {
        filePath: file.filePath,
        worktreeId: file.worktreeId
      })
      continue
    }
    closed.push({
      filePath: file.filePath,
      relativePath: file.relativePath,
      worktreeId: file.worktreeId,
      language: file.language,
      content,
      lastKnownDiskSignature: file.lastKnownDiskSignature,
      runtimeEnvironmentId: file.runtimeEnvironmentId,
      externalSshTargetId: file.externalSshTargetId,
      owner: resolveEditorModelOwner(file, s),
      ownerKey: getEditorModelOwnerKey(file, s)
    })
  }
  if (closed.length === 0) {
    return
  }
  const label = [...new Set(closed.map((file) => workspaceLabel(s, file.worktreeId)))].join(', ')
  console.warn('[editor] removed workspace closed files with unsaved edits', {
    workspaces: label,
    filePaths: closed.map((file) => file.filePath)
  })
  // Why lazy: keeps toast and editor-open code out of the store's import graph.
  queueMicrotask(() => {
    void import('@/components/editor/closed-unsaved-files-toast').then((module) =>
      module.showClosedUnsavedFilesToast(closed, label)
    )
  })
}
