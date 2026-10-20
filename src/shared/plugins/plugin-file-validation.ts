import {
  PLUGIN_CATALOG_FILENAME,
  pluginCatalogEntrySchema,
  pluginCatalogSchema,
  pluginCatalogVersionError
} from './plugin-catalog'
import { PLUGIN_MANIFEST_FILENAME, parsePluginManifest } from './plugin-manifest'
import { PLUGIN_MARKETPLACE_ENTRY_LIMIT } from './plugin-marketplace'
import { formatPluginSchemaIssues } from './plugin-schema-issues'

/**
 * Strict checks for authors and catalog CI. The runtime reads catalogs tolerantly (skipping,
 * trimming, keeping the first duplicate) so a mistake never hides other plugins; here every one
 * of those repairs is an error, so it is fixed before it ships.
 */
export function validatePluginFile(fileName: string, raw: unknown): string[] {
  if (fileName === PLUGIN_MANIFEST_FILENAME) {
    const parsed = parsePluginManifest(raw)
    return parsed.ok ? [] : [parsed.error]
  }
  if (fileName === PLUGIN_CATALOG_FILENAME) {
    return validatePluginCatalog(raw)
  }
  return [
    `unknown plugin file ${fileName}; expected ${PLUGIN_MANIFEST_FILENAME} or ${PLUGIN_CATALOG_FILENAME}`
  ]
}

function validatePluginCatalog(raw: unknown): string[] {
  const tooNew = pluginCatalogVersionError(raw)
  if (tooNew) {
    return [tooNew]
  }
  const parsed = pluginCatalogSchema.safeParse(raw)
  if (!parsed.success) {
    return [formatPluginSchemaIssues(parsed.error.issues, raw)]
  }
  const entries: unknown[] =
    typeof raw === 'object' && raw !== null && 'plugins' in raw && Array.isArray(raw.plugins)
      ? raw.plugins
      : []
  const errors: string[] = []
  if (entries.length > PLUGIN_MARKETPLACE_ENTRY_LIMIT) {
    errors.push(`plugins: must be at most ${PLUGIN_MARKETPLACE_ENTRY_LIMIT} items`)
  }
  const seen = new Set<string>()
  for (const [index, entry] of entries.entries()) {
    const at = `plugins[${index}]`
    const result = pluginCatalogEntrySchema.safeParse(entry)
    if (!result.success) {
      errors.push(`${at}: ${formatPluginSchemaIssues(result.error.issues, entry)}`)
      continue
    }
    if (seen.has(result.data.id)) {
      errors.push(`${at}.id: duplicate plugin id ${result.data.id}`)
    }
    seen.add(result.data.id)
    // Why compare counts: the entry schema silently drops what it cannot read.
    const rawEntry = typeof entry === 'object' && entry !== null ? entry : {}
    const rawReleases =
      'releases' in rawEntry && Array.isArray(rawEntry.releases) ? rawEntry.releases : []
    if (rawReleases.length !== result.data.releases.length) {
      errors.push(
        `${at}.releases: ${rawReleases.length - result.data.releases.length} release(s) are unreadable or over the limit`
      )
    }
    const rawCategories =
      'categories' in rawEntry && Array.isArray(rawEntry.categories) ? rawEntry.categories : []
    if (rawCategories.length !== result.data.categories.length) {
      errors.push(`${at}.categories: has invalid, repeated or extra categories`)
    }
    if (
      'description' in rawEntry &&
      rawEntry.description !== undefined &&
      result.data.description === undefined
    ) {
      errors.push(`${at}.description: must be text of 1 to 4096 characters`)
    }
  }
  return errors
}
