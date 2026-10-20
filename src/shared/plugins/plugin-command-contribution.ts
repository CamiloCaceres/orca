import { z } from 'zod'
import { PLUGIN_COMMAND_ALIAS_ACTION_IDS } from './plugin-command-actions'
import { pluginCommandIdSchema } from './plugin-manifest-fields'
import { pluginFieldDoc, PLUGIN_SCHEMA_SINCE_V1 } from './plugin-schema-field-docs'

export const PLUGIN_COMMAND_LIMIT = 256

export const pluginCommandContextSchema = z.enum(['global', 'worktree'])

export const pluginCommandContributionSchema = z
  .object({
    id: pluginCommandIdSchema.meta(
      pluginFieldDoc(
        'Command id, unique within the plugin. Dotted namespaces are allowed.',
        PLUGIN_SCHEMA_SINCE_V1,
        ['jupyter.restartKernel']
      )
    ),
    title: z
      .string()
      .min(1)
      .max(256)
      .meta(
        pluginFieldDoc('Title shown in the command palette.', PLUGIN_SCHEMA_SINCE_V1, [
          'Restart kernel'
        ])
      ),
    context: pluginCommandContextSchema
      .optional()
      .meta(
        pluginFieldDoc(
          '`worktree` hides the command when no worktree is active. Defaults to `global`.',
          PLUGIN_SCHEMA_SINCE_V1
        )
      ),
    action: pluginCommandIdSchema.optional().meta({
      ...pluginFieldDoc(
        'Built-in Orca action this command runs. A command with an action is declarative and never starts the plugin worker; one without needs `main`.',
        PLUGIN_SCHEMA_SINCE_V1,
        ['view.tasks']
      ),
      // Why: the runtime refinement accepts exactly this set, so editors can complete it.
      enum: [...PLUGIN_COMMAND_ALIAS_ACTION_IDS]
    })
  })
  .meta({
    id: 'CommandContribution',
    description:
      'A command palette entry. Requires the `instructional` execution profile or higher.'
  })

export type PluginCommandContribution = z.infer<typeof pluginCommandContributionSchema>
