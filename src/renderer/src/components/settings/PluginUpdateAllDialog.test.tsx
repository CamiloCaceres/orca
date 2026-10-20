// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PluginHostListEntry,
  PluginMarketplaceHostInstallPreview
} from '../../../../preload/api-types'
import type { PluginListEntry } from '../plugin-catalog/plugin-list-entries'
import { PluginUpdateAllDialog, newAccess } from './PluginUpdateAllDialog'

vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>
}))

function installed(pluginKey: string, kinds: string[]): PluginHostListEntry {
  return {
    pluginKey,
    consentFingerprint: null,
    name: pluginKey,
    version: '1.0.0',
    publisher: 'acme',
    status: 'idle',
    needsReconsent: false,
    isDev: false,
    official: false,
    bundled: false,
    capabilities: kinds.map((kind) => ({ kind, description: kind })),
    panels: [],
    commands: [],
    hasWorker: false,
    restarts: 0
  }
}

function entry(pluginKey: string, kinds: string[]): PluginListEntry {
  const plugin = installed(pluginKey, kinds)
  return {
    pluginKey,
    name: pluginKey,
    publisher: 'acme',
    version: '1.0.0',
    description: null,
    official: false,
    categories: [],
    types: [],
    minimumOrca: null,
    updateVersion: '1.1.0',
    installed: plugin,
    listing: null
  }
}

function preview(pluginKey: string, kinds: string[]): PluginMarketplaceHostInstallPreview {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: partial fixture of a wide wire type; the dialog reads only the fields set here.
  return {
    marketplaceSourceId: 'official',
    marketplaceCommit: 'c',
    pluginKey,
    resolvedCommit: 'r',
    contentHash: 'h',
    manifest: { version: '1.1.0', capabilities: kinds.map((kind) => ({ kind })) }
  } as unknown as PluginMarketplaceHostInstallPreview
}

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('PluginUpdateAllDialog', () => {
  it('names only access the installed version lacks', () => {
    expect(newAccess(entry('a', ['storage']), preview('a', ['storage', 'secrets']))).toEqual([
      'secrets'
    ])
  })

  it('reviews every update in one dialog and installs only the ticked ones', async () => {
    const installMarketplacePlugin = vi.fn().mockResolvedValue({ ok: true, pluginKey: 'b' })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        plugins: {
          previewMarketplaceUpdate: vi.fn(({ pluginKey }: { pluginKey: string }) =>
            Promise.resolve(preview(pluginKey, pluginKey === 'a' ? ['secrets'] : []))
          ),
          installMarketplacePlugin
        }
      }
    })
    const onUpdated = vi.fn().mockResolvedValue(undefined)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <PluginUpdateAllDialog
          open
          entries={[entry('a', []), entry('b', [])]}
          onClose={vi.fn()}
          onUpdated={onUpdated}
        />
      )
    })
    expect(container.textContent).toContain('Updates that ask for new access are expanded below.')
    expect(container.textContent).toContain('New access:')

    const first = container.querySelector<HTMLButtonElement>('#plugin-update-a')
    await act(async () => first?.click())
    const confirm = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Update 1 plugin'
    )
    await act(async () => confirm?.click())

    expect(installMarketplacePlugin).toHaveBeenCalledTimes(1)
    expect(installMarketplacePlugin).toHaveBeenCalledWith(
      expect.objectContaining({ pluginKey: 'b' })
    )
    expect(onUpdated).toHaveBeenCalledWith(['b'])
  })
})
