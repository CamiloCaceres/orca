import { z } from 'zod'
import { pluginCommandIdSchema } from './plugin-manifest-fields'

export const PLUGIN_COMMAND_LIMIT = 256

export const pluginCommandContributionSchema = z.object({
  id: pluginCommandIdSchema,
  title: z.string().min(1).max(256),
  context: z.enum(['global', 'worktree']).optional(),
  /** Built-in action aliases remain declarative and do not activate a worker. */
  action: pluginCommandIdSchema.optional()
})

export type PluginCommandContribution = z.infer<typeof pluginCommandContributionSchema>
