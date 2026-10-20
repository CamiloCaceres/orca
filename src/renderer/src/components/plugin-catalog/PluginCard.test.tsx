// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { PluginCard } from './PluginCard'
import type { PluginListEntry } from './plugin-list-entries'

const entry: PluginListEntry = {
  pluginKey: 'acme.dusk',
  name: 'Dusk',
  publisher: 'acme',
  version: '1.0.0',
  description: 'A violet theme.',
  official: false,
  categories: ['themes'],
  types: ['app-theme'],
  minimumOrca: null,
  updateVersion: null,
  catalogIds: [],
  updatable: false,
  installed: null,
  listing: null
}

describe('PluginCard', () => {
  it('has two sibling tab stops, a stretched name link and the action, nothing nested', () => {
    const container = document.createElement('ul')
    const onOpen = vi.fn()
    const onInstall = vi.fn()
    act(() =>
      createRoot(container).render(
        <PluginCard
          entry={entry}
          palettes={[]}
          onOpen={onOpen}
          action={<button onClick={onInstall}>Install</button>}
        />
      )
    )
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map((button) => button.textContent)).toEqual(['Dusk', 'Install'])
    expect(buttons.some((button) => button.querySelector('button, a'))).toBe(false)
    expect(container.querySelector('[aria-hidden="true"]')?.querySelector('button')).toBeNull()

    act(() => buttons[0]?.click())
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onInstall).not.toHaveBeenCalled()
  })
})
