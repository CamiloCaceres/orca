import { splitAiVaultSearchQuery } from '../../../../shared/ai-vault-search-query-operators'
import {
  mapNormalizedRange,
  mergeMatchRanges,
  normalizePaletteText,
  type MatchRange
} from '@/lib/palette-match/normalized-text'
import type { PaletteTranscriptSnippet } from '../worktree-jump-palette-model'

export const TRANSCRIPT_PROOF_WINDOW_LIMIT = 8
type Occurrence = MatchRange & { group: number }
export type PaletteTranscriptWindow = PaletteTranscriptSnippet & {
  sourceStart: number
  sourceRanges: readonly MatchRange[]
}

function sourceSupportedBoundary(text: string, offset: number, edge: 'start' | 'end'): boolean {
  if (offset <= 0 || offset >= text.length || /[\uDC00-\uDFFF]/u.test(text[offset])) {
    return false
  }
  const here = String.fromCodePoint(text.codePointAt(offset) ?? 0)
  if (/\p{M}/u.test(here)) {
    return false
  }
  let end = offset
  let before = ''
  while (end > 0) {
    let start = end - 1
    if (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start])) {
      start--
    }
    before = text.slice(start, end)
    end = start
    if (!/\p{M}/u.test(before)) {
      break
    }
    if (end === 0) {
      return false
    }
  }
  if (/[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(here)) {
    return (
      /\p{N}/u.test(before) !== /\p{N}/u.test(here) ||
      (/\p{Lu}/u.test(here) && !/\p{Lu}/u.test(before))
    )
  }
  return edge === 'start'
    ? /[\p{L}\p{N}]/u.test(here) || /\s/u.test(before)
    : /[\p{L}\p{N}]/u.test(before) || /\s/u.test(here)
}

function foldWhitespace(text: string): { text: string; offsets: number[] } {
  let folded = ''
  const offsets: number[] = []
  for (let index = 0; index < text.length; index++) {
    if (text[index] === ' ' && folded.endsWith(' ')) {
      continue
    }
    folded += text[index]
    offsets.push(index)
  }
  return { text: folded, offsets }
}

/** No backend caps, stop-word removal, or spelling repair participates in proof. */
export function preparePaletteTranscriptProofQuery(query: string): readonly string[] {
  const freeText = splitAiVaultSearchQuery(query).text
  const requirements = new Set<string>()
  let at = 0
  while (at < freeText.length) {
    if (/\s/u.test(freeText[at])) {
      at++
      continue
    }
    const quote = freeText[at]
    const close = quote === '"' || quote === "'" ? freeText.indexOf(quote, at + 1) : -1
    const quoted = close >= 0
    const end = quoted ? close + 1 : at + (freeText.slice(at).match(/^\S+/u)?.[0].length ?? 1)
    const value = quoted ? freeText.slice(at + 1, close) : freeText.slice(at, end)
    const text = normalizePaletteText(value).normalized.replace(/ +/g, ' ').trim()
    for (const token of text.split(' ')) {
      if (token) {
        requirements.add(token)
      }
    }
    if (quoted && text) {
      requirements.add(text)
    }
    at = end
  }
  return [...requirements]
}

function windowFor(
  text: string,
  span: MatchRange,
  occurrences: readonly Occurrence[],
  context: number
): PaletteTranscriptWindow {
  let start = Math.max(0, span.start - context)
  let end = Math.min(text.length, span.end + context)
  // Context must also stop at a code-point boundary.
  if (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start])) {
    start--
  }
  if (end < text.length && /[\uDC00-\uDFFF]/u.test(text[end])) {
    end++
  }
  const sourceRanges = mergeMatchRanges(
    occurrences
      .filter((range) => range.start >= span.start && range.end <= span.end)
      .map(({ start, end }) => ({ start, end }))
  )
  return {
    text: text.slice(start, end),
    ranges: sourceRanges.map((range) => ({ start: range.start - start, end: range.end - start })),
    leadingEllipsis: start > 0,
    trailingEllipsis: end < text.length,
    sourceStart: start,
    sourceRanges
  }
}

/** Bounded original-text windows; callers must verify highlighted DOM fit before promotion. */
export function classifyPaletteTranscriptProof(
  text: unknown,
  query: string | readonly string[]
): readonly PaletteTranscriptWindow[] {
  if (
    typeof text !== 'string' ||
    !text ||
    text.length > 1024 ||
    Array.from(text).length > 512 ||
    Array.from(text).some((point) => point.length === 1 && /[\uD800-\uDFFF]/u.test(point))
  ) {
    return []
  }
  const requirements = typeof query === 'string' ? preparePaletteTranscriptProofQuery(query) : query
  if (!requirements.length) {
    return []
  }
  const normalized = normalizePaletteText(text)
  const collapsed = foldWhitespace(normalized.normalized)
  const occurrences: Occurrence[] = []
  for (const [group, requirement] of requirements.entries()) {
    let at = 0
    let found = false
    while (at < collapsed.text.length) {
      const start = collapsed.text.indexOf(requirement, at)
      if (start === -1) {
        break
      }
      const end = start + requirement.length
      const normalizedStart = collapsed.offsets[start]
      const normalizedEnd = collapsed.offsets[end - 1] + 1
      const range = mapNormalizedRange(normalized, normalizedStart, normalizedEnd)
      // Slice and stored-chunk edges never substantiate a boundary.
      const wholeFold =
        (!normalized.starts ||
          normalizedStart === 0 ||
          normalized.starts[normalizedStart] !== normalized.starts[normalizedStart - 1]) &&
        (!normalized.ends ||
          normalizedEnd === normalized.normalized.length ||
          normalized.ends[normalizedEnd - 1] !== normalized.ends[normalizedEnd])
      if (
        wholeFold &&
        sourceSupportedBoundary(text, range.start, 'start') &&
        sourceSupportedBoundary(text, range.end, 'end')
      ) {
        occurrences.push({ ...range, group })
        found = true
      }
      at = start + 1
    }
    if (!found) {
      return []
    }
  }
  // Sweep ends, retaining the latest start per requirement; repeated anchors stay useful.
  occurrences.sort((a, b) => a.end - b.end || a.start - b.start || a.group - b.group)
  const latest = new Map<number, Occurrence>()
  const spans = new Map<string, MatchRange>()
  for (const occurrence of occurrences) {
    if ((latest.get(occurrence.group)?.start ?? -1) < occurrence.start) {
      latest.set(occurrence.group, occurrence)
    }
    if (latest.size !== requirements.length) {
      continue
    }
    const start = Math.min(...Array.from(latest.values(), (range) => range.start))
    spans.set(`${start}:${occurrence.end}`, { start, end: occurrence.end })
  }
  const best = [...spans.values()]
    .sort((a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start)
    .slice(0, TRANSCRIPT_PROOF_WINDOW_LIMIT / 2)
  return best.flatMap((span) => [
    windowFor(text, span, occurrences, 16),
    windowFor(text, span, occurrences, 0)
  ])
}
