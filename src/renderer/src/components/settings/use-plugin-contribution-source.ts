import { useEffect, useMemo } from 'react'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { usePluginIconThemes } from '@/store/plugin-icon-themes'
import {
  ensurePluginLanguagePacksLoaded,
  usePluginLanguagePackStore
} from '@/store/plugin-language-packs'
import { usePluginSyntaxFailureStore } from '@/store/plugin-syntax-failures'
import { usePluginSyntaxes } from '@/store/plugin-syntax-packs'
import { usePluginTerminalThemes, usePluginThemes } from '@/store/plugin-themes'
import { EMPTY_CONTRIBUTION_SOURCE, type PluginContributionSource } from './plugin-contributions'

/** What an installed plugin adds right now, from Orca's live registrations; empty for others. */
export function useInstalledPluginContributionSource(
  plugin: PluginHostListEntry | null
): PluginContributionSource {
  const appThemes = usePluginThemes()
  const terminalThemes = usePluginTerminalThemes()
  const iconThemes = usePluginIconThemes()
  const syntaxes = usePluginSyntaxes()
  // Why the raw store: usable-only filtering would hide the incomplete packs this page explains.
  const languagePacks = usePluginLanguagePackStore((state) => state.entries)
  const failures = usePluginSyntaxFailureStore((state) => state.failures)
  useEffect(() => ensurePluginLanguagePacksLoaded(), [])

  return useMemo(() => {
    if (!plugin) {
      return EMPTY_CONTRIBUTION_SOURCE
    }
    const ours = <Entry extends { pluginKey: string }>(entries: readonly Entry[]): Entry[] =>
      entries.filter((entry) => entry.pluginKey === plugin.pluginKey)
    return {
      appThemes: ours(appThemes),
      terminalThemes: ours(terminalThemes),
      iconThemes: ours(iconThemes),
      syntaxes: ours(syntaxes).map((syntax) => ({
        ...syntax,
        failed: Boolean(failures[syntax.id])
      })),
      languages: ours(languagePacks),
      panels: plugin.panels.map((panel) => panel.title),
      recipes: plugin.vmRecipes?.map((recipe) => recipe.name) ?? [],
      agents: []
    }
  }, [plugin, appThemes, terminalThemes, iconThemes, syntaxes, languagePacks, failures])
}
