import type { JSX } from 'react'
import { AlertTriangle, LoaderCircle, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { OpenFile } from '@/store/slices/editor'
import type { RemovalUnsavedFiles } from '@/components/editor/removal-unsaved-editor-files'
import {
  discardedUnsavedFilesLabel,
  moreUnsavedFilesLabel,
  saveUnsavedFilesLabel,
  survivingUnsavedFilesLabel
} from './removal-unsaved-files-copy'

const MAX_LISTED_FILES = 5

function UnsavedFileList({ files }: { files: readonly OpenFile[] }): JSX.Element {
  const listed = files.slice(0, MAX_LISTED_FILES)
  const hidden = files.length - listed.length
  return (
    <ul className="mt-1 min-w-0 space-y-0.5">
      {listed.map((file) => (
        <li key={file.id} className="truncate text-foreground" title={file.filePath}>
          {file.relativePath || file.filePath}
        </li>
      ))}
      {hidden > 0 && <li>{moreUnsavedFilesLabel(hidden)}</li>}
    </ul>
  )
}

/** Lists editor files a removal would close with unsaved edits; files that stay on disk can be saved. */
export function RemovalUnsavedFilesNotice({
  files,
  isSaving,
  onSave
}: {
  files: RemovalUnsavedFiles
  isSaving: boolean
  onSave: () => void
}): JSX.Element | null {
  const { discarded, surviving } = files
  if (discarded.length === 0 && surviving.length === 0) {
    return null
  }
  return (
    <div className="rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          {discarded.length > 0 && (
            <div className="min-w-0">
              {discardedUnsavedFilesLabel(discarded.length)}
              <UnsavedFileList files={discarded} />
            </div>
          )}
          {surviving.length > 0 && (
            <div className="min-w-0">
              {survivingUnsavedFilesLabel(surviving.length)}
              <UnsavedFileList files={surviving} />
              <Button
                variant="outline"
                size="xs"
                className="mt-2"
                onClick={onSave}
                disabled={isSaving}
                aria-busy={isSaving}
              >
                {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
                {saveUnsavedFilesLabel(surviving.length)}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
