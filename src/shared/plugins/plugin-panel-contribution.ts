import { z } from 'zod'
import { pluginIdSchema, pluginRelativePathSchema } from './plugin-manifest-fields'

export const PLUGIN_PANEL_LIMIT = 64

export const pluginPanelContributionSchema = z.object({
  id: pluginIdSchema,
  title: z.string().min(1).max(256),
  /** Lucide icon name rendered in the right-sidebar activity bar. */
  icon: z.string().min(1).max(64).optional(),
  /** HTML entry rendered inside a sandboxed panel frame. */
  entry: pluginRelativePathSchema
})

export type PluginPanelContribution = z.infer<typeof pluginPanelContributionSchema>
