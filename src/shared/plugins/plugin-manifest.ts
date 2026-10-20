import { z } from 'zod'
import { pluginCapabilitySchema } from './plugin-capabilities'
import { pluginContributesShape } from './plugin-contribution-points'
import { pluginIdSchema, pluginRelativePathSchema } from './plugin-manifest-fields'
import { validatePluginManifestContributions } from './plugin-manifest-contribution-validation'
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
const orcaEngineRangeSchema = z
  .string()
  .max(64)
  .regex(/^>=\d+\.\d+\.\d+$/, 'must be a ">=x.y.z" version range')

const pluginManifestV1Object = z.object({
  manifestVersion: z.literal(1),
  id: pluginIdSchema,
  /** Publisher slug; canonical identity is `<publisher>.<id>` — bare-id
   *  global uniqueness is unverifiable without a registry. */
  publisher: pluginIdSchema,
  name: z.string().min(1).max(256),
  version: z.string().regex(SEMVER_RE, 'must be semver'),
  description: z.string().max(4096).optional(),
  author: z
    .object({ name: z.string().min(1).max(256), url: z.string().max(2048).optional() })
    .optional(),
  repository: z.string().max(2048).optional(),
  icon: pluginRelativePathSchema.optional(),
  /** Minimum host version gate; the host refuses to load below it. */
  engines: z.object({ orca: orcaEngineRangeSchema }),
  /** Host-API major version this plugin targets. */
  pluginApi: z.literal(1),
  /** Node entry executed inside the out-of-process plugin worker. */
  main: pluginRelativePathSchema.optional(),
  contributes: z
    .object(pluginContributesShape)
    .strict()
    // Why prefault: runs `{}` through the schema, so every family's own default applies.
    .prefault({}),
  capabilities: z.array(pluginCapabilitySchema).max(32).default([])
})

// Why strict: v2 declares its execution profile, so unknown keys must not smuggle in behavior.
const pluginManifestV2Object = pluginManifestV1Object
  .extend({ manifestVersion: z.literal(2), execution: pluginExecutionProfileSchema })
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
  const issue = parsed.error.issues[0]
  const path = issue?.path.join('.') || '(root)'
  return { ok: false, error: `${path}: ${issue?.message ?? 'invalid manifest'}` }
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
