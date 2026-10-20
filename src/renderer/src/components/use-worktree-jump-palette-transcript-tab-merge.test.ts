// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { searchWorkspaceTabs } from '@/lib/workspace-tab-palette-search'
import { createPaletteSearchContext } from '@/lib/palette-match/palette-ranking'
import { buildPaletteFilterModel } from './cmd-j/palette-filter-options'
import { transcriptTab } from './cmd-j/palette-transcript-test-fixture'
import { buildWorkspaceTabPaletteItems } from './worktree-jump-palette-open-tab-items'
import {
  terminalTabKey,
  type PaletteTranscriptMatch
} from './worktree-jump-palette-transcript-matches'
import { useWorkspaceTabTranscriptMerge } from './use-worktree-jump-palette-transcript-tab-merge'

afterEach(cleanup)

const context = createPaletteSearchContext(10000)
const shell = transcriptTab('shell', 'refresh shell')
const newChat = transcriptTab('new', 'Conversation')
const snippet = { text: 'a refresh here', ranges: [{ start: 2, end: 9 }] }
const match = (id: string, ordinal: number): PaletteTranscriptMatch => ({
  worktreeId: 'workspace',
  terminalTabId: id,
  ordinal,
  complete: true,
  snippet,
  windows: []
})
const titleItems = (entries: readonly ReturnType<typeof transcriptTab>[]) =>
  buildWorkspaceTabPaletteItems(searchWorkspaceTabs(entries, 'refresh', { context }))

function input(): Parameters<typeof useWorkspaceTabTranscriptMerge>[0] {
  return {
    filterModel: buildPaletteFilterModel({
      repos: [],
      worktrees: [shell.worktree],
      hostOptions: [],
      projects: [],
      projectHostSetups: []
    }),
    transcriptMatches: [],
    transcriptEligibleTabs: new Set(),
    transcriptGenerationKey: 'query',
    titleWorkspaceTabItems: titleItems([shell]),
    workspaceTabEntries: [shell],
    browserItems: [],
    simulatorItems: [],
    paletteSearchContext: context
  }
}

it('freezes existing geometry while newly arriving destinations reserve their own excerpts', () => {
  const initialProps = input()
  const { result, rerender } = renderHook(useWorkspaceTabTranscriptMerge, { initialProps })
  expect(result.current.workspaceTabItems[0].transcriptReserved).toBeFalsy()
  rerender({
    ...initialProps,
    transcriptEligibleTabs: new Set([terminalTabKey('workspace', 'shell')])
  })
  expect(result.current.workspaceTabItems[0].transcriptReserved).toBeFalsy()

  const enriched = {
    ...initialProps,
    workspaceTabEntries: [shell, newChat],
    transcriptMatches: [match('shell', 0), match('new', 1)],
    transcriptEligibleTabs: new Set([
      terminalTabKey('workspace', 'shell'),
      terminalTabKey('workspace', 'new')
    ])
  }
  rerender(enriched)
  expect(result.current.workspaceTabItems[0]).toMatchObject({
    transcriptReserved: false,
    transcript: { complete: false }
  })
  expect(result.current.workspaceTabItems[0]).not.toHaveProperty('transcriptSnippet')
  expect(result.current.openTabItems).toContainEqual(
    expect.objectContaining({ transcriptReserved: true, transcriptSnippet: snippet })
  )

  const renamedChat = transcriptTab('new', 'refresh new')
  rerender({
    ...enriched,
    workspaceTabEntries: [shell, renamedChat],
    titleWorkspaceTabItems: titleItems([shell, renamedChat]),
    transcriptMatches: [],
    transcriptEligibleTabs: new Set()
  })
  expect(
    result.current.workspaceTabItems.find((item) => item.result.tabId === 'new')
  ).toMatchObject({ transcriptReserved: true })
  expect(
    result.current.workspaceTabItems.find((item) => item.result.tabId === 'shell')
      ?.transcriptReserved
  ).toBeFalsy()

  rerender({ ...enriched, titleWorkspaceTabItems: [] })
  expect(
    result.current.openTabItems.find(
      (item) => item.type === 'workspace-tab' && item.result.tabId === 'shell'
    )
  ).toMatchObject({ transcriptReserved: false, transcript: { complete: false } })

  rerender({ ...enriched, transcriptGenerationKey: 'new query' })
  expect(result.current.workspaceTabItems[0]).toMatchObject({
    transcriptReserved: true,
    transcriptSnippet: snippet,
    transcript: { complete: true }
  })
})

it('forgets removed destinations and evaluates them again when they return', () => {
  const initialProps = input()
  const { result, rerender } = renderHook(useWorkspaceTabTranscriptMerge, { initialProps })
  rerender({ ...initialProps, workspaceTabEntries: [], titleWorkspaceTabItems: [] })
  expect(result.current.openTabItems).toEqual([])
  rerender({
    ...initialProps,
    transcriptMatches: [match('shell', 0)],
    transcriptEligibleTabs: new Set([terminalTabKey('workspace', 'shell')])
  })
  expect(result.current.workspaceTabItems[0]).toMatchObject({
    transcriptReserved: true,
    transcriptSnippet: snippet
  })
})
