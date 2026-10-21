import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { ClosedUnsavedFile } from '@/store/slices/worktrees/teardown/removed-workspace-unsaved-files'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { parseWorkspaceKey, folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { getEditorModelOwnerKey } from './editor-model-owner'
import {
  closedUnsavedFilesToastTitle,
  reopenUnsavedFilesFailedLabel,
  reopenUnsavedFilesLabel
} from '@/components/sidebar/removal-unsaved-files-copy'

function workspaceStillOpen(state: AppState, worktreeId: string): boolean {
  if (parseWorkspaceKey(worktreeId)?.type === 'folder') {
    return state.folderWorkspaces.some(
      (workspace) => folderWorkspaceKey(workspace.id) === worktreeId
    )
  }
  return state.allWorktrees().some((worktree) => worktree.id === worktreeId)
}

/** The tab to reopen in `worktreeId`, pinned to the closed file's host when it moved workspace. */
function reopenTab(
  closed: ClosedUnsavedFile,
  worktreeId: string
): Omit<OpenFile, 'id' | 'isDirty'> {
  const moved = worktreeId !== closed.worktreeId
  const sshTargetId =
    closed.externalSshTargetId ?? (moved ? parseSshTargetId(closed.owner.hostId) : undefined)
  return {
    filePath: closed.filePath,
    relativePath: closed.relativePath,
    worktreeId,
    language: closed.language,
    mode: 'edit',
    // Why: the next save is guarded against the version these edits came from.
    lastKnownDiskSignature: closed.lastKnownDiskSignature,
    ...(closed.runtimeEnvironmentId !== undefined || (moved && closed.owner.environmentId)
      ? { runtimeEnvironmentId: closed.runtimeEnvironmentId ?? closed.owner.environmentId }
      : {}),
    ...(sshTargetId ? { externalSshTargetId: sshTargetId } : {})
  }
}

function parseSshTargetId(hostId: string | null): string | undefined {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind === 'ssh' ? parsed.targetId : undefined
}

/** Reopens each file as an unsaved tab: its own workspace if still open, else the active one. */
export function reopenClosedUnsavedFiles(closed: readonly ClosedUnsavedFile[]): void {
  let failed = 0
  for (const file of closed) {
    const state = useAppStore.getState()
    const worktreeId = workspaceStillOpen(state, file.worktreeId)
      ? file.worktreeId
      : state.activeWorktreeId
    const tab = worktreeId ? reopenTab(file, worktreeId) : null
    // Why: a tab resolving to another host would save these edits to the wrong machine.
    if (
      !tab ||
      getEditorModelOwnerKey({ ...tab, id: '', isDirty: false }, state) !== file.ownerKey
    ) {
      failed += 1
      continue
    }
    const existing = new Set(state.openFiles.filter((open) => open.isDirty).map((open) => open.id))
    const fileId = state.openFile(tab)
    // Why: never overwrite edits a tab already open on that path holds.
    if (existing.has(fileId)) {
      failed += 1
      continue
    }
    state.setEditorDraft(fileId, file.content)
    state.markFileDirty(fileId, true)
  }
  if (failed > 0) {
    toast.error(reopenUnsavedFilesFailedLabel())
    console.warn('[editor] could not reopen closed unsaved files', { failed })
  }
}

/** One toast per removal; dismissing it drops the text, so the drop is logged. */
export function showClosedUnsavedFilesToast(
  closed: readonly ClosedUnsavedFile[],
  workspaceLabel: string
): void {
  let reopened = false
  toast.warning(closedUnsavedFilesToastTitle(closed.length, workspaceLabel), {
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: reopenUnsavedFilesLabel(),
      onClick: () => {
        reopened = true
        reopenClosedUnsavedFiles(closed)
      }
    },
    onDismiss: () => {
      if (!reopened) {
        console.warn('[editor] dropped unsaved edits from a removed workspace', {
          filePaths: closed.map((file) => file.filePath)
        })
      }
    }
  })
}
