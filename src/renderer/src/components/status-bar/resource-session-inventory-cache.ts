import type { DaemonSessionInventory } from './resource-session-inventory'
import type { PtyListedSession, PtySessionLifecycle } from '../../../../shared/pty-listed-session'
import { isResourceViewInactive } from '../../../../shared/resource-view-admission'
import { isProvenProcessExit } from '../../../../shared/terminal-exit-cause'
import { EMPTY_DAEMON_SESSION_INVENTORY, inventoryFromSessions } from './resource-session-inventory'

export function resourceSessionIdentity(session: { id: string; incarnationId?: string }): string {
  return JSON.stringify([session.id, session.incarnationId ?? null])
}

const COOLDOWN_MS = 100

/** One request survives view epochs, but only its dispatching epoch may publish it. */
export class ResourceSessionInventoryCache {
  private state: {
    sessionInventory: DaemonSessionInventory
    sessionsError: boolean
    observedAt: number | null
    loading: boolean
  } = {
    sessionInventory: EMPTY_DAEMON_SESSION_INVENTORY,
    sessionsError: false,
    observedAt: null,
    loading: false
  }
  private listeners = new Set<() => void>()
  private known = new Map<string, PtyListedSession>()
  // Suppression belongs only to the current listing, never to later authoritative results.
  private tombstones = new Set<string>()
  private epoch = 0
  private active = false
  private pendingRefresh = false
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastStarted = -Infinity

  constructor(
    private list: () => Promise<PtyListedSession[]>,
    private localOnly: boolean
  ) {}

  getSnapshot = () => this.state
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<typeof this.state>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      listener()
    }
  }

  setActive(active: boolean): void {
    if (active === this.active) {
      return
    }
    this.active = active
    this.epoch++
    this.pendingRefresh = false
    if (!active) {
      if (this.timer) {
        clearTimeout(this.timer)
      }
      this.timer = null
      if (this.state.loading) {
        this.publish({ loading: false })
      }
      return
    }
    void this.refresh()
  }

  invalidate = (): void => {
    if (this.active) {
      void this.refresh()
    }
  }

  clearError = (): void => {
    if (this.state.sessionsError) {
      this.publish({ sessionsError: false })
    }
  }

  refresh = (): Promise<void> => {
    if (!this.active) {
      return Promise.resolve()
    }
    if (this.inFlight) {
      this.pendingRefresh = true
      return this.inFlight
    }
    if (this.timer) {
      return Promise.resolve()
    }
    const remaining = this.lastStarted + COOLDOWN_MS - Date.now()
    if (remaining > 0) {
      this.timer = setTimeout(() => {
        this.timer = null
        void this.refresh()
      }, remaining)
      return Promise.resolve()
    }
    const epoch = this.epoch
    this.lastStarted = Date.now()
    const request = Promise.resolve()
      .then(() => {
        if (!this.active || epoch !== this.epoch) {
          return null
        }
        return this.list()
      })
      .then((sessions) => {
        if (!sessions || !this.active || epoch !== this.epoch) {
          return
        }
        const deduped = new Map<string, PtyListedSession>()
        for (const session of sessions) {
          if (this.tombstones.has(resourceSessionIdentity(session))) {
            continue
          }
          deduped.set(session.id, session)
        }
        this.known = deduped
        this.publish({
          sessionInventory: inventoryFromSessions([...deduped.values()]),
          sessionsError: false,
          observedAt: Date.now()
        })
      })
      .catch((error: unknown) => {
        if (this.active && epoch === this.epoch && !isResourceViewInactive(error)) {
          this.publish({ sessionsError: true })
        }
      })
      .finally(() => {
        this.tombstones.clear()
        this.inFlight = null
        if (this.active && epoch === this.epoch) {
          this.publish({ loading: false })
        }
        if (this.active && this.pendingRefresh) {
          this.pendingRefresh = false
          void this.refresh()
        }
      })
    this.inFlight = request
    this.publish({ loading: true })
    return request
  }

  spawned(event: PtySessionLifecycle): void {
    if (this.localOnly && event.hostId !== 'local') {
      return
    }
    const known = this.known.get(event.id)
    if (!known || known.incarnationId !== event.incarnationId) {
      this.invalidate()
    }
  }

  exited(event: PtySessionLifecycle & { code: number; ptySourceDisowned?: true }): void {
    if (this.localOnly && event.hostId !== 'local') {
      return
    }
    if (event.ptySourceDisowned || !isProvenProcessExit(event.code)) {
      return
    }
    this.remove(event.id, event.incarnationId)
  }

  private removeIdentity(id: string, incarnationId?: string): boolean {
    const known = this.known.get(id)
    if (!incarnationId && known?.incarnationId) {
      return false
    }
    if (this.inFlight) {
      this.tombstones.add(resourceSessionIdentity({ id, incarnationId }))
    }
    if (known?.incarnationId !== incarnationId) {
      return false
    }
    return this.known.delete(id)
  }

  remove(id: string, incarnationId?: string): void {
    if (!this.removeIdentity(id, incarnationId)) {
      return
    }
    this.publish({ sessionInventory: inventoryFromSessions([...this.known.values()]) })
  }

  removeMany(sessions: readonly Pick<PtyListedSession, 'id' | 'incarnationId'>[]): void {
    let changed = false
    for (const session of sessions) {
      changed = this.removeIdentity(session.id, session.incarnationId) || changed
    }
    if (changed) {
      this.publish({ sessionInventory: inventoryFromSessions([...this.known.values()]) })
    }
  }
}
