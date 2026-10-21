import React, { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { RemovalUnsavedFilesNotice } from './RemovalUnsavedFilesNotice'
import { useRemovalUnsavedFiles } from './use-removal-unsaved-files'
import { getUnsavedRemovalRequest, settleUnsavedRemovalRequest } from './unsaved-removal-confirm'

const NO_TARGETS: [] = []

/** Confirm for removals that had none, shown only when they would close unsaved editor files. */
const ConfirmUnsavedRemovalDialog = React.memo(function ConfirmUnsavedRemovalDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const requestId = useAppStore((s) => s.modalData.requestId)
  const closeModal = useAppStore((s) => s.closeModal)
  const isOpen = activeModal === 'confirm-unsaved-removal'
  const request = getUnsavedRemovalRequest(requestId)
  const unsavedEdits = useRemovalUnsavedFiles(request?.targets ?? NO_TARGETS, isOpen && !!request)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => () => settleUnsavedRemovalRequest(requestId), [requestId])

  const handleOpenChange = (open: boolean): void => {
    // Why: closing mid-save would leave a save writing into a workspace about to go.
    if (!open && !unsavedEdits.isSaving) {
      closeModal()
    }
  }

  const handleConfirm = (): void => {
    closeModal()
    request?.run({ unsavedEditsConfirmed: true })
  }

  return (
    <Dialog open={isOpen && !!request} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          // Why: this prompt exists to stop an accidental loss, so it never starts on the destructive action.
          event.preventDefault()
          cancelButtonRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <RemovalUnsavedFilesNotice
          files={unsavedEdits.files}
          isSaving={unsavedEdits.isSaving}
          onSave={unsavedEdits.saveSurviving}
        />
        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={unsavedEdits.isSaving}
          >
            {translate('components.workspace.delete.unsavedEdits.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={unsavedEdits.isSaving}>
            <Trash2 />
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default ConfirmUnsavedRemovalDialog
