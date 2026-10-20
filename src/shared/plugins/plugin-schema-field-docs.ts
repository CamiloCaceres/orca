/** First release whose host read manifest v1 and its first seven contribution points. */
export const PLUGIN_SCHEMA_SINCE_V1 = '1.4.223'
/** First release that reads manifest v2, the v2 catalog and the fields that arrived with them:
 *  the release after the latest tag when v2 landed. A test fails once a tag at or above it
 *  ships without v2, so the release that does ship v2 bumps this once if needed. */
export const PLUGIN_MANIFEST_V2_SINCE = '1.4.232'

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
