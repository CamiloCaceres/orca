import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { HighlightedText } from '../worktree-jump-palette-primitives'
import type { PaletteTranscriptSnippet } from '../worktree-jump-palette-model'
import type { PaletteTranscriptMatch } from '../worktree-jump-palette-transcript-matches'

export const PaletteTranscriptExcerpt = memo(function PaletteTranscriptExcerpt({
  snippet,
  measurement = false
}: {
  snippet: PaletteTranscriptSnippet | null
  measurement?: boolean
}): React.JSX.Element {
  return (
    <div
      data-slot={
        measurement ? 'palette-transcript-measurement-text' : 'palette-open-tab-transcript-snippet'
      }
      className="mt-0.5 h-4 overflow-hidden whitespace-nowrap text-xs leading-4 text-muted-foreground"
    >
      {snippet ? (
        <>
          {snippet.leadingEllipsis ? '…' : null}
          <HighlightedText text={snippet.text} matchRanges={snippet.ranges} />
          {snippet.trailingEllipsis ? '…' : null}
        </>
      ) : null}
    </div>
  )
})

export type PaletteTranscriptMeasurementProps = {
  generationKey: string
  candidates: readonly PaletteTranscriptMatch[]
  onFits: (fits: ReadonlyMap<number, PaletteTranscriptSnippet>, displayKey: string) => void
}

function measurementKey(window: PaletteTranscriptSnippet): string {
  return JSON.stringify([
    window.text,
    window.ranges,
    window.leadingEllipsis,
    window.trailingEllipsis
  ])
}

/** One out-of-flow batch covers every candidate, including rows beyond renderer caps. */
export const PaletteTranscriptMeasurement = memo(function PaletteTranscriptMeasurement({
  generationKey,
  candidates,
  onFits
}: PaletteTranscriptMeasurementProps): React.JSX.Element {
  const rulerRef = useRef<HTMLDivElement>(null)
  const samplesRef = useRef(new Map<string, HTMLDivElement>())
  const typographyRef = useRef<HTMLDivElement>(null)
  const previousCacheKey = useRef('')
  const [revision, setRevision] = useState(0)
  const samples = useMemo(
    () =>
      new Map(
        candidates.flatMap((candidate) =>
          candidate.windows.map((window) => [measurementKey(window), window] as const)
        )
      ),
    [candidates]
  )
  const fitCache = useRef(new Map<string, boolean>())
  useLayoutEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) {
      return
    }
    let frame = 0
    const invalidate = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRevision((value) => value + 1))
    }
    const invalidateTypography = (): void => {
      fitCache.current.clear()
      invalidate()
    }
    const observer = new ResizeObserver(invalidate)
    observer.observe(ruler)
    const typographyObserver = new MutationObserver(invalidateTypography)
    typographyObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    window.addEventListener('resize', invalidate)
    document.fonts?.addEventListener('loadingdone', invalidateTypography)
    document.fonts?.addEventListener('loading', invalidateTypography)
    return () => {
      observer.disconnect()
      typographyObserver.disconnect()
      window.removeEventListener('resize', invalidate)
      cancelAnimationFrame(frame)
      document.fonts?.removeEventListener('loadingdone', invalidateTypography)
      document.fonts?.removeEventListener('loading', invalidateTypography)
    }
  }, [])
  useLayoutEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) {
      return
    }
    // Layout dimensions exclude the dialog's opening zoom.
    const width = ruler.clientWidth
    const typography = typographyRef.current?.firstElementChild
    const style = typography ? getComputedStyle(typography) : null
    const highlight = typography?.querySelector('span')
    const displayKey = JSON.stringify([
      width,
      style?.font,
      style?.letterSpacing,
      highlight ? getComputedStyle(highlight).font : null,
      document.fonts?.status
    ])
    const cacheKey = JSON.stringify([generationKey, displayKey])
    if (previousCacheKey.current !== cacheKey) {
      fitCache.current.clear()
    }
    previousCacheKey.current = cacheKey
    const fits = new Map<number, PaletteTranscriptSnippet>()
    if (width > 0 && document.fonts?.status === 'loaded') {
      for (const candidate of candidates) {
        for (const window of candidate.windows) {
          const sampleKey = measurementKey(window)
          const sample = samplesRef.current.get(sampleKey)
          if (!sample) {
            continue
          }
          const key = `${displayKey}:${sampleKey}`
          let fitsWindow = fitCache.current.get(key)
          if (fitsWindow === undefined) {
            fitsWindow = sample.offsetWidth < width
            fitCache.current.set(key, fitsWindow)
          }
          if (fitsWindow) {
            fits.set(candidate.ordinal, window)
            break
          }
        }
      }
    }
    onFits(fits, displayKey)
  }, [candidates, generationKey, onFits, revision])
  return (
    <div aria-hidden="true" className="pointer-events-none invisible absolute inset-x-2.5 top-0">
      {/* CommandDialog's descendant selector overrides each row's padding with px-2. */}
      <div className="mx-0.5 flex gap-3 border border-transparent px-2">
        <div className="w-4 shrink-0" />
        <div
          ref={rulerRef}
          data-slot="palette-transcript-ruler"
          className="relative min-w-0 flex-1"
        >
          <div ref={typographyRef} className="absolute top-0 left-0 w-max">
            <PaletteTranscriptExcerpt
              measurement
              snippet={{ text: 'M', ranges: [{ start: 0, end: 1 }] }}
            />
          </div>
          {Array.from(samples, ([key, window]) => {
            return (
              <div
                key={key}
                ref={(node) => {
                  if (node) {
                    samplesRef.current.set(key, node)
                  } else {
                    samplesRef.current.delete(key)
                  }
                }}
                className="absolute top-0 left-0 w-max"
              >
                <PaletteTranscriptExcerpt measurement snippet={window} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
