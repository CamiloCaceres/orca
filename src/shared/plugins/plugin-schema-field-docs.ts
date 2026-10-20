/** First release whose host read manifest v1 and its first seven contribution points. */
export const PLUGIN_SCHEMA_SINCE_V1 = '1.4.223'
// Why a sentinel: manifest v2 and catalog v2 ship in no release yet; the release that ships
// them replaces this with its version.
export const PLUGIN_SCHEMA_SINCE_UNRELEASED = 'unreleased'

type PluginFieldDoc = {
  description: string
  'x-orca-since': string
  examples?: unknown[]
}

/** Metadata the published JSON Schema and the author reference render for one field. */
export function pluginFieldDoc(
  description: string,
  since: string,
  examples?: readonly unknown[]
): PluginFieldDoc {
  return examples
    ? { description, 'x-orca-since': since, examples: [...examples] }
    : { description, 'x-orca-since': since }
}
