import type { GlobalSettings } from '../global-settings-types'
import { normalizePluginThemeSettings } from '../plugin-theme-settings'
import { normalizePluginFileTypeSuggestionSettings } from './plugin-file-type'

/** Bounds every setting that plugins or plugin UI write; only keys present in `input` return. */
export function normalizePluginOwnedSettings(input: object): Partial<GlobalSettings> {
  return {
    ...normalizePluginThemeSettings(input),
    ...normalizePluginFileTypeSuggestionSettings(input)
  }
}
