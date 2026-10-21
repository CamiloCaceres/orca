import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'
import { runAfterUnsavedRemovalConfirm, type UnsavedRemovalRun } from './unsaved-removal-confirm'

/** Every folder-workspace delete (card action, context menu, hovered shortcut) goes through here. */
export function runFolderWorkspaceDeleteAfterUnsavedConfirm(
  folderWorkspaceId: string,
  executionHostId: ExecutionHostId | undefined,
  run: UnsavedRemovalRun
): void {
  const name =
    useAppStore.getState().folderWorkspaces.find((workspace) => workspace.id === folderWorkspaceId)
      ?.name ?? folderWorkspaceId
  runAfterUnsavedRemovalConfirm(
    {
      // Why no deleted folder: deleting a folder workspace keeps the folder, so every file survives.
      targets: [{ worktreeId: folderWorkspaceKey(folderWorkspaceId), hostId: executionHostId }],
      title: translate('components.workspace.delete.unsavedEdits.folderTitle', 'Delete Workspace'),
      description: translate(
        'components.workspace.delete.unsavedEdits.folderDescription',
        'Delete {{name}} from Orca. The folder on disk will not be deleted.',
        { name }
      ),
      confirmLabel: translate(
        'components.workspace.delete.unsavedEdits.folderConfirm',
        'Delete Workspace'
      )
    },
    run
  )
}
