import { createHash } from 'node:crypto'
import { agentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import {
  journalLifecycleItemMutation,
  type JournalLifecycleMutationInput
} from '../native-chat/agent-session-journal/journal-row-builders'
import type {
  StructuredAgentSessionEventSink,
  StructuredAgentSessionItemAppendOptions
} from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import type { StructuredAgentSessionTransitionJournal } from '../native-chat/agent-session-wire/structured-agent-session-transition'
import { createCodexJournalTranslator } from './codex-structured-journal-translation'
import {
  CODEX_RESTORE_MAX_BYTES,
  CODEX_RESTORE_MAX_OPERATIONS
} from './codex-structured-journal-translation-restore'

/** Invocation-local shared translation: nothing reaches the live sink until this plan is whole. */
export function createCodexHistoryImportPlan(input: {
  sessionId: string
  threadId: string
  journal: StructuredAgentSessionTransitionJournal
  check: () => void
}) {
  const mutations: JournalLifecycleMutationInput[] = []
  const encoded = new Map<string, string>()
  const turnIds: string[] = []
  let bytes = 0
  const append = (
    identity: AgentJournalItemIdentity,
    body: AgentJournalItemBody,
    options: StructuredAgentSessionItemAppendOptions
  ) => {
    input.check()
    const mutation = journalLifecycleItemMutation(options, identity, body)
    const key = agentJournalItemKey(identity)
    const serialized = JSON.stringify(mutation)
    const previous = encoded.get(key)
    if (previous !== undefined) {
      if (previous !== serialized) {
        throw new Error('conflicting-history-identity')
      }
      return { accepted: true } as const
    }
    bytes += Buffer.byteLength(serialized, 'utf8') + 1
    if (mutations.length >= CODEX_RESTORE_MAX_OPERATIONS || bytes > CODEX_RESTORE_MAX_BYTES) {
      throw new Error('too-large')
    }
    mutations.push(mutation)
    encoded.set(key, serialized)
    return { accepted: true } as const
  }
  const sink: StructuredAgentSessionEventSink = {
    appendItem: append,
    tryAppendItem: append,
    appendTombstone: () => {
      throw new Error('unexpected-history-tombstone')
    },
    publish: () => {},
    tryPublish: () => ({ accepted: true }),
    tryReviseResolvedItem: (_reserved, resolve, options) => {
      const item = resolve(input.journal)
      return item ? append(item.identity, item.body, options) : { accepted: true }
    }
  }
  const translator = createCodexJournalTranslator({
    sink,
    sessionId: input.sessionId,
    primaryThreadId: () => input.threadId,
    historyImport: true
  })
  return {
    append,
    restore: (turn: Record<string, unknown>) => {
      input.check()
      const restored = translator.restoreThread(input.threadId, { turns: [turn] })
      if (!restored.accepted) {
        throw new Error(restored.reason)
      }
      if (typeof turn.id !== 'string') {
        throw new Error('invalid-turn')
      }
      turnIds.push(turn.id)
    },
    finish: () => {
      input.check()
      const keys = [...encoded.keys()]
      const digest = createHash('sha256')
        .update(JSON.stringify([input.journal.epoch, input.threadId, turnIds, keys]))
        .digest('hex')
      const settlementId = `codex-history-import:${digest}`
      // Match the existing batch envelope charge, plus the transition's one publication byte.
      const reservedBytes =
        Buffer.byteLength(JSON.stringify({ settlementId, mutations }), 'utf8') + 512
      if (reservedBytes + 1 > CODEX_RESTORE_MAX_BYTES) {
        throw new Error('too-large')
      }
      return { settlementId, mutations, keys, turnIds, reservedBytes }
    },
    dispose: () => translator.dispose()
  }
}
