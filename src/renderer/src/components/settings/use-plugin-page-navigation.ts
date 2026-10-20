import { useCallback, useEffect, useRef, useState } from 'react'

function isBackShortcut(event: KeyboardEvent): boolean {
  const mac = navigator.userAgent.includes('Mac')
  return (
    (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'ArrowLeft') ||
    (mac && event.metaKey && !event.altKey && event.key === '[')
  )
}

/**
 * Which plugin's page is open, and the way back: the back link, Alt+← or ⌘[ on Mac. Going back
 * returns focus to that plugin's name in the list. Esc stays with Settings.
 */
export function usePluginPageNavigation(): {
  openKey: string | null
  open: (pluginKey: string) => void
  back: () => void
} {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [returnKey, setReturnKey] = useState<string | null>(null)

  useEffect(() => {
    if (!openKey) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isBackShortcut(event)) {
        event.preventDefault()
        setReturnKey(openKey)
        setOpenKey(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openKey])

  useEffect(() => {
    if (openKey || !returnKey) {
      return
    }
    const name = document.querySelector<HTMLButtonElement>(
      `[data-plugin-key="${CSS.escape(returnKey)}"] [data-plugin-row-name]`
    )
    name?.focus()
    setReturnKey(null)
  }, [openKey, returnKey])

  const openKeyRef = useRef(openKey)
  openKeyRef.current = openKey
  const back = useCallback(() => {
    setReturnKey(openKeyRef.current)
    setOpenKey(null)
  }, [])
  return { openKey, open: setOpenKey, back }
}

/** This Orca's version, for "Needs Orca X" checks; null until known. */
export function useOrcaVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let stale = false
    void window.api.updater
      .getVersion()
      .then((value) => {
        if (!stale) {
          setVersion(value)
        }
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [])
  return version
}
