// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { searchHit } from '../../../shared/ai-vault-search-test-fixture'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { useWorktreeJumpPaletteTranscriptMatches } from './use-worktree-jump-palette-transcript-matches'
import { EMPTY_PALETTE_FILTER } from './cmd-j/palette-filter'
import { LEAF_ID, makeAgentEntry, makeTerminalTab } from './worktree-jump-palette-test-fixtures'

const { search } = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('./right-sidebar/use-ai-vault-search', () => ({
  useAiVaultSearch: search,
  aiVaultSearchNeedsLocalConsent: () => false
}))

afterEach(() => {
  cleanup()
  search.mockReset()
})

it('keeps measured evidence through pane updates while invalidating it on query or response changes', () => {
  const hit = {
    ...searchHit(),
    evidence: {
      role: 'assistant' as const,
      timestamp: null,
      snippet: 'a [[refresh]] here',
      originalExcerpt: { text: 'a refresh here' }
    }
  }
  search.mockReturnValue({ hits: [hit] })
  const initialProps: Parameters<typeof useWorktreeJumpPaletteTranscriptMatches>[0] = {
    settings: null,
    visible: true,
    query: 'refresh',
    deferredQuery: 'refresh',
    filter: EMPTY_PALETTE_FILTER,
    agentStatusByPaneKey: {
      [makePaneKey('terminal', LEAF_ID)]: makeAgentEntry('terminal', 'done', 0, {
        agentType: hit.agent,
        tabId: 'terminal',
        worktreeId: 'workspace',
        providerSession: { key: 'session_id', id: hit.sessionId }
      })
    },
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    tabsByWorktree: { workspace: [makeTerminalTab('terminal', 'workspace', 'Conversation')] },
    terminalLayoutsByTabId: {
      terminal: {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null
      }
    }
  }
  const { result, rerender } = renderHook(useWorktreeJumpPaletteTranscriptMatches, { initialProps })
  const proof = result.current.transcriptMeasurement.candidates[0]?.windows[0]
  expect(proof).toBeDefined()
  if (!proof) {
    throw new Error('Expected literal proof')
  }
  act(() => result.current.transcriptMeasurement.onFits(new Map([[0, proof]]), 'display'))
  expect(result.current.transcriptMatches[0]?.complete).toBe(true)

  act(() => result.current.transcriptMeasurement.onFits(new Map(), 'display'))
  expect(result.current.transcriptMatches[0]?.complete).toBe(false)
  act(() => result.current.transcriptMeasurement.onFits(new Map([[0, proof]]), 'display'))
  expect(result.current.transcriptMatches[0]?.complete).toBe(true)

  rerender({ ...initialProps, agentStatusByPaneKey: { ...initialProps.agentStatusByPaneKey } })
  expect(result.current.transcriptMatches[0]?.complete).toBe(true)

  search.mockReturnValue({
    hits: [{ ...hit, evidence: { ...hit.evidence, originalExcerpt: undefined } }]
  })
  rerender(initialProps)
  expect(result.current.transcriptMatches).toEqual([])

  rerender({ ...initialProps, query: 'race' })
  expect(result.current.transcriptMatches).toEqual([])
})
