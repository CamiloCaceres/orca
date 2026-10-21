import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClosedUnsavedFile } from '@/store/slices/worktrees/teardown/removed-workspace-unsaved-files'

const mocks = vi.hoisted(() => {
  // Typed up here so the initialisers need no assertions.
  const activeWorktreeId: string | null = 'active-wt'
  const openFiles: { id: string; isDirty: boolean }[] = []
  const worktrees: { id: string }[] = []
  const state = {
    activeWorktreeId,
    folderWorkspaces: [],
    openFiles,
    worktrees,
    allWorktrees: () => state.worktrees,
    openFile: vi.fn(
      (file: { filePath: string; worktreeId: string }) => `${file.worktreeId}:${file.filePath}`
    ),
    setEditorDraft: vi.fn(),
    markFileDirty: vi.fn()
  }
  return { state, toastWarning: vi.fn(), toastError: vi.fn() }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('sonner', () => ({ toast: { warning: mocks.toastWarning, error: mocks.toastError } }))
// The owner key is the SSH target the tab names, else local.
vi.mock('./editor-model-owner', () => ({
  getEditorModelOwnerKey: (file: { externalSshTargetId?: string }) =>
    file.externalSshTargetId ? `ssh:${file.externalSshTargetId}` : 'local'
}))

import { reopenClosedUnsavedFiles, showClosedUnsavedFilesToast } from './closed-unsaved-files-toast'

function closed(extra: Partial<ClosedUnsavedFile> = {}): ClosedUnsavedFile {
  return {
    filePath: '/w/gone/a.md',
    relativePath: 'a.md',
    worktreeId: 'gone-wt',
    language: 'markdown',
    content: 'unsaved text',
    lastKnownDiskSignature: 'sig',
    owner: { environmentId: null, hostId: 'local' },
    ownerKey: 'local',
    ...extra
  }
}

describe('closed unsaved files toast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.activeWorktreeId = 'active-wt'
    mocks.state.openFiles = []
    mocks.state.worktrees = []
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('reopens into the active workspace as an unsaved tab guarded by the old baseline', () => {
    reopenClosedUnsavedFiles([closed()])
    expect(mocks.state.openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/w/gone/a.md',
        worktreeId: 'active-wt',
        mode: 'edit',
        lastKnownDiskSignature: 'sig'
      })
    )
    expect(mocks.state.setEditorDraft).toHaveBeenCalledWith(
      'active-wt:/w/gone/a.md',
      'unsaved text'
    )
    expect(mocks.state.markFileDirty).toHaveBeenCalledWith('active-wt:/w/gone/a.md', true)
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('reopens into its own workspace when that is still open', () => {
    mocks.state.worktrees = [{ id: 'gone-wt' }]
    reopenClosedUnsavedFiles([closed()])
    expect(mocks.state.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'gone-wt' })
    )
  })

  it('pins an SSH file to its host when it moves workspace, and refuses an unreachable owner', () => {
    reopenClosedUnsavedFiles([
      closed({ owner: { environmentId: null, hostId: 'ssh:box' }, ownerKey: 'ssh:box' })
    ])
    expect(mocks.state.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ externalSshTargetId: 'box' })
    )
    mocks.state.openFile.mockClear()
    reopenClosedUnsavedFiles([closed({ ownerKey: 'runtime:elsewhere' })])
    expect(mocks.state.openFile).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('never overwrites a dirty tab already open on that path', () => {
    mocks.state.openFiles = [{ id: 'active-wt:/w/gone/a.md', isDirty: true }]
    reopenClosedUnsavedFiles([closed()])
    expect(mocks.state.setEditorDraft).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('shows one toast with Reopen, and logs the drop when dismissed', () => {
    showClosedUnsavedFilesToast([closed(), closed({ filePath: '/w/gone/b.md' })], 'Feature work')
    expect(mocks.toastWarning).toHaveBeenCalledTimes(1)
    const [title, options] = mocks.toastWarning.mock.calls[0]
    expect(title).toBe('Closed 2 files with unsaved edits from Feature work')
    expect(options.action.label).toBe('Reopen')
    options.onDismiss()
    expect(console.warn).toHaveBeenCalledWith(
      '[editor] dropped unsaved edits from a removed workspace',
      { filePaths: ['/w/gone/a.md', '/w/gone/b.md'] }
    )
  })
})
