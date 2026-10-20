import { z } from 'zod'
import { pluginFieldDoc, PLUGIN_SCHEMA_SINCE_V1 } from './plugin-schema-field-docs'

/** Domain events a plugin can subscribe to in v0. Closed set: server-side
 *  filtering means plugins only ever receive what they subscribed to. */
export const PLUGIN_EVENT_NAMES = [
  'worktree.created',
  'worktree.removed',
  'agent.status.changed'
] as const
export const PLUGIN_EVENT_SUBSCRIPTION_LIMIT = PLUGIN_EVENT_NAMES.length

export type PluginEventName = (typeof PLUGIN_EVENT_NAMES)[number]

export const pluginEventContributionSchema = z
  .object({
    on: z
      .enum(PLUGIN_EVENT_NAMES)
      .meta(pluginFieldDoc('Event delivered to the plugin worker.', PLUGIN_SCHEMA_SINCE_V1))
  })
  .meta({
    id: 'EventContribution',
    description:
      'An event subscription. Requires `main`, the `trusted-worker` execution profile and the `events:subscribe` capability.'
  })

export type PluginEventContribution = z.infer<typeof pluginEventContributionSchema>
