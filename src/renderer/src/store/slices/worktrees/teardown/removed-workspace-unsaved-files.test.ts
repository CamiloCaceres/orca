import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../../../types'
import type { OpenFile } from '../../editor/types/open-file'
import { noticeRemovedUnsavedFiles } from './removed-workspace-unsaved-files'
import { applyRemoveWorktreeSuccessState } from './remove-worktree-store-cleanup'

const mocks = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock('@/components/editor/closed-unsaved-files-toast', () => ({
  showClosedUnsavedFilesToast: mocks.show
}))
vi.mock('@/components/editor/editor-model-owner', () => ({
  resolveEditorModelOwner: () => ({ environmentId: null, hostId: 'ssh:box' }),
  getEditorModelOwnerKey: () => '[null,"ssh:box"]'
}))

function tab(id: string, worktreeId: string, isDirty = true): OpenFile {
  return {
    id,
    filePath: `/w/${worktreeId}/${id}`,
    relativePath: id,
    worktreeId,
    language: 'markdown',
    isDirty,
    mode: 'edit',
    lastKnownDiskSignature: `sig-${id}`
  }
}

function state(openFiles: OpenFile[], editorDrafts: Record<string, string>): AppState {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the capture and cleanup read only these fields; the owner module is mocked.
  return {
    openFiles,
    editorDrafts,
    editorBufferIdOf: Object.fromEntries(openFiles.map((f) => [f.id, f.id])),
    editorBufferViews: Object.fromEntries(openFiles.map((f) => [f.id, [f.id]])),
    worktreesByRepo: { repo: [{ id: 'wt', displayName: 'Feature work' }] },
    folderWorkspaces: [],
    tabsByWorktree: {},
    everActivatedWorktreeIds: new Set<string>(),
    lastVisitedAtByWorktreeId: {},
    deleteStateByWorktreeId: {},
    sortEpoch: 0
  } as unknown as AppState
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('unsaved files closed by a removal with no prompt', () => {
  beforeEach(() => {
    mocks.show.mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('offers the text back in one toast, keyed to its host', async () => {
    noticeRemovedUnsavedFiles(
      state([tab('a.md', 'wt'), tab('b.md', 'wt'), tab('c.md', 'wt', false)], {
        'a.md': 'draft a',
        'b.md': 'draft b'
      }),
      new Set(['a.md', 'b.md', 'c.md'])
    )
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledTimes(1))
    const [closed, label] = mocks.show.mock.calls[0]
    expect(label).toBe('Feature work')
    expect(closed).toEqual([
      expect.objectContaining({
        filePath: '/w/wt/a.md',
        content: 'draft a',
        lastKnownDiskSignature: 'sig-a.md',
        ownerKey: '[null,"ssh:box"]'
      }),
      expect.objectContaining({ filePath: '/w/wt/b.md', content: 'draft b' })
    ])
  })

  it('stays quiet for a removal the user confirmed with the files listed', async () => {
    noticeRemovedUnsavedFiles(state([tab('a.md', 'wt')], { 'a.md': 'x' }), new Set(['a.md']), {
      unsavedEditsConfirmed: true
    })
    await flushMicrotasks()
    expect(mocks.show).not.toHaveBeenCalled()
  })

  it('runs from the removal teardown and still drops the tab state', async () => {
    let current = state([tab('a.md', 'wt')], { 'a.md': 'unsaved' })
    applyRemoveWorktreeSuccessState(
      (update) => {
        current = { ...current, ...(typeof update === 'function' ? update(current) : update) }
      },
      'wt',
      new Set()
    )
    expect(current.editorDrafts).toEqual({})
    await vi.waitFor(() => expect(mocks.show).toHaveBeenCalledTimes(1))
  })
})
