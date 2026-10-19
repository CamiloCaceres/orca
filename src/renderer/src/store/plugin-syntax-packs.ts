import {
  isPluginSyntaxMetadata,
  type PluginSyntaxMetadata
} from '../../../shared/plugins/plugin-syntax-artifact'
import { createPluginContentListStore } from './plugin-content-list-store'

const syntaxes = createPluginContentListStore<PluginSyntaxMetadata>({
  kind: 'syntaxes',
  list: (api) => api.listSyntaxes,
  isEntry: isPluginSyntaxMetadata
})

export const usePluginSyntaxStore = syntaxes.useStore
export const usePluginSyntaxes = syntaxes.useEntries

/** The plugin syntax for a file: an exact file name wins, then the longest extension. */
export function matchPluginSyntax(
  entries: readonly PluginSyntaxMetadata[],
  filePath: string
): PluginSyntaxMetadata | null {
  const name = (filePath.split(/[\\/]/).at(-1) ?? '').toLowerCase()
  const byName = entries.find((entry) => entry.filenames.includes(name))
  if (byName) {
    return byName
  }
  let best: PluginSyntaxMetadata | null = null
  let bestLength = 0
  for (const entry of entries) {
    for (const extension of entry.extensions) {
      if (
        name.endsWith(extension) &&
        name.length > extension.length &&
        extension.length > bestLength
      ) {
        best = entry
        bestLength = extension.length
      }
    }
  }
  return best
}
