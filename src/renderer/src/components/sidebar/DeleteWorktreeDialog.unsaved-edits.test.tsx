// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { OpenFile } from '@/store/slices/editor/types/open-file'

const mocks = vi.hoisted(() => {
  // Typed up here so the empty initialisers need no assertions.
  const modalData: Record<string, unknown> = {}
  const allWorktrees: Worktree[] = []
  const repos: Repo[] = []
  const openFiles: OpenFile[] = []
  const editorDrafts: Record<string, string> = {}
  const state = {
    activeModal: 'delete-worktree',
    modalData,
    closeModal: vi.fn(),
    removeWorktree: vi.fn(),
    clearWorktreeDeleteState: vi.fn(),
    allWorktrees,
    repos,
    worktreeLineageById: {},
    updateSettings: vi.fn(),
    openSettingsTarget: vi.fn(),
    openSettingsPage: vi.fn(),
    settings: null,
    sshTargetLabels: new Map<string, string>(),
    sshConnectionStates: new Map(),
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    gitStatusByWorktree: {},
    setGitStatus: vi.fn(),
    deleteStateByWorktreeId: {},
    openFiles,
    editorDrafts,
    openModal: vi.fn(),
    editorBufferIdOf: {},
    editorBufferViews: {}
  }
  return { state }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))

vi.mock('@/store/selectors', () => ({
  useAllWorktrees: () => mocks.state.allWorktrees,
  getWorktreeMapFromState: () => new Map(mocks.state.allWorktrees.map((w) => [w.id, w])),
  getWorktreeOnHostFromState: (_state: unknown, worktreeId: string) =>
    mocks.state.allWorktrees.find((w) => w.id === worktreeId)
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock('./delete-worktree-flow', () => ({ runWorktreeDeletesInParallel: vi.fn() }))

vi.mock('@/components/editor/editor-file-save-attempt', () => ({
  attemptEditorFileSave: vi.fn()
}))

vi.mock('@/components/editor/editor-model-owner', () => ({
  resolveEditorModelOwner: () => ({ environmentId: null, hostId: 'local' }),
  getEditorModelOwnerKey: () => ''
}))

vi.mock('./unsaved-removal-confirm', async (importOriginal) => importOriginal())

import { runWorktreeDeletesInParallel } from './delete-worktree-flow'
import { attemptEditorFileSave } from '@/components/editor/editor-file-save-attempt'
import DeleteWorktreeDialog from './DeleteWorktreeDialog'

const repo: Repo = {
  id: 'repo',
  path: '/repo',
  displayName: 'repo',
  badgeColor: 'gray',
  addedAt: 1
}

const workspace: Worktree = {
  id: 'wt',
  instanceId: 'wt-instance',
  repoId: 'repo',
  path: '/workspaces/wt',
  head: 'abc',
  branch: 'wt',
  isBare: false,
  isMainWorktree: false,
  displayName: 'wt',
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 1
}

function dirty(id: string, filePath: string): OpenFile {
  return {
    id,
    filePath,
    relativePath: id,
    worktreeId: 'wt',
    language: 'ts',
    isDirty: true,
    mode: 'edit'
  }
}

function deleteButton(): HTMLElement {
  return screen.getByRole('button', { name: /Delete Workspace/ })
}

describe('DeleteWorktreeDialog unsaved edits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.modalData = {
      worktreeId: workspace.id,
      worktreeDeleteIdentities: [{ id: workspace.id, instanceId: workspace.instanceId }]
    }
    mocks.state.allWorktrees = [workspace]
    mocks.state.repos = [repo]
    mocks.state.openFiles = []
    mocks.state.editorDrafts = {}
    vi.mocked(runWorktreeDeletesInParallel).mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
  })

  it('shows no warning when no removed tab holds unsaved edits', () => {
    render(<DeleteWorktreeDialog />)
    expect(screen.queryByText(/unsaved edits/)).toBeNull()
  })

  it('lists files inside a deleted Git worktree as discarded, with no Save', async () => {
    mocks.state.openFiles = [
      dirty('a.ts', '/workspaces/wt/a.ts'),
      dirty('b.ts', '/workspaces/wt/b.ts')
    ]
    render(<DeleteWorktreeDialog />)
    expect(
      await screen.findByText('Deleting discards unsaved edits in 2 files:')
    ).toBeInTheDocument()
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull()
  })

  it('deleting confirms the listed discards so no reopen toast follows', async () => {
    mocks.state.openFiles = [dirty('a.ts', '/workspaces/wt/a.ts')]
    render(<DeleteWorktreeDialog />)
    await screen.findByText('Deleting discards unsaved edits in 1 file:')
    fireEvent.click(deleteButton())
    expect(runWorktreeDeletesInParallel).toHaveBeenCalledWith(
      [workspace],
      expect.objectContaining({ unsavedEditsConfirmed: true })
    )
  })

  it('offers Save for files that survive, and blocks Delete and closing while saving', async () => {
    mocks.state.openFiles = [dirty('notes.md', '/home/me/notes.md')]
    let finishSave: (saved: boolean) => void = () => {}
    vi.mocked(attemptEditorFileSave).mockImplementation(
      () => new Promise<boolean>((resolve) => (finishSave = resolve))
    )
    render(<DeleteWorktreeDialog />)
    expect(
      await screen.findByText('Unsaved edits in 1 file are discarded unless you save it first:')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 File' }))

    await waitFor(() => expect(deleteButton()).toBeDisabled())
    expect(attemptEditorFileSave).toHaveBeenCalledWith({ fileId: 'notes.md' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.state.closeModal).not.toHaveBeenCalled()

    finishSave(true)
    await waitFor(() => expect(deleteButton()).not.toBeDisabled())
  })

  it('treats files of a folder-project workspace as surviving', async () => {
    mocks.state.repos = [{ ...repo, kind: 'folder' }]
    mocks.state.openFiles = [dirty('a.ts', '/workspaces/wt/a.ts')]
    render(<DeleteWorktreeDialog />)
    expect(await screen.findByRole('button', { name: 'Save 1 File' })).toBeInTheDocument()
  })
})

describe('confirm for removals that had none', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.openFiles = []
    mocks.state.editorDrafts = {}
    mocks.state.activeModal = 'none'
  })

  afterEach(() => {
    cleanup()
  })

  const request = {
    targets: [{ worktreeId: 'wt', hostId: null }],
    title: 'Delete Workspace',
    description: 'Delete wt from Orca.',
    confirmLabel: 'Delete Workspace'
  }

  it('runs at once when nothing unsaved would close', async () => {
    const { runAfterUnsavedRemovalConfirm } = await import('./unsaved-removal-confirm')
    const run = vi.fn()
    runAfterUnsavedRemovalConfirm(request, run)
    expect(run).toHaveBeenCalledWith({ unsavedEditsConfirmed: false })
    expect(mocks.state.openModal).not.toHaveBeenCalled()
  })

  it('lists the files, starts on Cancel, and runs only on confirm', async () => {
    mocks.state.openFiles = [dirty('a.ts', '/workspaces/wt/a.ts')]
    const { runAfterUnsavedRemovalConfirm } = await import('./unsaved-removal-confirm')
    const { default: ConfirmUnsavedRemovalDialog } = await import('./ConfirmUnsavedRemovalDialog')
    const run = vi.fn()
    runAfterUnsavedRemovalConfirm(request, run)
    expect(run).not.toHaveBeenCalled()
    const [modal, data] = mocks.state.openModal.mock.calls[0]
    expect(modal).toBe('confirm-unsaved-removal')
    mocks.state.activeModal = 'confirm-unsaved-removal'
    mocks.state.modalData = data
    render(<ConfirmUnsavedRemovalDialog />)
    expect(await screen.findByText('a.ts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Delete Workspace/ }))
    expect(run).toHaveBeenCalledWith({ unsavedEditsConfirmed: true })
  })
})
