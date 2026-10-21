import { URI } from 'monaco-editor/esm/vs/base/common/uri.js'

const FILE_SCHEME = /^file:/i
const OWNER_PREFIX = '/.orca-owner/'
const OWNER_FOLDER = /^\/\.orca-owner\/[0-9a-f]{16}(?=\/)/
// Also matches the bare owner folder: the parent of a file at the host's root.
const OWNER_FOLDER_LABEL = /^\/\.orca-owner\/[0-9a-f]{16}(?=\/|$)/

/** Two FNV-1a lanes: a short, stable folder name per owner, so different owners don't collide. */
function ownerSegment(ownerKey: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let index = 0; index < ownerKey.length; index += 1) {
    const code = ownerKey.charCodeAt(index)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/**
 * The single filesystem-path -> Monaco model key function. Monaco keys its model registry by
 * `uri.toString()`, so creation, lookup and ownership comparison must all go through this.
 *
 * Why not `Uri.parse`: it reads `C:\src\a.ts` as scheme `c`, which fails the scheme gate in
 * `modelService._schemaShouldMaintainUndoRedoElements`, so closed-file undo is dropped for every
 * file on Windows. `Uri.file` always yields the `file:` scheme that gate allows, and the result
 * re-parses to itself, so a consumer that can only take a string (the `path` prop of
 * `@monaco-editor/react`, which calls `Uri.parse` internally) lands on the same key.
 */
export function toEditorModelUri(filePath: string, ownerKey = ''): string {
  const parsed = FILE_SCHEME.test(filePath) ? URI.parse(filePath) : URI.file(filePath)
  const base = URI.file(parsed.fsPath)
  if (!ownerKey) {
    // An existing model key passes through unchanged: its owner folder is part of its path.
    return base.with({ fragment: parsed.fragment }).toString()
  }
  // Equal paths on different owners must not share text or undo history. Why a leading folder,
  // not a fragment: Monaco's TypeScript service names files by the URI, so the file name must stay
  // last (its extension picks TSX) and one owner's files must sit in one tree for imports to resolve.
  // The re-parse applies `toString`'s drive-letter fold, which only acts on a leading drive.
  const path = URI.parse(base.toString()).path.replace(OWNER_FOLDER, '')
  return base.with({ path: `${OWNER_PREFIX}${ownerSegment(ownerKey)}${path}` }).toString()
}

/** The model URI with its owner folder removed: the host's real path, for display only. */
export function withoutEditorModelOwner(uri: URI): URI {
  if (uri.scheme !== 'file' || !OWNER_FOLDER_LABEL.test(uri.path)) {
    return uri
  }
  return uri.with({ path: uri.path.replace(OWNER_FOLDER_LABEL, '') || '/' })
}
