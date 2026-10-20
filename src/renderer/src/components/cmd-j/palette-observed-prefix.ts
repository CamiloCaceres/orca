import { translate } from '@/i18n/i18n'
import type { PaletteItem, PaletteListEntry } from '../worktree-jump-palette-model'
import { buildPaletteListEntryRenderKeys } from './palette-list-entry-render-keys'

export type PaletteSectionKey = 'open-tabs' | 'worktrees' | 'projects' | 'middle' | 'tasks'
export type PaletteObservedOccurrence = {
  key: string
  id: string
  type: PaletteListEntry['type']
  section: PaletteSectionKey | null
  label?: string
}

export function paletteEntrySection(entry: PaletteListEntry): PaletteSectionKey | null {
  switch (entry.type) {
    case 'browser-page':
    case 'simulator-tab':
    case 'workspace-tab':
      return 'open-tabs'
    case 'worktree':
      return 'worktrees'
    case 'project-target':
      return 'projects'
    case 'settings':
    case 'quick-action':
      return 'middle'
    case 'task':
      return 'tasks'
    case 'section-header':
    case 'hint':
    case 'create-worktree':
      return null
  }
}

export function describePaletteOccurrences(
  entries: readonly PaletteListEntry[],
  keys: readonly string[]
): PaletteObservedOccurrence[] {
  let section: PaletteSectionKey | null = null
  return entries.map((entry, index) => {
    const itemSection = paletteEntrySection(entry)
    if (itemSection) {
      section = itemSection
    }
    if (entry.type === 'section-header') {
      section = entry.id.includes('open_tabs')
        ? 'open-tabs'
        : entry.id.includes('worktrees')
          ? 'worktrees'
          : entry.id.includes('projects')
            ? 'projects'
            : entry.id.includes('tasks')
              ? 'tasks'
              : 'middle'
    }
    return {
      key: keys[index] ?? entry.id,
      id: entry.id,
      type: entry.type,
      section: entry.type === 'create-worktree' ? null : section,
      ...(entry.type === 'section-header' || entry.type === 'hint' ? { label: entry.label } : {})
    }
  })
}

export function observedPaletteSectionKeys(
  prefix: readonly PaletteObservedOccurrence[],
  section: PaletteSectionKey
): string[] {
  return prefix
    .filter(
      (entry) =>
        entry.section === section && entry.type !== 'section-header' && entry.type !== 'hint'
    )
    .map((entry) => entry.key)
}

function isDestination(entry: PaletteListEntry): entry is PaletteItem {
  return (
    entry.type !== 'hint' && entry.type !== 'section-header' && entry.type !== 'create-worktree'
  )
}

/** Reuses the committed prefix's structure, then lays out the newly ranked unseen suffix. */
export function reconcilePaletteObservedPrefix({
  prefix,
  entries,
  availableItems,
  onExpandSection
}: {
  prefix: readonly PaletteObservedOccurrence[]
  entries: readonly PaletteListEntry[]
  availableItems: readonly PaletteItem[]
  onExpandSection: (section: string) => void
}): PaletteListEntry[] {
  if (!prefix.length) {
    return [...entries]
  }
  const availableKeys = buildPaletteListEntryRenderKeys(availableItems.map((entry) => entry.id))
  const live = new Map(availableKeys.map((key, index) => [key, availableItems[index]]))
  const structural = new Map(entries.map((entry) => [entry.id, entry]))
  const prefixKeys = new Set<string>()
  const protectedControls = new Set<string>()
  const result: PaletteListEntry[] = []
  for (const occurrence of prefix) {
    if (occurrence.type === 'section-header' || occurrence.type === 'hint') {
      const current = structural.get(occurrence.id)
      if (current?.type === occurrence.type) {
        result.push(current)
      } else if (occurrence.type === 'section-header') {
        result.push({ id: occurrence.id, type: 'section-header', label: occurrence.label ?? '' })
      } else {
        result.push({
          id: occurrence.id,
          type: 'hint',
          label: occurrence.label ?? '',
          onSeeMore: () => onExpandSection(occurrence.section ?? '')
        })
      }
      protectedControls.add(occurrence.id)
    } else if (occurrence.type === 'create-worktree') {
      const current = structural.get(occurrence.id)
      if (current) {
        result.push(current)
        protectedControls.add(current.id)
      }
    } else {
      const current = live.get(occurrence.key)
      if (current) {
        result.push(current)
        prefixKeys.add(occurrence.key)
      }
    }
  }
  const keys = buildPaletteListEntryRenderKeys(entries.map((entry) => entry.id))
  const headers = new Map<PaletteSectionKey, PaletteListEntry>()
  for (const description of describePaletteOccurrences(entries, keys)) {
    if (description.type === 'section-header' && description.section) {
      const header = structural.get(description.id)
      if (header) {
        headers.set(description.section, header)
      }
    }
  }
  let lastSection =
    describePaletteOccurrences(
      result,
      result.map((entry) => entry.id)
    ).at(-1)?.section ?? null
  const usedIds = new Set(result.map((entry) => entry.id))
  let continuation = 0
  for (const [index, entry] of entries.entries()) {
    if (
      entry.type === 'section-header' ||
      protectedControls.has(entry.id) ||
      prefixKeys.has(keys[index])
    ) {
      continue
    }
    const section = paletteEntrySection(entry)
    if (section && section !== lastSection) {
      const header = headers.get(section)
      if (header?.type === 'section-header') {
        let id = header.id
        while (usedIds.has(id)) {
          id = `${header.id}__observed_continued_${continuation++}`
        }
        result.push({ ...header, id })
        usedIds.add(id)
      }
      lastSection = section
    }
    result.push(entry)
  }
  const eligible = new Map<PaletteSectionKey, Set<string>>()
  for (const entry of availableItems) {
    const section = paletteEntrySection(entry)
    if (!section) {
      continue
    }
    const ids = eligible.get(section) ?? new Set<string>()
    ids.add(entry.id)
    eligible.set(section, ids)
  }
  const seen = new Map<PaletteSectionKey, Set<string>>()
  const descriptions = describePaletteOccurrences(
    result,
    result.map((entry) => entry.id)
  )
  return result.flatMap((entry, index) => {
    const section = descriptions[index].section
    if (!section) {
      return [entry]
    }
    const ids = seen.get(section) ?? new Set<string>()
    if (isDestination(entry)) {
      ids.add(entry.id)
    }
    seen.set(section, ids)
    if (entry.type !== 'hint') {
      return [entry]
    }
    const count = Math.max(0, (eligible.get(section)?.size ?? 0) - ids.size)
    if (!count && !protectedControls.has(entry.id)) {
      return []
    }
    return [
      {
        ...entry,
        label: translate('worktreeJumpPalette.renderCapOverflow', '{{value0}} more', {
          value0: count
        })
      }
    ]
  })
}

export function survivingPaletteSelection(
  previous: readonly string[],
  current: readonly string[],
  selected: string
): string | null {
  if (current.includes(selected)) {
    return selected
  }
  const previousIndex = previous.indexOf(selected)
  if (previousIndex === -1) {
    return current[0] ?? null
  }
  const currentIds = new Set(current)
  return (
    previous.slice(previousIndex + 1).find((key) => currentIds.has(key)) ??
    previous
      .slice(0, previousIndex)
      .toReversed()
      .find((key) => currentIds.has(key)) ??
    current[0] ??
    null
  )
}
