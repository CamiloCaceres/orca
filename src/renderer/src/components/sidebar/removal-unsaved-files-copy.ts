import { translate } from '@/i18n/i18n'

export function discardedUnsavedFilesLabel(count: number): string {
  return count === 1
    ? translate(
        'components.workspace.delete.unsavedEdits.discarded_one',
        'Deleting discards unsaved edits in {{count}} file:',
        { count }
      )
    : translate(
        'components.workspace.delete.unsavedEdits.discarded_other',
        'Deleting discards unsaved edits in {{count}} files:',
        { count }
      )
}

export function survivingUnsavedFilesLabel(count: number): string {
  return count === 1
    ? translate(
        'components.workspace.delete.unsavedEdits.surviving_one',
        'Unsaved edits in {{count}} file are discarded unless you save it first:',
        { count }
      )
    : translate(
        'components.workspace.delete.unsavedEdits.surviving_other',
        'Unsaved edits in {{count}} files are discarded unless you save them first:',
        { count }
      )
}

export function saveUnsavedFilesLabel(count: number): string {
  return count === 1
    ? translate('components.workspace.delete.unsavedEdits.saveFiles_one', 'Save {{count}} File', {
        count
      })
    : translate(
        'components.workspace.delete.unsavedEdits.saveFiles_other',
        'Save {{count}} Files',
        {
          count
        }
      )
}

export function closedUnsavedFilesToastTitle(count: number, workspace: string): string {
  return count === 1
    ? translate(
        'components.workspace.delete.unsavedEdits.closedToast_one',
        'Closed {{count}} file with unsaved edits from {{workspace}}',
        { count, workspace }
      )
    : translate(
        'components.workspace.delete.unsavedEdits.closedToast_other',
        'Closed {{count}} files with unsaved edits from {{workspace}}',
        { count, workspace }
      )
}

export function reopenUnsavedFilesLabel(): string {
  return translate('components.workspace.delete.unsavedEdits.reopen', 'Reopen')
}

export function reopenUnsavedFilesFailedLabel(): string {
  return translate(
    'components.workspace.delete.unsavedEdits.reopenFailed',
    "Some files couldn't be reopened because no workspace on their host is open."
  )
}

export function moreUnsavedFilesLabel(count: number): string {
  return translate('components.workspace.delete.unsavedEdits.moreFiles', 'and {{value}} more', {
    value: count
  })
}
