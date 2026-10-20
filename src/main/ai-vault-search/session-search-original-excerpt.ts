import type SyncDatabase from '../sqlite/sync-database'
import { normalizePaletteText, mapNormalizedRange } from '../../shared/palette-normalized-text'
import { ownRetainedString } from '../../shared/own-retained-string'
import { splitAiVaultSearchQuery } from '../../shared/ai-vault-search-query-operators'
import type { SessionSearchScope } from './session-search-engine-types'

export const ORIGINAL_EXCERPT_POINTS = 512
// Indexed conversation chunks are at most 8,000 code units; tool rows are smaller.
const INDEXED_COLUMN_POINTS = 8000

type Context = { text: string; anchors: number; span: number; start: number }

/** Context selection only: literal completeness and boundaries belong to the renderer. */
export function selectOriginalExcerpt(text: string, query: string): Context {
  const points = Array.from(text)
  const anchors = [
    ...new Set(
      splitAiVaultSearchQuery(query).terms.flatMap(
        (term) =>
          term
            .normalize('NFC')
            .toLowerCase()
            .match(/[\p{L}\p{N}\p{M}]+/gu) ?? []
      )
    )
  ]
  const occurrences: { start: number; end: number; anchor: number }[] = []
  const normalized = normalizePaletteText(text)
  const folded = normalized.normalized
  for (const [anchor, term] of anchors.entries()) {
    let at = 0
    while (at < folded.length) {
      const start = folded.indexOf(term, at)
      if (start === -1) {
        break
      }
      const range = mapNormalizedRange(normalized, start, start + term.length)
      occurrences.push({ ...range, anchor })
      at = start + Math.max(1, term.length)
    }
  }
  occurrences.sort((a, b) => a.start - b.start || a.end - b.end)
  let best = { anchors: 0, span: Infinity, start: 0, end: 0 }
  const counts = new Map<number, number>()
  let left = 0
  for (let right = 0; right < occurrences.length; right++) {
    const last = occurrences[right]
    counts.set(last.anchor, (counts.get(last.anchor) ?? 0) + 1)
    while (left < right && last.end - occurrences[left].start > ORIGINAL_EXCERPT_POINTS - 16) {
      const first = occurrences[left++]
      const count = (counts.get(first.anchor) ?? 1) - 1
      if (count) {
        counts.set(first.anchor, count)
      } else {
        counts.delete(first.anchor)
      }
    }
    while (left < right && (counts.get(occurrences[left].anchor) ?? 0) > 1) {
      const first = occurrences[left++]
      counts.set(first.anchor, (counts.get(first.anchor) ?? 1) - 1)
    }
    const start = occurrences[left].start
    const span = last.end - start
    if (counts.size > best.anchors || (counts.size === best.anchors && span < best.span)) {
      best = { anchors: counts.size, span, start, end: last.end }
    }
  }
  const sourceStart = Array.from(text.slice(0, best.start)).length
  const start = Math.max(0, Math.min(sourceStart - 16, points.length - ORIGINAL_EXCERPT_POINTS))
  return {
    text: ownRetainedString(points.slice(start, start + ORIGINAL_EXCERPT_POINTS).join('')),
    anchors: best.anchors,
    span: best.span,
    start
  }
}

/** Reads only the selected indexed row, with the same live-session fence as snippets. */
export function sessionSearchOriginalExcerpt(
  db: SyncDatabase,
  scope: SessionSearchScope,
  rowid: number,
  query: string,
  retentionCutoffMs: number | null
): { text: string } | undefined {
  const columns =
    scope === 'conversation'
      ? ['user_text', 'assistant_text']
      : ['user_text', 'assistant_text', 'tool_text']
  const row = db
    .prepare(
      `SELECT ${columns.map((column) => `substr(f.${column}, 1, ${INDEXED_COLUMN_POINTS}) AS ${column}`).join(', ')}
     FROM messages_fts f
     JOIN messages m ON m.id = f.rowid
     JOIN sessions s ON s.id = m.session_row_id
     WHERE f.rowid = ? AND (? IS NULL OR EXISTS
       (SELECT 1 FROM files WHERE session_row_id = s.id AND mtime_ms >= ?))`
    )
    .get(rowid, retentionCutoffMs, retentionCutoffMs)
  if (typeof row !== 'object' || row === null) {
    return undefined
  }
  let best: Context | undefined
  for (const value of Object.values(row)) {
    if (typeof value !== 'string' || !value) {
      continue
    }
    const context = selectOriginalExcerpt(value, query)
    if (
      !best ||
      context.anchors > best.anchors ||
      (context.anchors === best.anchors && context.span < best.span)
    ) {
      best = context
    }
  }
  return best?.text ? { text: best.text } : undefined
}
