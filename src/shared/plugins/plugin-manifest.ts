import { z } from 'zod'
import { pluginCapabilitySchema } from './plugin-capabilities'
import { pluginContributesShape } from './plugin-contribution-points'
import { pluginIdSchema, pluginRelativePathSchema } from './plugin-manifest-fields'
import { pluginManifestDetailFields } from './plugin-detail-fields'
import { validatePluginManifestContributions } from './plugin-manifest-contribution-validation'
import { formatPluginSchemaIssues } from './plugin-schema-issues'
import {
  pluginFieldDoc,
  PLUGIN_MANIFEST_V2_SINCE,
  PLUGIN_SCHEMA_SINCE_V1
} from './plugin-schema-field-docs'
import {
  pluginExecutionProfileSchema,
  validatePluginExecutionProfile
} from './plugin-execution-profile'

/**
 * Plugin manifest v1 and v2 (`orca-plugin.json` at the plugin root). The
 * `contributes` key names deliberately mirror common Electron-ecosystem
 * manifest conventions so future adapters stay cheap.
 *
 * Lives in `shared` so the desktop app, the headless `orca serve` runtime,
 * the relay, and the CLI validate manifests identically (SSH/remote parity).
 *
 * Everything here is EXPERIMENTAL: no compatibility promises until pluginApi
 * v1 freezes (see the plugin roadmap).
 */

const SEMVER_RE =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

// Why: v0 supports only the ">=x.y.z" form. A closed grammar keeps the gate
// predictable; richer ranges can be added without breaking old manifests.
export const orcaEngineRangeSchema = z
  .string()
  .max(64)
  .regex(/^>=\d+\.\d+\.\d+$/, 'must be a ">=x.y.z" version range')

const V1 = PLUGIN_SCHEMA_SINCE_V1
const NEXT = PLUGIN_MANIFEST_V2_SINCE

// Why one field set: v1 and v2 differ only in the version, `execution` and `$schema`.
const pluginManifestFields = {
  id: pluginIdSchema.meta(
    pluginFieldDoc('Plugin id, kebab-case. The install identity is `<publisher>.<id>`.', V1, [
      'gleam-syntax'
    ])
  ),
  // Why both ids: bare-id global uniqueness is unverifiable without a registry.
  publisher: pluginIdSchema.meta(
    pluginFieldDoc('Publisher slug, kebab-case. Usually your GitHub user or organization.', V1, [
      'acme'
    ])
  ),
  name: z
    .string()
    .min(1)
    .max(256)
    .meta(pluginFieldDoc('Display name.', V1, ['Gleam'])),
  version: z
    .string()
    .regex(SEMVER_RE, 'must be semver')
    .meta(pluginFieldDoc('Plugin version, semver.', V1, ['1.2.0'])),
  description: z
    .string()
    .max(4096)
    .optional()
    .meta(pluginFieldDoc('One or two sentences shown in the plugin list.', V1)),
  author: z
    .object({
      name: z
        .string()
        .min(1)
        .max(256)
        .meta(pluginFieldDoc('Author or organization name.', V1, ['Acme'])),
      url: z
        .string()
        .max(2048)
        .optional()
        .meta(pluginFieldDoc('Author homepage.', V1, ['https://example.com']))
    })
    .optional()
    .meta(pluginFieldDoc('Who maintains the plugin.', V1)),
  repository: z
    .string()
    .max(2048)
    .optional()
    .meta(
      pluginFieldDoc('Source repository URL.', V1, ['https://github.com/acme/orca-gleam-syntax'])
    ),
  ...pluginManifestDetailFields,
  icon: pluginRelativePathSchema
    .optional()
    .meta(pluginFieldDoc('Square image shown beside the plugin name.', V1, ['assets/icon.png'])),
  engines: z
    .object({
      orca: orcaEngineRangeSchema.meta(
        pluginFieldDoc(
          'Oldest Orca release this plugin runs on, as `>=x.y.z`. Raise it when you use a field newer than the current floor.',
          V1,
          ['>=1.4.223']
        )
      )
    })
    .meta(pluginFieldDoc('Host versions this plugin supports. Older hosts refuse to load it.', V1)),
  pluginApi: z
    .literal(1)
    .meta(pluginFieldDoc('Major version of the plugin host API this plugin targets.', V1)),
  main: pluginRelativePathSchema
    .optional()
    .meta(
      pluginFieldDoc(
        'Node entry run in an out-of-process plugin worker. Requires the `trusted-worker` execution profile.',
        V1,
        ['dist/main.mjs']
      )
    ),
  contributes: z
    .object(pluginContributesShape)
    .strict()
    // Why prefault: runs `{}` through the schema, so every family's own default applies.
    .prefault({})
    .meta(pluginFieldDoc('What the plugin adds to Orca. Every point defaults to empty.', V1)),
  capabilities: z
    .array(pluginCapabilitySchema)
    .max(32)
    .default([])
    .meta(pluginFieldDoc('Host APIs the plugin asks the user to grant. At most 32.', V1))
}

const pluginManifestV1Object = z.object({ manifestVersion: z.literal(1), ...pluginManifestFields })

// Why strict: v2 declares its execution profile, so unknown keys must not smuggle in behavior.
export const pluginManifestV2Object = z
  .object({
    $schema: z
      .string()
      .max(2048)
      .optional()
      .meta(pluginFieldDoc('JSON Schema URL for editor completion. Ignored by Orca.', NEXT)),
    manifestVersion: z
      .literal(2)
      .meta(pluginFieldDoc('Manifest format. Use 2 for new plugins.', NEXT)),
    execution: pluginExecutionProfileSchema.meta(
      pluginFieldDoc(
        'Most authority the plugin needs, least first: `data` (themes, syntaxes, translations), `instructional` (commands, shortcuts, recipes, agents), `sandboxed-ui` (panels), `trusted-worker` (`main` and events). Contributions beyond it fail validation.',
        NEXT,
        ['data']
      )
    ),
    ...pluginManifestFields
  })
  .strict()

export const pluginManifestSchema = z.discriminatedUnion('manifestVersion', [
  pluginManifestV1Object.superRefine(validatePluginManifestContributions),
  pluginManifestV2Object.superRefine((manifest, ctx) => {
    validatePluginManifestContributions(manifest, ctx)
    validatePluginExecutionProfile(manifest, ctx)
  })
])

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export { PLUGIN_PANEL_LIMIT, type PluginPanelContribution } from './plugin-panel-contribution'
export { PLUGIN_COMMAND_LIMIT, type PluginCommandContribution } from './plugin-command-contribution'
export {
  PLUGIN_EVENT_NAMES,
  PLUGIN_EVENT_SUBSCRIPTION_LIMIT,
  type PluginEventContribution,
  type PluginEventName
} from './plugin-event-contribution'

export {
  isSafePluginId,
  PLUGIN_ID_MAX_LENGTH,
  pluginCommandIdSchema
} from './plugin-manifest-fields'

export const PLUGIN_MANIFEST_FILENAME = 'orca-plugin.json'

/** Canonical install identity: `<publisher>.<id>` (also the install dir name). */
export function qualifiedPluginKey(manifest: Pick<PluginManifest, 'publisher' | 'id'>): string {
  return `${manifest.publisher}.${manifest.id}`
}

export type PluginManifestParseResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; error: string }

export function parsePluginManifest(raw: unknown): PluginManifestParseResult {
  const parsed = pluginManifestSchema.safeParse(raw)
  if (parsed.success) {
    return { ok: true, manifest: parsed.data }
  }
  return { ok: false, error: formatPluginSchemaIssues(parsed.error.issues) }
}

/** v0 engines gate: supports the ">=x.y.z" grammar the schema enforces.
 *  Prerelease/build suffixes on the host version are ignored for ordering. */
export function satisfiesOrcaEngineRange(hostVersion: string, range: string): boolean {
  const minimum = range.slice(2)
  const parse = (value: string): number[] =>
    value
      .split(/[-+]/)[0]!
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0)
  const host = parse(hostVersion)
  const min = parse(minimum)
  for (let i = 0; i < 3; i++) {
    const a = host[i] ?? 0
    const b = min[i] ?? 0
    if (a !== b) {
      return a > b
    }
  }
  return true
}

export { isPluginPanelTabKey, isQualifiedPluginKey, pluginPanelTabKey } from './plugin-tab-key'
