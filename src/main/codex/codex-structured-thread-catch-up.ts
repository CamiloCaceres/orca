import { parseAgentJournalItemKey } from '../../shared/agent-session-journal-item-key'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../shared/agent-session-journal-types'
import { agentSessionHostStatusBody } from '../../shared/agent-session-host-status-rows'
import { readAgentJournalTurn } from '../../shared/agent-session-turn-record'
import type {
  StructuredAgentSessionEventSink,
  StructuredAgentSessionHistoryJournal
} from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import type { CodexAppServerConnection } from './codex-app-server-connection'
import type { CodexJournalTranslator } from './codex-structured-journal-contracts'
import { codexRestoreFits } from './codex-structured-journal-translation-restore'
import {
  readCodexJournalRecord,
  readCodexJournalString
} from './codex-structured-journal-translation-values'

// A chat writes its conversation only while its own app-server holds Codex's writer lock, so turns
// made anywhere else land only while the chat has no process; every process start opens here.

/** Codex clamps every turns page to this. */
const CODEX_TURNS_PAGE_LIMIT = 100
const TURN_LIFECYCLE_RECORD_PREFIX = 'turn-lifecycle:'

export type CodexJournalTurnAnchor = {
  /** Provider turn ids the journal already shows; never imported again. */
  known: ReadonlySet<string>
  /** The known turn with the newest row. */
  latest: string | null
  hasRows: boolean
  /** When the journal holds a transcript import and no turn ids: nothing started before this. */
  importedAt: number | null
}

export function readCodexJournalTurnAnchor(
  journal: StructuredAgentSessionHistoryJournal
): CodexJournalTurnAnchor {
  const known = new Set<string>()
  const newest: { turnId: string | null; sequence: number } = { turnId: null, sequence: -1 }
  let hasRows = false
  const note = (turnId: string, sequence: number): void => {
    known.add(turnId)
    if (sequence > newest.sequence) {
      newest.turnId = turnId
      newest.sequence = sequence
    }
  }
  journal.visitItems((itemId, sequence, body) => {
    hasRows = true
    const turnId = codexTurnIdOfRow(itemId, body)
    if (turnId) {
      note(turnId, sequence)
    }
  })
  // A send accepted before its turn row landed still names its turn through its provider item.
  for (const submission of journal.submissions()) {
    const identity = submission.providerItemId
      ? parseAgentJournalItemKey(submission.providerItemId)
      : null
    if (identity?.provider === 'codex') {
      known.add(identity.turnId)
    }
  }
  const opening = journal.epochOpening()
  return {
    known,
    latest: newest.turnId,
    hasRows,
    importedAt: known.size === 0 && opening?.reason === 'legacy_import' ? opening.openedAt : null
  }
}

function codexTurnIdOfRow(
  itemId: string,
  body: Parameters<typeof readAgentJournalTurn>[0]
): string | null {
  const identity = parseAgentJournalItemKey(itemId)
  if (identity?.provider === 'codex') {
    return identity.turnId
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

export type CodexMissingTurns =
  | { ok: true; turns: unknown[]; anchorIsLatest: boolean }
  | { ok: false; reason: string }

/** Codex's turns the journal doesn't show, oldest first, read whole before any is published: a
 *  partial import would become the anchor that hides the older turns it left out. */
export async function collectMissingCodexTurns(
  connection: Pick<CodexAppServerConnection, 'request'>,
  input: { threadId: string; anchor: CodexJournalTurnAnchor; timeoutMs?: number }
): Promise<CodexMissingTurns> {
  const { anchor } = input
  if (anchor.known.size === 0 && anchor.hasRows && anchor.importedAt === null) {
    return { ok: false, reason: 'no-anchor' }
  }
  const missing: unknown[] = []
  const seenCursors = new Set<string>()
  let cursor: string | null = null
  do {
    const page = readCodexJournalRecord(
      await connection.request(
        'thread/turns/list',
        {
          threadId: input.threadId,
          cursor,
          sortDirection: 'desc',
          limit: CODEX_TURNS_PAGE_LIMIT,
          itemsView: 'full'
        },
        { timeoutMs: input.timeoutMs }
      )
    )
    if (!Array.isArray(page.data)) {
      return { ok: false, reason: 'invalid-page' }
    }
    for (const rawTurn of page.data) {
      const turn = readCodexJournalRecord(rawTurn)
      const turnId = readCodexJournalString(turn, 'id')
      if (!turnId) {
        return { ok: false, reason: 'invalid-turn' }
      }
      if (anchor.known.has(turnId)) {
        return found(missing, turnId === anchor.latest)
      }
      if (anchor.importedAt !== null) {
        if (typeof turn.startedAt !== 'number') {
          return { ok: false, reason: 'undated-turn' }
        }
        // Unix seconds: a turn in the import's own second is kept, never lost.
        if ((turn.startedAt + 1) * 1000 <= anchor.importedAt) {
          return found(missing, true)
        }
      }
      // An older Codex ignores `itemsView` and answers with two items per turn.
      if (turn.itemsView !== 'full') {
        return { ok: false, reason: 'summary-turn' }
      }
      missing.push(rawTurn)
      if (!codexRestoreFits(missing, 1)) {
        return { ok: false, reason: 'too-large' }
      }
    }
    cursor = typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : null
    if (cursor !== null) {
      if (seenCursors.has(cursor)) {
        return { ok: false, reason: 'invalid-cursor' }
      }
      seenCursors.add(cursor)
    }
  } while (cursor !== null)
  // History ended without meeting a known turn: every turn the chat shows is gone from Codex.
  return found(missing, anchor.known.size === 0)
}

function found(missing: unknown[], anchorIsLatest: boolean): CodexMissingTurns {
  return { ok: true, turns: missing.toReversed(), anchorIsLatest }
}

/** Adds the turns Codex saved outside this chat, after the chat's own rows. Never throws: a
 *  failed read leaves the chat as it was, and the next open tries again. */
export async function catchUpCodexThread(input: {
  connection: Pick<CodexAppServerConnection, 'request'>
  threadId: string
  sessionId: string
  sink: StructuredAgentSessionEventSink
  translator: Pick<CodexJournalTranslator, 'restoreThread'>
  timeoutMs?: number
  logger?: StructuredAgentSessionLogger
}): Promise<void> {
  const warn = (reason: string, error?: unknown): void =>
    input.logger?.warn('Codex chat did not catch up on turns made outside it', {
      scope: 'codex-thread-catch-up',
      sessionId: input.sessionId,
      reason,
      ...(error !== undefined ? { error } : {})
    })
  try {
    const written = await input.sink.written?.()
    const journal = input.sink.journalHistory?.()
    if (!journal || written?.ok === false) {
      return
    }
    const anchor = readCodexJournalTurnAnchor(journal)
    const missing = await collectMissingCodexTurns(input.connection, {
      threadId: input.threadId,
      anchor,
      timeoutMs: input.timeoutMs
    })
    if (!missing.ok) {
      warn(missing.reason)
      return
    }
    const [oldest] = missing.turns
    if (oldest === undefined) {
      return
    }
    if (anchor.hasRows) {
      const divider = input.sink.tryAppendItem?.(
        {
          provider: 'legacy',
          agent: 'codex',
          sessionId: input.sessionId,
          recordId: `continued-outside:${readCodexJournalString(readCodexJournalRecord(oldest), 'id')}`
        },
        agentSessionHostStatusBody(
          missing.anchorIsLatest ? 'continued-outside' : 'continued-outside-rewound'
        ),
        { turnScope: AGENT_JOURNAL_THREAD_SCOPE }
      )
      if (divider && !divider.accepted) {
        warn('divider-refused')
        return
      }
    }
    const restored = input.translator.restoreThread(input.threadId, { turns: missing.turns })
    if (!restored.accepted) {
      warn(restored.reason)
    }
  } catch (error) {
    warn('read-failed', error)
  }
}
