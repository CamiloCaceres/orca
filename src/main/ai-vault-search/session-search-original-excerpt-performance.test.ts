import { expect, it, vi } from 'vitest'
import { addSyntheticSession, openSessionSearchHarness } from './session-search-engine-test-fixture'
import * as excerpts from './session-search-original-excerpt'

it.runIf(process.env.ORCA_CMD_J_EVALUATION === '1')(
  'budgets the extra indexed reads on a 100-hit page of long messages',
  async () => {
    const harness = await openSessionSearchHarness('ss-excerpt-budget')
    try {
      const text = `${'padding '.repeat(450)}we fixed the token refresh race here ${'context '.repeat(450)}`
      for (let id = 1; id <= 100; id++) {
        addSyntheticSession(harness.db, { id, text })
      }
      const query = { query: 'token refresh race', limit: 100 }
      const sample = (): number => {
        const started = performance.now()
        expect(harness.engine.search(query).hits).toHaveLength(100)
        return performance.now() - started
      }
      const original = excerpts.sessionSearchOriginalExcerpt
      const extraction = vi.spyOn(excerpts, 'sessionSearchOriginalExcerpt')
      extraction.mockReturnValue(undefined)
      for (let at = 0; at < 3; at++) {
        sample()
      }
      const baseline = Array.from({ length: 15 }, sample).sort((a, b) => a - b)
      extraction.mockImplementation(original)
      for (let at = 0; at < 3; at++) {
        sample()
      }
      extraction.mockClear()
      const proposed = Array.from({ length: 15 }, sample).sort((a, b) => a - b)
      expect(proposed[7]).toBeLessThanOrEqual(baseline[7] * 2 + 2)
      expect(extraction).toHaveBeenCalledTimes(1500)
      const hits = harness.engine.search(query).hits
      expect(
        hits.every((hit) => Array.from(hit.evidence?.originalExcerpt?.text ?? '').length <= 512)
      ).toBe(true)
      console.log(
        'Cmd+J host excerpt baseline',
        JSON.stringify({
          hits: hits.length,
          baselineMedianMs: baseline[7],
          proposedMedianMs: proposed[7],
          extraReadsPerPage: 100,
          scannedCodePointsPerPage: text.length * 100,
          returnedCodePointsPerPage: hits.reduce(
            (sum, hit) => sum + Array.from(hit.evidence?.originalExcerpt?.text ?? '').length,
            0
          )
        })
      )
      extraction.mockRestore()
    } finally {
      await harness.close()
    }
  }
)
