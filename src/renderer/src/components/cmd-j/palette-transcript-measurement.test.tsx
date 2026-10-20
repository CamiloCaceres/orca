// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { PaletteTranscriptMatch } from '../worktree-jump-palette-transcript-matches'
import { classifyPaletteTranscriptProof } from './palette-transcript-proof'
import { PaletteTranscriptMeasurement } from './palette-transcript-measurement'

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (originalFonts) {
    Object.defineProperty(document, 'fonts', originalFonts)
  } else {
    Reflect.deleteProperty(document, 'fonts')
  }
})

it('reuses fit measurements across pane refreshes and resets them for a new search generation', () => {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { status: 'loaded', addEventListener: vi.fn(), removeEventListener: vi.fn() }
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  const measure = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  const candidate: PaletteTranscriptMatch = {
    worktreeId: 'workspace',
    terminalTabId: 'terminal',
    ordinal: 0,
    snippet: null,
    complete: false,
    windows: classifyPaletteTranscriptProof('a refresh here', 'refresh')
  }
  const onFits = vi.fn()
  const { rerender } = render(
    <PaletteTranscriptMeasurement generationKey="first" candidates={[candidate]} onFits={onFits} />
  )
  expect(onFits.mock.lastCall?.[0].get(0)?.text).toBe('a refresh here')
  expect(measure).toHaveBeenCalledTimes(1)

  for (let update = 0; update < 3; update++) {
    rerender(
      <PaletteTranscriptMeasurement
        generationKey="first"
        candidates={[{ ...candidate }]}
        onFits={onFits}
      />
    )
  }
  expect(measure).toHaveBeenCalledTimes(1)

  rerender(
    <PaletteTranscriptMeasurement generationKey="second" candidates={[candidate]} onFits={onFits} />
  )
  expect(measure).toHaveBeenCalledTimes(2)
})

it('remeasures after coalesced font events even when CSS font declarations are unchanged', () => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  const fonts = new EventTarget()
  Object.defineProperty(fonts, 'status', { value: 'loaded' })
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  const measure = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100)
  const candidates: PaletteTranscriptMatch[] = [
    {
      worktreeId: 'workspace',
      terminalTabId: 'terminal',
      ordinal: 0,
      snippet: null,
      complete: false,
      windows: classifyPaletteTranscriptProof('a refresh here', 'refresh')
    }
  ]
  const onFits = vi.fn()
  render(
    <PaletteTranscriptMeasurement generationKey="query" candidates={candidates} onFits={onFits} />
  )
  const displayKey = onFits.mock.lastCall?.[1]
  expect(onFits.mock.lastCall?.[0].has(0)).toBe(true)
  const initialMeasurements = measure.mock.calls.length
  measure.mockReturnValue(600)
  act(() => {
    fonts.dispatchEvent(new Event('loading'))
    fonts.dispatchEvent(new Event('loadingdone'))
    vi.advanceTimersByTime(50)
  })
  expect(onFits.mock.lastCall?.[1]).toBe(displayKey)
  expect(onFits.mock.lastCall?.[0].has(0)).toBe(false)
  expect(measure.mock.calls.length).toBeGreaterThan(initialMeasurements)
})
