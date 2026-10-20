import { afterEach, expect, it, vi } from 'vitest'
import { AiVaultSearchEvidenceSchema } from '../../shared/ai-vault-search-contract'
import {
  addSyntheticSession,
  openSessionSearchHarness,
  type SessionSearchHarness
} from './session-search-engine-test-fixture'
import {
  selectOriginalExcerpt,
  sessionSearchOriginalExcerpt
} from './session-search-original-excerpt'

let harness: SessionSearchHarness | null = null
afterEach(async () => {
  vi.restoreAllMocks()
  await harness?.close()
  harness = null
})

it('returns contiguous original context which proves an interior phrase despite legacy ellipses', async () => {
  harness = await openSessionSearchHarness('ss-original-interior')
  const text = `Context ${'padding '.repeat(700)}we fixed the token refresh race today ${'ending '.repeat(180)}`
  addSyntheticSession(harness.db, { id: 1, text })
  const evidence = harness.engine.search({ query: 'token refresh race' }).hits[0]?.evidence
  expect(evidence?.snippet).toContain('…')
  const original = evidence?.originalExcerpt?.text ?? ''
  expect(text).toContain(original)
  expect(Array.from(original)).toHaveLength(512)
  expect(original).toContain('we fixed the token refresh race today')
})

it('prefers compact distinct anchors to an early common word', () => {
  const text = `token ${'padding '.repeat(180)}we fixed token refresh race here ${'padding '.repeat(100)}`
  const original = selectOriginalExcerpt(text, 'token refresh race').text
  expect(original).toContain('we fixed token refresh race here')
  expect(text).toContain(original)
})

it('keeps shadow-only evidence original, including literal marks and ellipses', async () => {
  harness = await openSessionSearchHarness('ss-original-shadow')
  const text = 'look at [[ token_refresh unrelated words race_condition ]] … here'
  addSyntheticSession(harness.db, { id: 1, text })
  const evidence = harness.engine.search({ query: '"refresh race"' }).hits[0]?.evidence
  expect(evidence?.originalExcerpt?.text).toBe(text)
  expect(evidence?.originalExcerpt?.text).not.toContain('refresh race')
})

it('never reads a forbidden tool column or assembles columns', async () => {
  harness = await openSessionSearchHarness('ss-original-scope')
  addSyntheticSession(harness.db, {
    id: 1,
    text: 'look at refresh here',
    toolText: 'we fixed token race here'
  })
  const conversation = harness.engine.search({ query: 'refresh', scope: 'conversation' }).hits[0]
  expect(conversation?.evidence?.originalExcerpt?.text).toBe('look at refresh here')
  const all = harness.engine.search({ query: 'refresh token race' }).hits[0]
  expect(all?.evidence?.originalExcerpt?.text).toBe('we fixed token race here')
})

it('bounds Unicode code points and keeps surrogate pairs intact', () => {
  const text = `${'😀'.repeat(200)} a needle here ${'😀'.repeat(400)}`
  const original = selectOriginalExcerpt(text, 'needle').text
  expect(Array.from(original)).toHaveLength(512)
  expect(text).toContain(original)
  expect(
    AiVaultSearchEvidenceSchema.safeParse({
      snippet: '',
      role: 'user',
      timestamp: null,
      originalExcerpt: { text: original }
    }).success
  ).toBe(true)
})

it('selects the right original offsets after NFC composition shortens a long prefix', () => {
  const text = `${'e\u0301'.repeat(2500)} before café token refresh race after ${'ending '.repeat(100)}`
  const original = selectOriginalExcerpt(text, 'café token refresh race').text
  expect(text).toContain(original)
  expect(original).toContain('before café token refresh race after')
  expect(Array.from(original).length).toBeLessThanOrEqual(512)
})

it('rechecks retention and the session join at the final indexed read', async () => {
  harness = await openSessionSearchHarness('ss-original-lifetime')
  addSyntheticSession(harness.db, { id: 1, text: 'a needle here' })
  const row = harness.db.prepare('SELECT id FROM messages LIMIT 1').get()
  if (typeof row !== 'object' || !row || !('id' in row) || typeof row.id !== 'number') {
    throw new Error('missing row')
  }
  expect(
    sessionSearchOriginalExcerpt(harness.db, 'all', row.id, 'needle', 1740000000001)
  ).toBeUndefined()
  harness.db.prepare('DELETE FROM sessions WHERE id = 1').run()
  expect(sessionSearchOriginalExcerpt(harness.db, 'all', row.id, 'needle', null)).toBeUndefined()
})

it('keeps legacy evidence usable when optional provenance is absent or malformed', () => {
  const legacy = { snippet: '[[needle]]', role: 'user', timestamp: null }
  expect(AiVaultSearchEvidenceSchema.parse(legacy)).toEqual(legacy)
  for (const originalExcerpt of [
    null,
    { text: 12 },
    { text: 'x'.repeat(513) },
    { text: '\uD800' }
  ]) {
    expect(
      AiVaultSearchEvidenceSchema.parse({ ...legacy, originalExcerpt }).originalExcerpt
    ).toBeUndefined()
  }
})

it('brackets the extra content read with the engine generation check', async () => {
  harness = await openSessionSearchHarness('ss-original-generation')
  const { db, engine } = harness
  addSyntheticSession(db, { id: 1, text: 'a needle here' })
  const prepare = db.prepare.bind(db)
  let changed = false
  vi.spyOn(db, 'prepare').mockImplementation((sql) => {
    if (!changed && sql.includes('substr(f.user_text')) {
      changed = true
      prepare(
        "UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'index_generation'"
      ).run()
    }
    return prepare(sql)
  })
  expect(() => engine.search({ query: 'needle' })).toThrow('generation')
})
