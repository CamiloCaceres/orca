import { z } from 'zod'

/** Domain events a plugin can subscribe to in v0. Closed set: server-side
 *  filtering means plugins only ever receive what they subscribed to. */
export const PLUGIN_EVENT_NAMES = [
  'worktree.created',
  'worktree.removed',
  'agent.status.changed'
] as const
export const PLUGIN_EVENT_SUBSCRIPTION_LIMIT = PLUGIN_EVENT_NAMES.length

export type PluginEventName = (typeof PLUGIN_EVENT_NAMES)[number]

export const pluginEventContributionSchema = z.object({
  on: z.enum(PLUGIN_EVENT_NAMES)
})

export type PluginEventContribution = z.infer<typeof pluginEventContributionSchema>
