import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { applyDocumentTheme } from '@/lib/document-theme'
import { useAppStore } from '@/store'
import { usePluginThemes } from '@/store/plugin-themes'
import { Button } from '../ui/button'

/** One-click "use it" for the app themes a plugin just added; never applied unasked. */
export function PluginThemeUseNow({
  pluginKey,
  fallback = null
}: {
  pluginKey: string
  /** Shown instead when the plugin adds no app theme. */
  fallback?: React.ReactNode
}): React.JSX.Element | null {
  const themes = usePluginThemes().filter((theme) => theme.pluginKey === pluginKey)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  if (themes.length === 0 || !settings) {
    return <>{fallback}</>
  }
  const use = (theme: (typeof themes)[number]): void => {
    const updates: Partial<GlobalSettings> = {
      theme: theme.base,
      pluginAppTheme: theme.id,
      // Why keep the first one: switching between plugin themes must not lose it.
      themeBeforePlugin: settings.themeBeforePlugin ?? settings.theme
    }
    void updateSettings(updates)
    applyDocumentTheme(theme.base)
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">
        {translate('auto.components.settings.PluginThemeUseNow.label', 'Use now:')}
      </span>
      {themes.map((theme) => (
        <Button
          key={theme.id}
          variant={settings.pluginAppTheme === theme.id ? 'secondary' : 'outline'}
          size="xs"
          aria-pressed={settings.pluginAppTheme === theme.id}
          onClick={() => use(theme)}
        >
          {/* Why inline colour: the swatch is the theme's own palette. */}
          <span
            aria-hidden="true"
            className="flex size-3.5 overflow-hidden rounded-sm ring-1 ring-border"
          >
            <span className="flex-1" style={{ background: theme.tokens['--background'] }} />
            <span
              className="flex-1"
              style={{ background: theme.tokens['--primary'] ?? theme.tokens['--foreground'] }}
            />
          </span>
          {theme.label}
        </Button>
      ))}
    </div>
  )
}
