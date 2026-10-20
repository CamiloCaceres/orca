import { useMemo } from 'react'
import { usePluginTerminalThemes, usePluginThemes } from '@/store/plugin-themes'
import type { PluginArtPalette } from '../plugin-catalog/PluginCardArt'

/** A theme plugin's own colours, from what Orca registered for it; empty until it is installed. */
export function usePluginArtPalettes(pluginKey: string): readonly PluginArtPalette[] {
  const appThemes = usePluginThemes()
  const terminalThemes = usePluginTerminalThemes()
  return useMemo(() => {
    const app = appThemes
      .filter((theme) => theme.pluginKey === pluginKey)
      .map((theme) => ({
        background: theme.tokens['--background'],
        foreground: theme.tokens['--foreground'],
        accent: theme.tokens['--primary'] ?? theme.tokens['--foreground'],
        muted: theme.tokens['--card'] ?? theme.tokens['--muted'] ?? theme.tokens['--background']
      }))
    if (app.length > 0) {
      return app
    }
    return terminalThemes
      .filter((theme) => theme.pluginKey === pluginKey && theme.terminal.background)
      .map((theme) => ({
        background: theme.terminal.background ?? '',
        foreground: theme.terminal.foreground ?? theme.terminal.white ?? '',
        accent: theme.terminal.magenta ?? theme.terminal.blue ?? theme.terminal.green ?? '',
        muted: theme.terminal.black ?? theme.terminal.background ?? ''
      }))
  }, [appThemes, terminalThemes, pluginKey])
}
