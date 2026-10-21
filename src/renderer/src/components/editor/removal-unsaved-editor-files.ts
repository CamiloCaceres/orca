import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { editorBufferSiblingViewIds } from '@/store/slices/editor/buffers/editor-buffer-views'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { isPathInsideOrEqual } from '../../../../shared/cross-platform-path'
import { resolveEditorModelOwner } from './editor-model-owner'
import { flushPendingEditorBuffer } from './editor-pending-flush'
import { editorModelSiblingTabs, editorTabModelUri } from './editor-save-disk-precondition'

/** One workspace row a removal closes. */
export type EditorRemovalTarget = {
  worktreeId: string
  /** Host of the row; required to tell apart rows that share an id across hosts. */
  hostId?: ExecutionHostId | null
  /** Folder the removal deletes from disk. Unset when files stay (folder workspaces, forget, project removal). */
  deletedFolderPath?: string | null
  /** Its host can't take a save (disconnected or gone), so no file can be saved first. */
  unsavable?: boolean
}

export type RemovalUnsavedFiles = {
  /** Inside a deleted folder, so saving them is pointless. */
  discarded: OpenFile[]
  /** Still on disk afterwards, so they can be saved first. */
  surviving: OpenFile[]
}

function idsOnSeveralHosts(state: AppState): Set<string> {
  const hostsById = new Map<string, Set<string>>()
  for (const worktree of Object.values(state.worktreesByRepo ?? {}).flat()) {
    const hosts = hostsById.get(worktree.id) ?? new Set<string>()
    hosts.add(worktree.hostId ?? '')
    hostsById.set(worktree.id, hosts)
  }
  return new Set([...hostsById].filter(([, hosts]) => hosts.size > 1).map(([id]) => id))
}

function createTargetMatcher(
  state: AppState,
  targets: readonly EditorRemovalTarget[]
): (file: OpenFile) => EditorRemovalTarget | undefined {
  const twinIds = idsOnSeveralHosts(state)
  return (file) =>
    targets.find((target) => {
      if (target.worktreeId !== file.worktreeId) {
        return false
      }
      // Why: a same-id row on another host keeps its own tabs.
      if (!target.hostId || !twinIds.has(target.worktreeId)) {
        return true
      }
      return resolveEditorModelOwner(file, state).hostId === target.hostId
    })
}

function fileSurvives(state: AppState, file: OpenFile, target: EditorRemovalTarget): boolean {
  if (target.unsavable) {
    return false
  }
  if (!target.deletedFolderPath) {
    return true
  }
  const ownerHostId = resolveEditorModelOwner(file, state).hostId
  // Why: a file on another host than the deleted folder is not inside it, whatever its path says.
  if (target.hostId && ownerHostId && ownerHostId !== target.hostId) {
    return true
  }
  // Known limitation: lexical containment; a symlink into the folder is not resolved on the host.
  return !isPathInsideOrEqual(target.deletedFolderPath, file.filePath)
}

function hasUnsavedText(state: AppState, file: OpenFile): boolean {
  // Optional chain: minimal store assemblies in teardown tests omit drafts.
  return file.isDirty || state.editorDrafts?.[file.id] !== undefined
}

/**
 * Dirty tabs among `removedIds` whose every view (tab, shared model, shared record) is also
 * removed, one per model. Call `flushRemovalPendingEdits` first so delayed views have committed.
 */
export function lastViewUnsavedFiles(state: AppState, removedIds: ReadonlySet<string>): OpenFile[] {
  const seenModels = new Set<string>()
  const result: OpenFile[] = []
  for (const file of state.openFiles ?? []) {
    if (!removedIds.has(file.id) || file.mode !== 'edit' || !hasUnsavedText(state, file)) {
      continue
    }
    const modelSiblings = editorModelSiblingTabs(state, file)
    const viewIds = [
      ...modelSiblings.map((tab) => tab.id),
      ...editorBufferSiblingViewIds(state, file.id)
    ]
    if (viewIds.some((id) => !removedIds.has(id))) {
      continue
    }
    const modelKey = modelSiblings.length > 1 ? editorTabModelUri(state, file) : file.id
    if (!seenModels.has(modelKey)) {
      seenModels.add(modelKey)
      result.push(file)
    }
  }
  return result
}

/** Unsaved files a removal of `targets` would close, split by whether they outlive it on disk. */
export function collectRemovalUnsavedFiles(
  state: AppState,
  targets: readonly EditorRemovalTarget[]
): RemovalUnsavedFiles {
  const result: RemovalUnsavedFiles = { discarded: [], surviving: [] }
  if (targets.length === 0) {
    return result
  }
  const targetOf = createTargetMatcher(state, targets)
  const targetById = new Map<string, EditorRemovalTarget>()
  for (const file of state.openFiles ?? []) {
    const target = targetOf(file)
    if (target) {
      targetById.set(file.id, target)
    }
  }
  for (const file of lastViewUnsavedFiles(state, new Set(targetById.keys()))) {
    const target = targetById.get(file.id)
    if (target) {
      ;(fileSurvives(state, file, target) ? result.surviving : result.discarded).push(file)
    }
  }
  return result
}

/** Commits text still held by delayed views (rich Markdown, CSV, notebook) of the removed tabs. */
export function flushRemovalPendingEdits(
  state: Pick<AppState, 'openFiles' | 'editorBufferIdOf' | 'editorBufferViews'>,
  worktreeIds: Iterable<string>
): void {
  const ids = new Set(worktreeIds)
  // Optional: minimal store assemblies in purge tests omit open files.
  try {
    for (const file of state.openFiles ?? []) {
      if (ids.has(file.worktreeId)) {
        flushPendingEditorBuffer(state, file.id)
      }
    }
  } catch (error) {
    // Why: a view's flush failing must not block the removal that called it.
    console.error('[editor] flushing pending edits before a removal failed', error)
  }
}

/** Flushes, then collects from the state the flush produced. */
export function flushAndCollectRemovalUnsavedFiles(
  getState: () => AppState,
  targets: readonly EditorRemovalTarget[]
): RemovalUnsavedFiles {
  flushRemovalPendingEdits(
    getState(),
    targets.map((target) => target.worktreeId)
  )
  return collectRemovalUnsavedFiles(getState(), targets)
}

export function countRemovalUnsavedFiles(files: RemovalUnsavedFiles): number {
  return files.discarded.length + files.surviving.length
}
