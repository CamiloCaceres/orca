import { useAppStore } from '@/store'
import {
  countRemovalUnsavedFiles,
  flushAndCollectRemovalUnsavedFiles,
  type EditorRemovalTarget
} from '@/components/editor/removal-unsaved-editor-files'

export type UnsavedRemovalRun = (options: { unsavedEditsConfirmed: boolean }) => void

export type UnsavedRemovalConfirmRequest = {
  targets: readonly EditorRemovalTarget[]
  title: string
  description: string
  confirmLabel: string
}

type PendingRequest = UnsavedRemovalConfirmRequest & { run: UnsavedRemovalRun }

let nextRequestId = 0
// Why a map: modalData can't carry a typed callback; each entry lives only while its modal is open.
const pendingRequests = new Map<string, PendingRequest>()

/**
 * For removals with no confirm of their own: runs at once unless the removal would close
 * unsaved editor files, in which case a confirm listing them runs it instead.
 */
export function runAfterUnsavedRemovalConfirm(
  request: UnsavedRemovalConfirmRequest,
  run: UnsavedRemovalRun
): void {
  const files = flushAndCollectRemovalUnsavedFiles(useAppStore.getState, request.targets)
  if (countRemovalUnsavedFiles(files) === 0) {
    run({ unsavedEditsConfirmed: false })
    return
  }
  nextRequestId += 1
  const requestId = `unsaved-removal-${nextRequestId}`
  pendingRequests.set(requestId, { ...request, run })
  useAppStore.getState().openModal('confirm-unsaved-removal', { requestId })
}

export function getUnsavedRemovalRequest(requestId: unknown): PendingRequest | undefined {
  return typeof requestId === 'string' ? pendingRequests.get(requestId) : undefined
}

export function settleUnsavedRemovalRequest(requestId: unknown): void {
  if (typeof requestId === 'string') {
    pendingRequests.delete(requestId)
  }
}
