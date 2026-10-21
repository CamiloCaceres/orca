import { useState } from 'react'
import type { PluginHostImages } from '../../../../shared/plugins/plugin-image-url'
import { translate } from '@/i18n/i18n'
import { PluginCardArt, type PluginArtPalette } from '../plugin-catalog/PluginCardArt'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { pluginArtTypes } from '../plugin-catalog/PluginRowArt'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

/** The page's 16:10 picture: the author's cover, else the card's drawn art. Space is reserved. */
export function PluginPageHero({
  entry,
  images,
  palettes
}: {
  entry: PluginListEntry
  images: PluginHostImages | undefined
  palettes: readonly PluginArtPalette[]
}): React.JSX.Element {
  const cover = images?.cover
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/40">
      {cover ? (
        <img
          src={cover.url}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          decoding="async"
          className="block aspect-[16/10] w-full object-cover"
        />
      ) : (
        <PluginCardArt
          name={entry.name}
          types={pluginArtTypes(entry)}
          fileType={entry.listing?.release?.fileTypes?.[0] ?? null}
          palettes={palettes}
          tintKey={entry.pluginKey}
        />
      )}
    </div>
  )
}

/** Screenshots as a scroll-snap strip; each opens large with its alt text and caption. */
export function PluginScreenshots({
  images
}: {
  images: PluginHostImages | undefined
}): React.JSX.Element | null {
  const [open, setOpen] = useState<number | null>(null)
  const shots = images?.screenshots ?? []
  if (shots.length === 0) {
    return null
  }
  const shown = open === null ? null : shots[open]
  return (
    <section className="mt-6">
      <h3 className="mb-2 flex items-baseline gap-2 px-0.5 text-2xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        {translate('auto.components.settings.PluginPageHero.screenshots', 'Screenshots')}
        <span className="font-normal tracking-normal normal-case">{shots.length}</span>
      </h3>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-sleek">
        {shots.map((shot, index) => (
          <li key={shot.url} className="w-60 shrink-0 snap-start">
            <button
              type="button"
              className="block w-full overflow-hidden rounded-lg border border-border/70 bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={translate(
                'auto.components.settings.PluginPageHero.openScreenshot',
                'Open screenshot: {{value0}}',
                { value0: shot.alt }
              )}
              onClick={() => setOpen(index)}
            >
              <img
                src={shot.url}
                alt=""
                width={shot.width}
                height={shot.height}
                loading="lazy"
                decoding="async"
                className="block aspect-[16/10] w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={shown !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogTitle className="sr-only">{shown?.alt ?? ''}</DialogTitle>
          {shown ? (
            <>
              <img
                src={shown.url}
                alt={shown.alt}
                className="block aspect-[16/10] w-full rounded-lg object-contain"
              />
              {shown.caption ? <DialogDescription>{shown.caption}</DialogDescription> : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
