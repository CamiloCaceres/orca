import { readCodexHistoryJournalView } from './codex-history-journal-view'
import { projectStructuredItemsToNativeChat } from '../../shared/structured-agent-session-projection'
import { registerCodexCatchUpEchoTests } from './codex-structured-thread-catch-up-echo.spec'
// Turns made outside a Codex chat, through the real path they take:
// Codex turns pages → translator → deferred sink → on-disk journal.

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  agentJournalItemKey,
  parseAgentJournalItemKey
} from '../../shared/agent-session-journal-item-key'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { codexProviderHandle } from '../../shared/agent-session-provider-handle-encoding'
import {
  closeTestJournalHostDatabase,
  createTrackedJournalOpener,
  openTestJournalHostDatabase
} from '../native-chat/agent-session-journal/journal-host-database-test-support'
import { createDeferredStructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { testEventSinkLogging } from '../native-chat/agent-session-wire/structured-agent-session-logger-test-support'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import { importLegacyTranscriptIntoJournal } from '../native-chat/agent-session-journal/journal-legacy-import'
import { openTestAgentSessionRecordStore } from '../runtime/agent-session-record-store-test-harness'
import { recoverStructuredRewind } from '../native-chat/agent-session-wire/structured-rewind-recovery'
import { usableJournalHistoryOrigin } from '../native-chat/agent-session-journal/journal-history-origin'
import { catchUpCodexThread } from './codex-structured-thread-catch-up'

const SESSION = 'session-codex-catch-up'
const THREAD = 'thread-abc'
const STARTED_AT = 1_700_000_000

export function turn(index: number, view: 'full' | 'summary' = 'full'): Record<string, unknown> {
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
      expect(params).toMatchObject({ sortDirection: 'desc', limit: 100 })
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

export async function chat(clock: { now: number }) {
  const root = await mkdtemp(join(tmpdir(), 'orca-codex-catch-up-'))
  const journalOptions = {
    identity: {
      sessionId: SESSION,
      workspaceId: 'workspace-1',
      hostId: 'local',
      agent: 'codex',
      providerHandle: codexProviderHandle(THREAD)
    } satisfies AgentSessionJournalIdentity,
    stateDirectory: root,
    now: () => clock.now
  }
  let journal = await journals.open(journalOptions)
  let deferred = createDeferredStructuredAgentSessionEventSink(testEventSinkLogging())
  const publications: number[] = []
  const bind = () =>
    deferred.bind({
      journal,
      fence: 1,
      publish: () => {
        publications.push(journal.snapshot().items.length)
      }
    })
  bind()
  cleanups.push(async () => {
    deferred.close()
    await journals.closeAll()
    await rm(root, { recursive: true, force: true })
  })
  return {
    get journal() {
      return journal
    },
    get deferred() {
      return deferred
    },
    root,
    get db() {
      return openTestJournalHostDatabase(root).db
    },
    publications,
    reopen: async () => {
      deferred.close()
      await journal.close()
      closeTestJournalHostDatabase(root)
      journal = await journals.open(journalOptions)
      deferred = createDeferredStructuredAgentSessionEventSink(testEventSinkLogging())
      bind()
    },
    /** One agent open: a fresh translator, as each new app-server gets. */
    open: async (
      turns: Record<string, unknown>[],
      options: Partial<Parameters<typeof catchUpCodexThread>[0]> = {}
    ) => {
      await catchUpCodexThread({
        connection: codexWith(turns),
        threadId: THREAD,
        sessionId: SESSION,
        sink: deferred.sink,
        ...options
      })
      return deferred.drained()
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
  registerCodexCatchUpEchoTests({ chat, turn, sessionId: SESSION, threadId: THREAD })

  it('retains the complete outside answer tail through catch-up, disk reopen and display', async () => {
    const c = await chat({ now: 1_000 })
    await c.open([turn(1)])
    const answer = `${'outside answer paragraph\n'.repeat(1_024)}END-OF-OUTSIDE-ANSWER-30883`
    const outside = { ...turn(2), items: [{ type: 'agentMessage', id: 'a-2', text: answer }] }
    await c.open([turn(1), outside])
    await c.reopen()
    const items = c.journal.snapshot().items
    const stored = items.find(
      (item) =>
        item.body.kind === 'message' &&
        item.body.role === 'assistant' &&
        item.body.blocks.some((block) => block.type === 'text' && block.text === answer)
    )
    expect(stored?.body).toEqual({
      kind: 'message',
      role: 'assistant',
      blocks: [{ type: 'text', text: answer }]
    })
    const displayed = projectStructuredItemsToNativeChat(items).flatMap((message) => message.blocks)
    expect(displayed).toContainEqual({ type: 'text', text: answer })
  })

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

    await c.open([turn(1), turn(2), turn(4), turn(5)])
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 5', 'assistant:answer 5'])

    // An older Codex answers with summary turns: nothing is guessed from them.

    await c.open([turn(1), turn(2), turn(4), turn(5), turn(6, 'summary')])
    expect(c.texts().slice(caughtUp.length + 6)).toEqual([])
  })

  it('recovers an older gap behind newer native work after a failed read and restart', async () => {
    const c = await chat({ now: 1_000 })
    await c.open([turn(1)])
    const failed = {
      request: async () => {
        throw new Error('read failed')
      }
    }
    await c.open([turn(1), turn(2)], { connection: failed })
    const native = createCodexJournalTranslator({
      sink: c.deferred.sink,
      sessionId: SESSION,
      primaryThreadId: () => THREAD
    })
    for (const [method, params] of [
      ['turn/started', { turn: { id: 'turn-3' } }],
      [
        'item/completed',
        { turnId: 'turn-3', item: { type: 'agentMessage', id: 'native', text: 'native C' } }
      ],
      ['turn/completed', { turn: { id: 'turn-3', status: 'completed' } }]
    ] as const) {
      native.handle({ type: 'notification', threadId: THREAD, method, params })
    }
    await c.deferred.drained()
    native.dispose()
    const before = c.journal.snapshot().items
    await c.reopen()
    await c.open([turn(1), turn(2), turn(3)])
    expect(c.journal.snapshot().items.slice(0, before.length)).toEqual(before)
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 2', 'assistant:answer 2'])
    await c.open([turn(1), turn(2), turn(3), turn(4)])
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 4', 'assistant:answer 4'])
    await c.open([turn(3), turn(4), turn(5)])
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 5', 'assistant:answer 5'])
    const complete = c.journal.snapshot().items
    const unchanged = codexWith([turn(3), turn(4), turn(5)])
    const reads = vi.fn(unchanged.request)
    await c.open([], { connection: { request: reads } })
    expect(reads).toHaveBeenCalledTimes(2)
    expect(reads.mock.calls.every(([, params]) => params?.itemsView === 'summary')).toBe(true)
    expect(c.journal.snapshot().items).toEqual(complete)
    await c.journal.replaceEpochItems(
      'handle_forked',
      1,
      before.map((item) => ({
        identity: parseAgentJournalItemKey(item.itemId)!,
        body: item.body,
        turnScope: item.turnScope,
        ownerFence: 1
      }))
    )
    await c.open([turn(1), turn(2)])
    expect(c.texts().slice(-2)).toEqual(['user:ask 2', 'assistant:answer 2'])
  })

  it('orders receipt-only turns by the native prompt, with current-epoch receipt fallback', async () => {
    const c = await chat({ now: 1_000 })
    const body = { kind: 'message' as const, role: 'user' as const, blocks: [] }
    await c.journal.appendSubmission({
      clientMessageId: 'receipt',
      body,
      payloadFingerprint: 'receipt',
      fence: 1
    })
    await c.journal.resolveDispatch({
      clientMessageId: 'receipt',
      state: 'accepted',
      providerIdentity: { provider: 'codex', threadId: THREAD, turnId: 'turn-1', ordinal: 0 },
      fence: 1
    })
    expect(readCodexHistoryJournalView(c.journal, THREAD).latest).toBe('turn-1')
    await c.journal.appendTombstone({ provider: 'orca', clientMessageId: 'receipt' }, { fence: 1 })
    expect(readCodexHistoryJournalView(c.journal, THREAD).latest).toBe('turn-1')
    await c.journal.appendItem(
      { provider: 'orca', clientMessageId: 'bookkeeping' },
      { kind: 'status', text: 'Saved note' },
      { fence: 1, turnScope: { kind: 'thread' } }
    )
    await c.open([turn(1), turn(2)])
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 2', 'assistant:answer 2'])
    await c.open([turn(1), turn(2), turn(3)])
    expect(c.texts().slice(-3)).toEqual(['(continued-outside)', 'user:ask 3', 'assistant:answer 3'])
  })

  it('commits a 600-message import once, rolls back a later partition failure, and recovers', async () => {
    const c = await chat({ now: 1_000 })
    await c.open([turn(1)])
    const before = c.journal.snapshot()
    const large = {
      ...turn(2),
      items: Array.from({ length: 600 }, (_, n) => ({
        type: 'agentMessage',
        id: `item-${n}`,
        text: `answer ${n}`
      }))
    }
    const seq = c.journal.cursor().sequence
    c.db.exec(
      `CREATE TRIGGER fail_later_partition BEFORE INSERT ON journal_rows WHEN NEW.seq > ${seq + 1} BEGIN SELECT RAISE(ABORT, 'injected later partition failure'); END`
    )
    expect((await c.open([turn(1), large])).ok).toBe(false)
    expect(c.deferred.state().failed).toBe(true)
    expect(c.journal.snapshot()).toEqual(before)
    c.db.exec('DROP TRIGGER fail_later_partition')
    await c.reopen()
    expect(c.journal.snapshot()).toEqual(before)
    c.publications.length = 0
    await c.open([turn(1), large])
    expect(c.texts()).toHaveLength(603)
    expect(c.publications).toEqual([before.items.length + 602])
    await c.reopen()
    await c.open([turn(1), large])
    expect(c.texts()).toHaveLength(603)
    const full = c.journal.snapshot()
    await c.open([
      turn(1),
      large,
      {
        ...large,
        id: 'too-many',
        items: Array.from({ length: 1024 }, (_, n) => ({
          type: 'agentMessage',
          id: `over-${n}`,
          text: 'x'
        }))
      }
    ])
    expect(c.journal.snapshot()).toEqual(full)
  })

  it('admits a near-16-MiB translated range whole and refuses an over-limit range', async () => {
    const c = await chat({ now: 1_000 })
    const text = 'x'.repeat(16_384)
    const large = (n: number, parts: number) => ({
      ...turn(n),
      items: [
        {
          type: 'userMessage',
          id: 'large',
          content: Array.from({ length: parts }, () => ({ type: 'text', text }))
        }
      ]
    })
    c.publications.length = 0
    await c.open([large(1, 1000)])
    const saved = c.journal.snapshot()
    const message = saved.items.find((item) => item.body.kind === 'message')?.body
    expect(message?.kind === 'message' && message.blocks.length).toBe(1000)
    expect(Buffer.byteLength(JSON.stringify(saved))).toBeGreaterThan(16_000_000)
    expect(c.publications).toEqual([2])
    await c.open([large(1, 1000), large(2, 1024)])
    expect(c.journal.snapshot()).toEqual(saved)
  })

  it('cancels between pages and at commit, and rejects changed full-page identities without a prefix', async () => {
    const c = await chat({ now: 1_000 })
    await c.open([turn(1)])
    const before = c.journal.snapshot()
    const controller = new AbortController()
    const provider = codexWith([turn(1), turn(2), turn(3)])
    const request = vi.fn(async (...args: Parameters<typeof provider.request>) => {
      const result = await provider.request(...args)
      controller.abort()
      return result
    })
    await c.open([], { signal: controller.signal, connection: { request } })
    expect(request).toHaveBeenCalledTimes(1)
    expect(c.journal.snapshot()).toEqual(before)
    let current = true
    const sink = {
      ...c.deferred.sink,
      tryAppendTransition: (
        transition: Parameters<NonNullable<typeof c.deferred.sink.tryAppendTransition>>[0]
      ) => {
        current = false
        return (
          c.deferred.sink.tryAppendTransition?.(transition) ?? {
            accepted: false,
            reason: 'closed' as const
          }
        )
      }
    }
    await c.open([turn(1), turn(2)], {
      sink,
      assertCurrent: () => {
        if (!current) {
          throw new Error('stale')
        }
      }
    })
    expect(c.journal.snapshot()).toEqual(before)
    const committed = new AbortController()
    const afterCommit = {
      ...c.deferred.sink,
      tryAppendTransition: (
        transition: Parameters<NonNullable<typeof c.deferred.sink.tryAppendTransition>>[0]
      ) => {
        const result = c.deferred.sink.tryAppendTransition?.(transition) ?? {
          accepted: false,
          reason: 'closed' as const
        }
        committed.abort()
        return result
      }
    }
    await c.open([turn(1), turn(2)], { sink: afterCommit, signal: committed.signal })
    expect(c.texts().slice(-2)).toEqual(['user:ask 2', 'assistant:answer 2'])
    const whole = c.journal.snapshot()
    const changed = codexWith([turn(1), turn(2), turn(3)])
    let fullReads = 0
    await c.open([], {
      connection: {
        request: async (method, params) => {
          const page = await changed.request(method, params)
          if (params?.itemsView === 'full') {
            fullReads += 1
            return { ...page, data: [turn(4), turn(2)] }
          }
          return page
        }
      }
    })
    expect(fullReads).toBe(1)
    expect(c.journal.snapshot()).toEqual(whole)
  })

  it('keeps rollback item identities and status rows immutable within one import', async () => {
    const c = await chat({ now: 1_000 })
    const withReasoning = (n: number) => ({
      ...turn(n),
      items: [
        { type: 'reasoning', id: 'item-2', summary: [{ text: `reason ${n}` }] },
        { type: 'agentMessage', id: 'same-message-id', text: `answer ${n}` }
      ]
    })
    await c.open([withReasoning(1)])
    const before = c.journal.snapshot().items
    await c.open([
      withReasoning(2),
      withReasoning(3),
      { id: 'failed', status: 'failed', itemsView: 'full', items: [] },
      { id: 'interrupted', status: 'interrupted', itemsView: 'full', items: [] }
    ])
    expect(c.journal.snapshot().items.slice(0, before.length)).toEqual(before)
    expect(c.texts().filter((text) => text.startsWith('assistant:'))).toEqual([
      'assistant:answer 1',
      'assistant:answer 2',
      'assistant:answer 3'
    ])
    const reasoning = c.journal
      .snapshot()
      .items.filter((item) => item.body.kind === 'message' && item.body.role === 'reasoning')
    expect(new Set(reasoning.map((item) => item.itemId)).size).toBe(3)
    expect(new Set(reasoning.map((item) => JSON.stringify(item.turnScope))).size).toBe(3)
    expect(
      c.journal
        .snapshot()
        .items.filter((item) => item.body.kind === 'turn')
        .map((item) => item.body)
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ turnId: 'failed', outcome: 'failure' }),
        expect.objectContaining({
          turnId: 'interrupted',
          state: 'interrupted',
          outcome: 'cancellation'
        })
      ])
    )
  })

  it('retains original adoption through failed replacement, acknowledged rewind and disk recovery', async () => {
    const clock = { now: 50_000 }
    const c = await chat(clock)
    let store = await openTestAgentSessionRecordStore(c.root)
    const callerKey = 'catch-up-test'
    await store.reserveOwner({
      sessionId: SESSION,
      location: {
        executionHostId: 'local',
        wslDistro: null,
        workspaceId: 'workspace-1',
        workspaceKind: 'folder'
      },
      provider: 'codex',
      accountHome: { variable: 'CODEX_HOME', path: join(c.root, 'qa-codex') },
      expectedFence: null,
      spawnToken: 'fixture-only',
      claimKeyId: 'fixture',
      handoffOperationId: null,
      probe: { outcome: 'indeterminate', reason: 'fixture' },
      operation: {
        callerKey,
        operationId: '0000000050000-00000000000000000000000000000001',
        fingerprint: 'create'
      },
      now: clock.now
    })
    await store.commitProcessIdentity({
      sessionId: SESSION,
      fence: 1,
      process: {
        hostId: 'local',
        pid: 424242,
        processStartTimeMs: clock.now,
        spawnToken: 'fixture-only'
      },
      now: clock.now
    })
    await store.proveOwner({
      sessionId: SESSION,
      fence: 1,
      link: {
        linkId: 'adopted',
        handle: codexProviderHandle(THREAD),
        origin: 'adopted',
        mintedAtFence: 1,
        observedAt: clock.now
      },
      now: clock.now
    })
    const filePath = join(c.root, 'rollout.jsonl')
    await writeFile(
      filePath,
      [
        {
          timestamp: '1970-01-01T00:01:40.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'old A ask' }
        },
        {
          timestamp: '1970-01-01T00:01:50.000Z',
          type: 'event_msg',
          payload: { type: 'agent_message', message: 'old A answer' }
        }
      ]
        .map((line) => JSON.stringify(line))
        .join('\n')
    )
    clock.now = 200_000
    expect(
      await importLegacyTranscriptIntoJournal({
        journal: c.journal,
        agent: 'codex',
        sessionId: THREAD,
        fence: 1,
        options: { filePath }
      })
    ).toMatchObject({ ok: true, imported: 2 })
    const original = c.journal.snapshot().items
    const dated = (n: number) => ({ ...turn(n), startedAt: n, completedAt: n + 10 })
    await c.open([dated(100), dated(300)])
    const old = c.journal.snapshot()
    const target = agentJournalItemKey({
      provider: 'codex',
      threadId: THREAD,
      turnId: 'turn-300',
      ordinal: 0
    })
    const operationId = '0000000500000-00000000000000000000000000000002'
    await store.admitOperation({
      callerKey,
      operationId,
      fingerprint: 'rewind',
      now: 500_000,
      sessionId: SESSION
    })
    await store.transitionHandoff(SESSION, (record) => ({
      ...record,
      rewind: {
        operationId,
        callerKey,
        itemId: target,
        expectedEpoch: c.journal.epoch,
        phase: 'provider-succeeded'
      }
    }))
    clock.now = 500_000
    const deps = () => ({ store, logger: testEventSinkLogging().logger })
    c.db.exec(
      "CREATE TRIGGER fail_replacement BEFORE INSERT ON journal_rows WHEN NEW.seq = 3 BEGIN SELECT RAISE(ABORT, 'replacement failure'); END"
    )
    await expect(recoverStructuredRewind(deps(), SESSION, c.journal, 1)).rejects.toThrow(
      'replacement failure'
    )
    expect(c.journal.snapshot()).toEqual(old)
    expect(usableJournalHistoryOrigin(c.journal.historyOrigin())?.importedAt).toBe(200_000)
    c.db.exec('DROP TRIGGER fail_replacement')
    // COMMIT succeeds, then bookkeeping fails: reopening must keep the checkpoint and finish once.
    vi.spyOn(store, 'transitionHandoff').mockRejectedValueOnce(new Error('after commit'))
    await expect(recoverStructuredRewind(deps(), SESSION, c.journal, 1)).rejects.toThrow(
      'after commit'
    )
    expect(c.journal.snapshot().items.slice(0, original.length)).toEqual(original)
    await c.reopen()
    store = await openTestAgentSessionRecordStore(c.root)
    await recoverStructuredRewind(deps(), SESSION, c.journal, 1)
    expect(store.getRecord(SESSION)?.rewind?.phase).toBe('completed')
    expect(usableJournalHistoryOrigin(c.journal.historyOrigin())?.importedAt).toBe(200_000)
    await c.open([dated(100), dated(150), dated(250), dated(600)])
    expect(c.texts().filter((text) => text.startsWith('assistant:'))).toEqual([
      'assistant:old A answer',
      'assistant:answer 250',
      'assistant:answer 600'
    ])
    expect(c.journal.snapshot().items.slice(0, original.length)).toEqual(original)
    const complete = c.journal.snapshot()
    await c.reopen()
    await c.open([dated(100), dated(150), dated(250), dated(600)])
    expect(c.journal.snapshot()).toEqual(complete)
  })

  it('keeps unknown provenance readable and preserved, refusing ambiguous legacy despite native IDs', async () => {
    const c = await chat({ now: 200_000 })
    const kept = {
      identity: { provider: 'legacy', agent: 'codex', sessionId: THREAD, recordId: '#0' } as const,
      ownerFence: 1,
      body: {
        kind: 'message' as const,
        role: 'user',
        blocks: [{ type: 'text' as const, text: 'legacy' }]
      }
    }
    for (const raw of [
      undefined,
      { version: 2, kind: 'legacy_import', future: 'opaque' },
      { version: 1, kind: 'legacy_import', importedAt: 'bad' },
      {
        version: 1,
        kind: 'legacy_import',
        importedAt: 200_000,
        providerHandle: { kind: 'codex', threadId: 'another-thread' }
      }
    ]) {
      await c.journal.replaceEpochItems('session_created', 1, [kept])
      if (raw !== undefined) {
        c.db
          .prepare(
            "UPDATE journal_rows SET row_json = json_set(row_json, '$.historyOrigin', json(?)) WHERE session_id = ? AND seq = 1"
          )
          .run(JSON.stringify(raw), SESSION)
      }
      await c.reopen()
      await c.open([turn(3)])
      expect(c.texts()).toEqual(['user:legacy'])
      await c.journal.appendItem(
        { provider: 'codex', threadId: THREAD, turnId: 'native', ordinal: 0 },
        { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: 'ordinary reply' }] },
        { fence: 1 }
      )
      await c.open([turn(3)])
      expect(c.texts()).toEqual(['user:legacy', 'assistant:ordinary reply'])
      await c.journal.replaceEpochItems('handle_forked', 1, [kept])
      await c.reopen()
      expect(c.journal.historyOrigin()?.raw).toEqual(raw)
      await c.journal.replaceEpochItems('legacy_import', 1, [kept])
      expect(usableJournalHistoryOrigin(c.journal.historyOrigin())?.importedAt).toBe(200_000)
    }
  })

  it('keeps a transcript-imported chat whole and adds only turns started after the import', async () => {
    const importedAt = { now: (STARTED_AT + 200) * 1000 + 500 }
    const imported = async () => {
      const c = await chat(importedAt)
      await c.journal.replaceEpochItems('legacy_import', 1, [
        {
          identity: { provider: 'legacy', agent: 'codex', sessionId: THREAD, recordId: 'r1' },
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
