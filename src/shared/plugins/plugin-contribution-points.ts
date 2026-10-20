import { z } from 'zod'
import type { PluginCatalogType } from './plugin-catalog-release'
import {
  PLUGIN_COMMAND_LIMIT,
  pluginCommandContributionSchema
} from './plugin-command-contribution'
import {
  PLUGIN_AGENT_PROFILE_LIMIT,
  PLUGIN_ICON_THEME_LIMIT,
  PLUGIN_KEYBINDING_LIMIT,
  PLUGIN_LANGUAGE_PACK_LIMIT,
  PLUGIN_SYNTAX_LIMIT,
  PLUGIN_TERMINAL_THEME_LIMIT,
  PLUGIN_THEME_LIMIT,
  PLUGIN_VM_RECIPE_LIMIT,
  pluginAgentProfileContributionSchema,
  pluginKeybindingContributionSchema,
  pluginLanguagePackContributionSchema,
  pluginSyntaxContributionSchema,
  pluginThemeContributionSchema,
  pluginVmRecipeContributionSchema
} from './plugin-content-pack-contributions'
import {
  PLUGIN_EVENT_SUBSCRIPTION_LIMIT,
  pluginEventContributionSchema
} from './plugin-event-contribution'
import type { PluginExecutionProfile } from './plugin-execution-profile'
import { PLUGIN_PANEL_LIMIT, pluginPanelContributionSchema } from './plugin-panel-contribution'

/** Every `contributes` key, in manifest order. Adding a point starts here. */
export const PLUGIN_CONTRIBUTION_POINTS = [
  'panels',
  'commands',
  'events',
  'languagePacks',
  'keybindings',
  'vmRecipes',
  'agents',
  'themes',
  'terminalThemes',
  'iconThemes',
  'syntaxes'
] as const

export type PluginContributionPoint = (typeof PLUGIN_CONTRIBUTION_POINTS)[number]

function contributionList<Item extends z.ZodType>(item: Item, limit: number) {
  return z.array(item).max(limit).default([])
}

export const pluginContributesShape = {
  panels: contributionList(pluginPanelContributionSchema, PLUGIN_PANEL_LIMIT),
  commands: contributionList(pluginCommandContributionSchema, PLUGIN_COMMAND_LIMIT),
  events: contributionList(pluginEventContributionSchema, PLUGIN_EVENT_SUBSCRIPTION_LIMIT),
  languagePacks: contributionList(pluginLanguagePackContributionSchema, PLUGIN_LANGUAGE_PACK_LIMIT),
  keybindings: contributionList(pluginKeybindingContributionSchema, PLUGIN_KEYBINDING_LIMIT),
  vmRecipes: contributionList(pluginVmRecipeContributionSchema, PLUGIN_VM_RECIPE_LIMIT),
  agents: contributionList(pluginAgentProfileContributionSchema, PLUGIN_AGENT_PROFILE_LIMIT),
  themes: contributionList(pluginThemeContributionSchema, PLUGIN_THEME_LIMIT),
  terminalThemes: contributionList(pluginThemeContributionSchema, PLUGIN_TERMINAL_THEME_LIMIT),
  iconThemes: contributionList(pluginThemeContributionSchema, PLUGIN_ICON_THEME_LIMIT),
  syntaxes: contributionList(pluginSyntaxContributionSchema, PLUGIN_SYNTAX_LIMIT)
} satisfies Record<PluginContributionPoint, z.ZodType>

type ContributionPointPolicy = {
  /** Least execution profile allowed to carry a non-empty list of this point. */
  execution: PluginExecutionProfile
  /** Catalog type a release declares for this point; null when `main` already implies it. */
  catalogType: PluginCatalogType | null
}

export const PLUGIN_CONTRIBUTION_POINT_POLICY: Record<
  PluginContributionPoint,
  ContributionPointPolicy
> = {
  panels: { execution: 'sandboxed-ui', catalogType: 'panel' },
  commands: { execution: 'instructional', catalogType: 'instructions' },
  // Why no catalog type: events need a worker, which `main` already declares.
  events: { execution: 'trusted-worker', catalogType: null },
  languagePacks: { execution: 'data', catalogType: 'interface-language' },
  keybindings: { execution: 'instructional', catalogType: 'instructions' },
  vmRecipes: { execution: 'instructional', catalogType: 'instructions' },
  agents: { execution: 'instructional', catalogType: 'instructions' },
  themes: { execution: 'data', catalogType: 'app-theme' },
  terminalThemes: { execution: 'data', catalogType: 'terminal-theme' },
  iconThemes: { execution: 'data', catalogType: 'icon-theme' },
  syntaxes: { execution: 'data', catalogType: 'syntax' }
}
