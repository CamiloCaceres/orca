import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import type { Worktree } from '../../../../shared/worktree/types'
import { registerPendingEditorFlush } from './editor-pending-flush'
import {
  collectRemovalUnsavedFiles,
  flushRemovalPendingEdits,
  lastViewUnsavedFiles
} from './removal-unsaved-editor-files'

// Owner = the SSH target the tab names, else the local host.
vi.mock('./editor-model-owner', () => {
  const owner = (file: { externalSshTargetId?: string }) => ({
    environmentId: null,
    hostId: file.externalSshTargetId ? `ssh:${file.externalSshTargetId}` : 'local'
  })
  return {
    resolveEditorModelOwner: owner,
    getEditorModelOwnerKey: (file: { externalSshTargetId?: string }) => JSON.stringify(owner(file))
  }
})

function tab(id: string, filePath: string, worktreeId: string, extra: Partial<OpenFile> = {}) {
  const file: OpenFile = {
    id,
    filePath,
    relativePath: id,
    worktreeId,
    language: 'plaintext',
    isDirty: true,
    mode: 'edit',
    ...extra
  }
  return file
}

function state(openFiles: OpenFile[], extra: Record<string, unknown> = {}): AppState {
  const editorBufferIdOf = Object.fromEntries(openFiles.map((file) => [file.id, file.id]))
  const editorBufferViews = Object.fromEntries(openFiles.map((file) => [file.id, [file.id]]))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the collector reads only these fields; the owner module is mocked.
  return {
    openFiles,
    editorDrafts: {},
    editorBufferIdOf,
    editorBufferViews,
    worktreesByRepo: {},
    markdownViewMode: {},
    editorViewMode: {},
    ...extra
  } as unknown as AppState
}

const gitTarget = { worktreeId: 'wt', hostId: null, deletedFolderPath: '/w/wt' }

describe('collectRemovalUnsavedFiles', () => {
  it('lists only dirty tabs of the removed workspace, split by whether they outlive it', () => {
    const files = collectRemovalUnsavedFiles(
      state([
        tab('inside', '/w/wt/a.ts', 'wt'),
        tab('outside', '/home/me/notes.txt', 'wt'),
        tab('clean', '/w/wt/b.ts', 'wt', { isDirty: false }),
        tab('other', '/w/other/a.ts', 'other')
      ]),
      [gitTarget]
    )
    expect(files.discarded.map((f) => f.id)).toEqual(['inside'])
    expect(files.surviving.map((f) => f.id)).toEqual(['outside'])
  })

  it('treats every file as surviving when the folder stays, and none when the host is gone', () => {
    const open = [tab('a', '/w/wt/a.ts', 'wt')]
    expect(collectRemovalUnsavedFiles(state(open), [{ worktreeId: 'wt' }]).surviving).toHaveLength(
      1
    )
    expect(
      collectRemovalUnsavedFiles(state(open), [{ worktreeId: 'wt', unsavable: true }]).discarded
    ).toHaveLength(1)
  })

  it('keeps a file on another host out of the deleted folder', () => {
    const files = collectRemovalUnsavedFiles(
      state([tab('remote', '/w/wt/a.ts', 'wt', { externalSshTargetId: 'other' })]),
      [{ ...gitTarget, hostId: 'local' }]
    )
    expect(files.surviving.map((f) => f.id)).toEqual(['remote'])
  })

  it('matches by host when another host publishes the same workspace id', () => {
    const rows: Partial<Worktree>[] = [
      { id: 'wt', hostId: 'local' },
      { id: 'wt', hostId: 'ssh:box' }
    ]
    const files = collectRemovalUnsavedFiles(
      state(
        [
          tab('ssh-file', '/w/wt/x.ts', 'wt', { externalSshTargetId: 'box' }),
          tab('local-file', '/w/wt/y.ts', 'wt')
        ],
        { worktreesByRepo: { repo: rows } }
      ),
      [{ ...gitTarget, hostId: 'local' }]
    )
    expect(files.discarded.map((f) => f.id)).toEqual(['local-file'])
    expect(files.surviving).toEqual([])
  })

  it('skips a dirty file whose record still has a view in a surviving workspace', () => {
    const a = tab('a', '/w/wt/a.ts', 'wt')
    const b = tab('b', '/w/wt/a.ts', 'other')
    const s = state([a, b], {
      editorBufferIdOf: { a: 'rec', b: 'rec' },
      editorBufferViews: { rec: ['a', 'b'] }
    })
    expect(lastViewUnsavedFiles(s, new Set(['a']))).toEqual([])
    // One model, so one entry.
    expect(lastViewUnsavedFiles(s, new Set(['a', 'b'])).map((f) => f.id)).toEqual(['a'])
  })

  it('skips a code view whose shared model has a view outside the removal, and counts a model once', () => {
    const a = tab('a', '/w/wt/a.ts', 'wt')
    const b = tab('b', '/w/wt/a.ts', 'wt2', { isDirty: false })
    expect(lastViewUnsavedFiles(state([a, b]), new Set(['a']))).toEqual([])
    const c = tab('c', '/w/wt/a.ts', 'wt2')
    expect(lastViewUnsavedFiles(state([a, c]), new Set(['a', 'c']))).toHaveLength(1)
  })

  it('counts a draft as unsaved even before the dirty flag lands', () => {
    const a = tab('a', '/w/wt/a.ts', 'wt', { isDirty: false })
    const files = collectRemovalUnsavedFiles(state([a], { editorDrafts: { a: 'typed' } }), [
      gitTarget
    ])
    expect(files.discarded).toHaveLength(1)
  })
})

describe('flushRemovalPendingEdits', () => {
  it('flushes delayed views of the removed workspaces only', () => {
    const removed = vi.fn()
    const kept = vi.fn()
    const unregisterRemoved = registerPendingEditorFlush('a', removed)
    const unregisterKept = registerPendingEditorFlush('b', kept)
    flushRemovalPendingEdits(state([tab('a', '/w/wt/a.md', 'wt'), tab('b', '/w/o/b.md', 'o')]), [
      'wt'
    ])
    expect(removed).toHaveBeenCalledTimes(1)
    expect(kept).not.toHaveBeenCalled()
    unregisterRemoved()
    unregisterKept()
  })
})
