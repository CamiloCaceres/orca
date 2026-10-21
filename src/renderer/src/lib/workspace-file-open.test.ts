import { beforeEach, expect, it, vi } from 'vitest'
import { openWorkspaceFile } from './workspace-file-open'
import type { GitStatusEntry } from '../../../shared/git-status-types'

const mocks = vi.hoisted(() => {
  const gitStatusByWorktree: Record<string, GitStatusEntry[]> = {}
  return {
    resolve: vi.fn(),
    plan: vi.fn(),
    open: vi.fn(),
    select: vi.fn(),
    state: {
      activeWorktreeId: 'current',
      gitStatusByWorktree,
      openBranchDiff: vi.fn(),
      openDiff: vi.fn(),
      openFile: vi.fn((file: { filePath: string }) => file.filePath)
    }
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('./workspace-doc-address-input', () => ({
  resolveWorkspaceDocAddressTarget: mocks.resolve
}))
vi.mock('./file-preview', () => ({
  openFileInBrowserTab: mocks.open,
  getWorkspaceFilePreviewPlan: mocks.plan
}))
vi.mock('./workspace-surface-reveal', () => ({ selectWorkspaceSurface: mocks.select }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.gitStatusByWorktree = {}
  mocks.resolve.mockReturnValue({ status: 'not-a-workspace-doc' })
  mocks.open.mockReturnValue({ status: 'browser-tab' })
  mocks.plan.mockReturnValue({ status: 'browser-tab' })
})

const request = {
  kind: 'preview' as const,
  filePath: '/repo/report one.html',
  worktreeId: 'current',
  targetGroupId: 'group-2'
}

function sourceFile(filePath: string) {
  return {
    filePath,
    relativePath: filePath,
    worktreeId: 'current',
    language: 'plaintext',
    mode: 'edit' as const
  }
}

it.each(['/repo/report.html', '/repo/report.HTM', 'C:\\repo\\report.HTML'])(
  'opens the default HTML surface for %s',
  (filePath) => {
    expect(
      openWorkspaceFile({
        kind: 'file',
        file: sourceFile(filePath),
        options: { targetGroupId: 'group-2' }
      })
    ).toEqual({ surface: 'preview' })
    expect(mocks.open).toHaveBeenCalledWith({
      filePath,
      worktreeId: 'current',
      targetGroupId: 'group-2'
    })
    expect(mocks.state.openFile).not.toHaveBeenCalled()
  }
)

it.each(['/repo/index.ts', '/repo/page.jsp', '/repo/page.html.liquid'])(
  'opens non-HTML files in the editor: %s',
  (filePath) => {
    const file = sourceFile(filePath)
    openWorkspaceFile({ kind: 'file', file })
    expect(mocks.state.openFile).toHaveBeenCalledWith(file, undefined)
    expect(mocks.open).not.toHaveBeenCalled()
  }
)

it('keeps an explicit source request in the editor', () => {
  const file = sourceFile('/repo/report.html')
  openWorkspaceFile({ kind: 'file', intent: 'source', file, options: { preview: false } })
  expect(mocks.state.openFile).toHaveBeenCalledWith(file, { preview: false })
  expect(mocks.plan).not.toHaveBeenCalled()
  expect(mocks.open).not.toHaveBeenCalled()
})

it('keeps a host-granted HTML artifact on its authorized editor path', () => {
  const file = { ...sourceFile('/outside/report.html'), terminalArtifactGrantId: 'grant-1' }
  openWorkspaceFile({ kind: 'file', file })
  expect(mocks.state.openFile).toHaveBeenCalledWith(file, undefined)
  expect(mocks.open).not.toHaveBeenCalled()
})

it('falls back to the editor when the owning host cannot preview HTML', () => {
  mocks.plan.mockReturnValue({ status: 'unsupported', reason: 'no-channel' })
  const file = sourceFile('/repo/report.html')
  openWorkspaceFile({ kind: 'file', file })
  expect(mocks.state.openFile).toHaveBeenCalledWith(file, undefined)
  expect(mocks.open).not.toHaveBeenCalled()
})

const branchRequest = {
  kind: 'branch',
  worktreeId: 'current',
  worktreePath: '/repo',
  entry: { path: 'report.html', status: 'modified' },
  compare: {
    baseRef: 'main',
    baseOid: 'base',
    compareRef: 'HEAD',
    headOid: 'head',
    mergeBase: 'base'
  }
} as const

it.each([
  [{ path: 'report.html', status: 'deleted', area: 'staged' }],
  [{ path: 'report.html', status: 'deleted', area: 'unstaged' }],
  [{ path: 'renamed.html', oldPath: 'report.html', status: 'renamed', area: 'staged' }]
] satisfies GitStatusEntry[][])(
  'opens a committed diff when the working file is absent: %j',
  (...changes) => {
    mocks.state.gitStatusByWorktree.current = changes

    expect(openWorkspaceFile(branchRequest)).toEqual({ surface: 'diff' })
    expect(mocks.state.openBranchDiff).toHaveBeenCalledWith(
      'current',
      '/repo',
      branchRequest.entry,
      branchRequest.compare,
      'html',
      undefined
    )
    expect(mocks.open).not.toHaveBeenCalled()
  }
)

it.each([
  { path: 'report.html', status: 'deleted', area: 'staged' },
  { path: 'renamed.html', oldPath: 'report.html', status: 'renamed', area: 'staged' }
] satisfies GitStatusEntry[])(
  'previews a recreated working file after a staged $status',
  (stagedChange) => {
    const entry: GitStatusEntry = { path: 'report.html', status: 'untracked', area: 'untracked' }
    mocks.state.gitStatusByWorktree.current = [stagedChange, entry]

    expect(openWorkspaceFile(branchRequest)).toEqual({ surface: 'preview' })
    expect(
      openWorkspaceFile({
        kind: 'uncommitted',
        worktreeId: 'current',
        worktreePath: '/repo',
        entry
      })
    ).toEqual({ surface: 'preview' })
    expect(mocks.open).toHaveBeenCalledWith({
      filePath: '/repo/report.html',
      worktreeId: 'current',
      targetGroupId: undefined
    })
    expect(mocks.state.openBranchDiff).not.toHaveBeenCalled()
    expect(mocks.state.openDiff).not.toHaveBeenCalled()
  }
)

it.each([
  { path: 'report.html', oldPath: 'before.html', status: 'renamed', area: 'staged' },
  { path: 'copy.html', oldPath: 'report.html', status: 'copied', area: 'staged' }
] satisfies GitStatusEntry[])(
  'previews the existing file after a staged $status to $path',
  (change) => {
    mocks.state.gitStatusByWorktree.current = [change]

    expect(openWorkspaceFile(branchRequest)).toEqual({ surface: 'preview' })
    expect(mocks.open).toHaveBeenCalledWith({
      filePath: '/repo/report.html',
      worktreeId: 'current',
      targetGroupId: undefined
    })
    expect(mocks.state.openBranchDiff).not.toHaveBeenCalled()
  }
)

it('keeps a local HTML preview in the requested group', () => {
  openWorkspaceFile(request)
  expect(mocks.resolve).toHaveBeenCalledWith(mocks.state, 'current', request.filePath)
  expect(mocks.open).toHaveBeenCalledWith({
    filePath: request.filePath,
    worktreeId: request.worktreeId,
    targetGroupId: request.targetGroupId
  })
  expect(mocks.select).not.toHaveBeenCalled()
})

it('opens a sibling remote document in its owning workspace', () => {
  mocks.resolve.mockReturnValue({ status: 'workspace-doc', docLocation: { worktreeId: 'sibling' } })
  mocks.open.mockReturnValue({ status: 'doc-preview' })
  openWorkspaceFile(request)
  expect(mocks.select).toHaveBeenCalledWith(mocks.state, 'sibling')
  expect(mocks.open).toHaveBeenCalledWith({ filePath: request.filePath, worktreeId: 'sibling' })
})

it('reports a refused host without creating a preview', () => {
  mocks.resolve.mockReturnValue({ status: 'unsupported', message: 'outside workspace' })
  expect(() => openWorkspaceFile(request)).toThrow('outside workspace')
  expect(mocks.open).not.toHaveBeenCalled()
})

it('reports a preview plan refusal', () => {
  mocks.open.mockReturnValue({ status: 'unsupported', message: 'unknown host' })
  expect(() => openWorkspaceFile(request)).toThrow('unknown host')
})
