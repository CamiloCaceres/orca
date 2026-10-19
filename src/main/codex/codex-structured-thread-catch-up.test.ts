// Turns made outside a Codex chat, through the real path they take:
// Codex turns pages → translator → deferred sink → on-disk journal.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codexProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import { createTrackedJournalOpener } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import { createDeferredStructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { testEventSinkLogging } from '../native-chat/agent-session-wire/structured-agent-session-logger-test-support'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import { catchUpCodexThread } from './codex-structured-thread-catch-up'

const SESSION = 'session-codex-catch-up'
const THREAD = 'thread-abc'
const STARTED_AT = 1_700_000_000

function turn(index: number, view: 'full' | 'summary' = 'full'): Record<string, unknown> {
  return {
    id: `turn-${index}`,
    status: 'completed',
    itemsView: view,
    startedAt: STARTED_AT + index * 100,
    completedAt: STARTED_AT + index * 100 + 50,
    items: [
      { type: 'userMessage', id: `u-${index}`, content: [{ type: 'text', text: `ask ${index}` }] },
      { type: 'agentMessage', id: `a-${index}`, text: `answer ${index}` }
    ]
  }
}

/** Serves Codex's saved turns newest first, two to a page. */
function codexWith(turns: Record<string, unknown>[]) {
  return {
    request: async (method: string, params?: Record<string, unknown>) => {
      expect(method).toBe('thread/turns/list')
      expect(params).toMatchObject({ sortDirection: 'desc', itemsView: 'full' })
      const newestFirst = turns.toReversed()
      const start = typeof params?.cursor === 'string' ? Number(params.cursor) : 0
      const data = newestFirst.slice(start, start + 2)
      return {
        data,
        nextCursor: start + 2 < newestFirst.length ? String(start + 2) : null
      }
    }
  }
}

const journals = createTrackedJournalOpener()
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
})

async function chat(clock: { now: number }) {
  const root = await mkdtemp(join(tmpdir(), 'orca-codex-catch-up-'))
  const journal = await journals.open({
    identity: {
      sessionId: SESSION,
      workspaceId: 'workspace-1',
      hostId: 'local',
      agent: 'codex',
      providerHandle: codexProviderHandle(THREAD)
    },
    stateDirectory: root,
    now: () => clock.now
  })
  const deferred = createDeferredStructuredAgentSessionEventSink(testEventSinkLogging())
  deferred.bind({ journal, fence: 1, publish: () => {} })
  cleanups.push(async () => {
    deferred.close()
    await journals.closeAll()
    await rm(root, { recursive: true, force: true })
  })
  return {
    journal,
    /** One agent open: a fresh translator, as each new app-server gets. */
    open: async (turns: Record<string, unknown>[]) => {
      const translator = createCodexJournalTranslator({
        sink: deferred.sink,
        sessionId: SESSION,
        primaryThreadId: () => THREAD,
        schedule: (run) => {
          run()
          return () => {}
        }
      })
      await catchUpCodexThread({
        connection: codexWith(turns),
        threadId: THREAD,
        sessionId: SESSION,
        sink: deferred.sink,
        translator
      })
      await deferred.drained()
    },
    texts: () =>
      journal.snapshot().items.flatMap((item) => {
        if (item.body.kind === 'message') {
          const text = item.body.blocks.map((block) => (block.type === 'text' ? block.text : ''))
          return [`${item.body.role}:${text.join('')}`]
        }
        return item.body.kind === 'status' && item.body.presentation
          ? [`(${item.body.presentation})`]
          : []
      })
  }
}

describe('Codex chat catch-up', () => {
  it('adds the turns made outside the chat once, in order, after the chat rows', async () => {
    const c = await chat({ now: 1_000 })

    await c.open([turn(1)])
    expect(c.texts()).toEqual(['user:ask 1', 'assistant:answer 1'])

    await c.open([turn(1), turn(2), turn(3)])
    const caughtUp = [
      'user:ask 1',
      'assistant:answer 1',
      '(continued-outside)',
      'user:ask 2',
      'assistant:answer 2',
      'user:ask 3',
      'assistant:answer 3'
    ]
    expect(c.texts()).toEqual(caughtUp)

    await c.open([turn(1), turn(2), turn(3)])
    expect(c.texts()).toEqual(caughtUp)

    // Rewound elsewhere: the chat keeps what it showed and says the agent no longer has it.
    await c.open([turn(1), turn(2), turn(4)])
    expect(c.texts().slice(caughtUp.length)).toEqual([
      '(continued-outside-rewound)',
      'user:ask 4',
      'assistant:answer 4'
    ])

    // An older Codex answers with summary turns: nothing is guessed from them.
    await c.open([turn(1), turn(2), turn(4), turn(5, 'summary')])
    expect(c.texts().slice(caughtUp.length + 3)).toEqual([])
  })

  it('keeps a transcript-imported chat whole and adds only turns started after the import', async () => {
    const importedAt = { now: (STARTED_AT + 250) * 1000 }
    const imported = async () => {
      const c = await chat(importedAt)
      await c.journal.replaceEpochItems('legacy_import', 1, [
        {
          identity: { provider: 'legacy', agent: 'codex', sessionId: SESSION, recordId: 'r1' },
          body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'imported ask' }] },
          ownerFence: 1
        }
      ])
      return c
    }

    const c = await imported()
    await c.open([turn(1), turn(2), turn(3)])
    expect(c.texts()).toEqual([
      'user:imported ask',
      '(continued-outside)',
      'user:ask 3',
      'assistant:answer 3'
    ])

    // A turn with no start time can't be placed against the import: nothing is added.
    const undated = await imported()
    await undated.open([turn(1), { ...turn(4), startedAt: undefined }])
    expect(undated.texts()).toEqual(['user:imported ask'])
  })
})
