import { usableJournalHistoryOrigin } from '../native-chat/agent-session-journal/journal-history-origin'
import { parseAgentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../shared/agent-session-journal-types'
import { agentSessionHostStatusBody } from '../../shared/agent-session-host-status-rows'
import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import type {
  StructuredAgentSessionEventSink,
  StructuredAgentSessionHistoryJournal
} from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import {
  DEFAULT_CODEX_REQUEST_TIMEOUT_MS,
  type CodexAppServerConnection
} from './codex-app-server-connection'
import { setImmediate } from 'node:timers/promises'
import { waitForPromiseWithSignal } from '../../shared/abort-signal-reason'
import { isRootAgentJournalItem } from '../../shared/agent-session-journal-producer'
import { createCodexHistoryImportPlan } from './codex-history-import-plan'
import { discoverCodexHistory, loadCodexHistory } from './codex-structured-thread-history-pages'
import { readCodexJournalString } from './codex-structured-journal-translation-values'

// A chat writes its conversation only while its own app-server holds Codex's writer lock, so turns
// made anywhere else land only while the chat has no process; every process start opens here.

const TURN_LIFECYCLE_RECORD_PREFIX = 'turn-lifecycle:'

export type CodexJournalTurnAnchor = {
  /** Provider turn ids the journal already shows; never imported again. */
  known: ReadonlySet<string>
  /** The known turn with the newest row. */
  latest: string | null
  hasRows: boolean
  /** Proven transcript origin, independent of subsequently imported provider identities. */
  importedAt: number | null
  unresolvedOrigin: boolean
}

export function readCodexJournalTurnAnchor(
  journal: StructuredAgentSessionHistoryJournal,
  threadId: string
): CodexJournalTurnAnchor {
  const known = new Set<string>()
  const newest: { turnId: string | null; sequence: number } = { turnId: null, sequence: -1 }
  let hasRows = false
  let hasLegacy = false
  const note = (turnId: string, sequence: number): void => {
    known.add(turnId)
    if (sequence >= newest.sequence) {
      newest.turnId = turnId
      newest.sequence = sequence
    }
  }
  journal.visitItemsWithLinkage((itemId, sequence, body, attribution) => {
    hasRows = true
    if (!isRootAgentJournalItem(attribution)) {
      return
    }
    const identity = parseAgentJournalItemKey(itemId)
    if (
      identity?.provider === 'legacy' &&
      identity.agent === 'codex' &&
      identity.sessionId === threadId &&
      (body.kind === 'message' || body.kind === 'tool-call')
    ) {
      hasLegacy = true
    }
    const turnId = codexTurnIdOfRow(itemId, body, threadId)
    if (turnId) {
      note(turnId, sequence)
    }
  })
  // A send accepted before its turn row landed still names its turn through its provider item.
  for (const submission of journal.submissions()) {
    const identity = submission.providerItemId
      ? parseAgentJournalItemKey(submission.providerItemId)
      : null
    if (identity?.provider === 'codex' && identity.threadId === threadId) {
      known.add(identity.turnId)
    }
  }
  const rawOrigin = journal.historyOrigin()
  const origin = usableJournalHistoryOrigin(rawOrigin)
  const importedAt =
    origin?.providerHandle.kind === 'codex' && origin.providerHandle.threadId === threadId
      ? origin.importedAt
      : null
  return {
    known,
    latest: newest.turnId,
    hasRows,
    importedAt,
    unresolvedOrigin: (hasLegacy || rawOrigin !== null) && importedAt === null
  }
}

function codexTurnIdOfRow(
  itemId: string,
  body: Parameters<typeof readAgentJournalTurn>[0],
  threadId: string
): string | null {
  const identity = parseAgentJournalItemKey(itemId)
  if (identity?.provider === 'codex') {
    return identity.threadId === threadId ? identity.turnId : null
  }
  const turn = readAgentJournalTurn(body)
  if (!turn) {
    return null
  }
  // A command's turn row carries Orca's own turn id; the provider turn rides beside it.
  if (body?.kind === 'turn' && body.providerTurnId) {
    return body.providerTurnId
  }
  return identity?.provider === 'legacy' &&
    identity.agent === 'codex' &&
    identity.recordId.startsWith(TURN_LIFECYCLE_RECORD_PREFIX)
    ? turn.turnId
    : null
}

/** Optional reconciliation never gates provider open; an abandoned invocation cannot later write. */
export async function catchUpCodexThread(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  threadId: string
  sessionId: string
  sink: StructuredAgentSessionEventSink
  signal?: AbortSignal
  assertCurrent?: () => void
  timeoutMs?: number
  logger?: StructuredAgentSessionLogger
}): Promise<void> {
  const controller = new AbortController()
  const abort = () => controller.abort(input.signal?.reason)
  input.signal?.addEventListener('abort', abort, { once: true })
  if (input.signal?.aborted) {
    abort()
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_CODEX_REQUEST_TIMEOUT_MS
  const deadline = Date.now() + timeoutMs
  const timer = setTimeout(() => controller.abort(new Error('catch-up-deadline')), timeoutMs)
  const check = () => {
    if (controller.signal.aborted || Date.now() >= deadline) {
      throw new Error('catch-up-cancelled')
    }
    input.assertCurrent?.()
  }
  const warn = (reason: string, error?: unknown) =>
    input.logger?.warn('Codex chat did not catch up on turns made outside it', {
      scope: 'codex-thread-catch-up',
      sessionId: input.sessionId,
      reason,
      ...(error === undefined ? {} : { error })
    })
  let staging: ReturnType<typeof createCodexHistoryImportPlan> | undefined
  try {
    check()
    const written = await waitForPromiseWithSignal(
      input.sink.written?.() ?? Promise.resolve({ ok: true }),
      controller.signal
    )
    check()
    const history = input.sink.journalHistory?.()
    const journal = input.sink.journalItems?.()
    if (!history || !journal || !written.ok || !input.sink.tryAppendTransition) {
      return
    }
    const epoch = journal.epoch
    const anchor = readCodexJournalTurnAnchor(history, input.threadId)
    const read = {
      connection: input.connection,
      threadId: input.threadId,
      signal: controller.signal,
      deadline,
      check
    }
    const missing = await discoverCodexHistory(read, anchor)
    if (missing.pages.length === 0) {
      return
    }
    staging = createCodexHistoryImportPlan({
      sessionId: input.sessionId,
      threadId: input.threadId,
      journal,
      check
    })
    let first = true
    for await (const turn of loadCodexHistory(read, missing.pages)) {
      check()
      if (first && anchor.hasRows) {
        staging.append(
          {
            provider: 'legacy',
            agent: 'codex',
            sessionId: input.sessionId,
            recordId: `continued-outside:${readCodexJournalString(turn, 'id')}`
          },
          agentSessionHostStatusBody(
            missing.anchorIsLatest ? 'continued-outside' : 'continued-outside-rewound'
          ),
          { turnScope: AGENT_JOURNAL_THREAD_SCOPE }
        )
      }
      first = false
      staging.restore(turn)
      await setImmediate()
    }
    const plan = staging.finish()
    let resolved = false
    const admission = input.sink.tryAppendTransition({
      lifecycle: true,
      publish: true,
      steps: [
        {
          kind: 'settlement',
          settlementId: plan.settlementId,
          reservedBytes: plan.reservedBytes,
          resolve: (current) => {
            try {
              check()
            } catch {
              return []
            }
            if (current.epoch !== epoch || input.sink.journalHistory?.() !== history) {
              return []
            }
            const now = readCodexJournalTurnAnchor(history, input.threadId)
            if (
              now.unresolvedOrigin !== anchor.unresolvedOrigin ||
              now.importedAt !== anchor.importedAt ||
              now.latest !== anchor.latest ||
              now.hasRows !== anchor.hasRows ||
              now.known.size !== anchor.known.size ||
              [...now.known].some((id) => !anchor.known.has(id))
            ) {
              return []
            }
            if (plan.keys.some((key) => current.item(current.canonicalItemId(key)) !== null)) {
              return []
            }
            // Canonical keys can also collide with one another through an existing submission alias.
            if (
              new Set(plan.keys.map((key) => current.canonicalItemId(key))).size !==
              plan.keys.length
            ) {
              return []
            }
            resolved = true
            return plan.mutations
          }
        }
      ]
    })
    if (!admission.accepted) {
      warn(admission.reason)
      return
    }
    const committed = await input.sink.written?.()
    if (committed?.ok === false) {
      warn('write-failed', committed.error)
    } else if (!resolved) {
      warn('stale-history')
    }
  } catch (error) {
    warn('import-skipped', error)
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', abort)
    staging?.dispose()
  }
}
