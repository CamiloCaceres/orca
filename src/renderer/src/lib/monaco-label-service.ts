import type { URI } from 'monaco-editor/esm/vs/base/common/uri.js'
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js'
import { ILabelService } from 'monaco-editor/esm/vs/platform/label/common/label.js'
import { withoutEditorModelOwner } from '@/components/editor/editor-model-uri'

/** Standalone Monaco's label behaviour, minus the owner folder in remote model URIs. */
export const orcaMonacoLabelService = {
  getUriLabel(resource: URI): string {
    const uri = withoutEditorModelOwner(resource)
    return uri.scheme === 'file' ? uri.fsPath : uri.path
  },
  getUriBasenameLabel(resource: URI): string {
    return withoutEditorModelOwner(resource).path.split('/').findLast(Boolean) ?? ''
  }
}

/**
 * Must run before anything resolves a Monaco service: standalone Monaco applies only the first
 * initialization's overrides. Returns false when an earlier caller already initialized it.
 */
export function initializeMonacoServices(): boolean {
  StandaloneServices.initialize({ [ILabelService.toString()]: orcaMonacoLabelService })
  return StandaloneServices.get(ILabelService) === orcaMonacoLabelService
}
