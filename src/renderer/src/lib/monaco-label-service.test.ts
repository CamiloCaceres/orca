// @vitest-environment happy-dom
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import { ModelBasedVariableResolver } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetVariables.js'
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js'
import { ILabelService } from 'monaco-editor/esm/vs/platform/label/common/label.js'
import { describe, expect, it } from 'vitest'
import { toEditorModelUri } from '@/components/editor/editor-model-uri'
import { initializeMonacoServices, orcaMonacoLabelService } from './monaco-label-service'

const OWNER = '["hub-a","ssh:target"]'

function label(filePath: string, owner = OWNER) {
  const uri = monaco.Uri.parse(toEditorModelUri(filePath, owner))
  const parent = uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf('/')) })
  return {
    full: orcaMonacoLabelService.getUriLabel(uri),
    base: orcaMonacoLabelService.getUriBasenameLabel(uri),
    // The peek widget titles a reference with its folder's label.
    folder: orcaMonacoLabelService.getUriLabel(parent)
  }
}

describe('Orca label service for Monaco', () => {
  it('replaces the standalone label service when it initializes first', () => {
    expect(initializeMonacoServices()).toBe(true)
    expect(StandaloneServices.get(ILabelService)).toBe(orcaMonacoLabelService)
    // A later initialization keeps the first one's overrides.
    expect(initializeMonacoServices()).toBe(true)
  })

  it.each([
    ['a local file', '/repo/src/a.ts', ''],
    ['a remote file', '/repo/src/a.ts', OWNER]
  ])('labels %s with its real path', (_name, filePath, owner) => {
    expect(label(filePath, owner)).toEqual({
      full: monaco.Uri.file('/repo/src/a.ts').fsPath,
      base: 'a.ts',
      folder: monaco.Uri.file('/repo/src').fsPath
    })
  })

  it.each(['C:\\repo\\src\\a.ts', 'c:/repo/src/a.ts', '/home/me/.orca-owner/a.ts'])(
    'labels the remote %s exactly as the same local path',
    (filePath) => {
      const remote = label(filePath)
      expect(remote).toEqual(label(filePath, ''))
      expect(JSON.stringify(remote)).not.toMatch(/orca-owner\/[0-9a-f]{16}/)
    }
  )

  it('labels the folder of a remote file at the host root', () => {
    expect(label('/a.ts')).toEqual({
      full: monaco.Uri.file('/a.ts').fsPath,
      base: 'a.ts',
      folder: '/'
    })
  })

  it('fills snippet path variables with the real path', () => {
    initializeMonacoServices()
    const model = monaco.editor.createModel(
      '',
      'plaintext',
      monaco.Uri.parse(toEditorModelUri('/repo/src/a.ts', OWNER))
    )
    try {
      const resolver = new ModelBasedVariableResolver(StandaloneServices.get(ILabelService), model)
      expect(
        ['TM_FILEPATH', 'TM_DIRECTORY', 'TM_FILENAME'].map((name) => resolver.resolve({ name }))
      ).toEqual([
        monaco.Uri.file('/repo/src/a.ts').fsPath,
        monaco.Uri.file('/repo/src').fsPath,
        'a.ts'
      ])
    } finally {
      model.dispose()
    }
  })
})
