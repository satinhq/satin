import type { ScrollAxis, ScrollOffset, ScrollSnapshot } from './types.ts'

export type ScrollSurfaceNode = Pick<HTMLDivElement, 'scrollLeft' | 'scrollTo' | 'scrollTop'> &
  Partial<Pick<HTMLDivElement, 'scrollWidth' | 'scrollHeight' | 'clientWidth' | 'clientHeight'>>

export type ScrollSurfaceRegistration = Readonly<{
  axis: ScrollAxis
  element: ScrollSurfaceNode
  id: string
  initialOffset?: () => ScrollOffset
  onRestore?: () => void
  /** `true` claims the screen; `'automatic'` is a candidate (the first in document order wins). */
  primary: boolean | 'automatic'
}>

export type ScrollRestorationResult = Readonly<{
  id: string
  live: ScrollOffset
  matches: boolean
  snapshot: ScrollOffset
}>

export interface ScrollSurfaceRegistry {
  subscribe(listener: () => void): () => void
  cancelRestoration(id: string): void
  capture(options?: Readonly<{ preservePending?: boolean }>): ScrollSnapshot
  get(id: string): ScrollSurfaceRegistration | undefined
  getPrimary(): ScrollSurfaceRegistration | undefined
  register(registration: ScrollSurfaceRegistration): () => void
  reset(): void
  restore(
    snapshot: ScrollSnapshot,
    options?: Readonly<{ warnOnMismatch?: boolean }>,
  ): readonly ScrollRestorationResult[]
  setUncovered(uncovered: boolean): void
}

export type CreateScrollSurfaceRegistryOptions = Readonly<{
  development?: boolean
  screenKey?: string
}>

export function readScrollOffset(element: ScrollSurfaceNode): ScrollOffset {
  return Object.freeze({ x: element.scrollLeft, y: element.scrollTop })
}

function documentOrder(left: ScrollSurfaceNode, right: ScrollSurfaceNode) {
  if (typeof Node === 'undefined' || !(left instanceof Node) || !(right instanceof Node)) return 0
  return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

function offsetsMatch(left: ScrollOffset, right: ScrollOffset) {
  return Math.abs(left.x - right.x) <= 0.5 && Math.abs(left.y - right.y) <= 0.5
}

export function createScrollSurfaceRegistry(
  options: CreateScrollSurfaceRegistryOptions = {},
): ScrollSurfaceRegistry {
  const development = options.development ?? import.meta.env.DEV
  const listeners = new Set<() => void>()
  const registrations = new Map<string, ScrollSurfaceRegistration>()
  let pendingSnapshot: Map<string, ScrollOffset> | undefined
  const waiting = new Map<string, () => void>()
  const stopWaiting = (id: string) => {
    waiting.get(id)?.()
    waiting.delete(id)
  }
  const cancelRestoration = (id: string) => {
    const cancelled = pendingSnapshot?.delete(id)
    stopWaiting(id)
    if (cancelled) for (const listener of listeners) listener()
  }
  let pendingWarnOnMismatch = false
  let primaryId: string | undefined
  let uncovered = false
  // An explicit primary wins; otherwise the first automatic candidate in document order. Each
  // surface learns the result through its data attribute and the registry's listeners.
  const electPrimary = () => {
    const candidates = [...registrations.values()]
    const explicit = candidates.find(entry => entry.primary === true)
    const automatic = candidates
      .filter(entry => entry.primary === 'automatic')
      .sort((left, right) => documentOrder(left.element, right.element))
    const elected = (explicit ?? automatic[0])?.id
    if (elected === primaryId) return
    primaryId = elected
    for (const entry of candidates) {
      const element = entry.element as Partial<HTMLElement>
      if (element.dataset) element.dataset.satinPrimary = String(entry.id === primaryId)
    }
    for (const listener of listeners) listener()
  }

  const rejectRegistration = (message: string, registration: ScrollSurfaceRegistration) => {
    if (development) throw new Error(message)
    console.error(`[Satin fidelity: invalid-scroll-registration] ${message}`, {
      registration,
      screenKey: options.screenKey,
    })
    return () => undefined
  }

  const restoreRegistration = (
    registration: ScrollSurfaceRegistration,
    snapshotOffset: ScrollOffset,
    warnOnMismatch: boolean,
  ) => {
    const live = readScrollOffset(registration.element)
    const matches = offsetsMatch(live, snapshotOffset)
    const result = Object.freeze({
      id: registration.id,
      live,
      matches,
      snapshot: snapshotOffset,
    })

    if (warnOnMismatch && !matches) {
      console.warn(
        `[Satin fidelity: scroll-snapshot-mismatch] ScrollSurface "${registration.id}" ` +
          `in screen entry "${options.screenKey ?? 'unknown'}" had live offset ` +
          `(${live.x}, ${live.y}) but its snapshot was ` +
          `(${snapshotOffset.x}, ${snapshotOffset.y}) on uncover. ` +
          'Satin restored the framework-owned snapshot before paint.',
        { id: registration.id, live, snapshot: snapshotOffset },
      )
    }

    registration.element.scrollTo({
      behavior: 'auto',
      left: snapshotOffset.x,
      top: snapshotOffset.y,
    })
    registration.onRestore?.()
    return result
  }

  const attemptRestore = (registration: ScrollSurfaceRegistration) => {
    const target = pendingSnapshot?.get(registration.id)
    if (!target) return
    const element = registration.element
    // Do not clamp a saved offset into an empty or partially loaded list. Keep
    // the original target durable while content arrives, even across another kill.
    const maxX =
      element.scrollWidth === undefined || element.clientWidth === undefined
        ? Infinity
        : Math.max(0, element.scrollWidth - element.clientWidth)
    const maxY =
      element.scrollHeight === undefined || element.clientHeight === undefined
        ? Infinity
        : Math.max(0, element.scrollHeight - element.clientHeight)
    if (target.x > maxX + 0.5 || target.y > maxY + 0.5) return
    const result = restoreRegistration(registration, target, pendingWarnOnMismatch)
    if (offsetsMatch(readScrollOffset(element), target)) cancelRestoration(registration.id)
    return result
  }
  const awaitContent = (registration: ScrollSurfaceRegistration) => {
    if (!pendingSnapshot?.has(registration.id) || waiting.has(registration.id)) return
    const element = registration.element as HTMLElement
    if (typeof element.addEventListener !== 'function') return
    const retry = () => {
      attemptRestore(registration)
    }
    const userIntent = () => {
      cancelRestoration(registration.id)
    }
    // Observe only while an offset is waiting. Direct children cover ordinary
    // lists and virtual-list spacers without one observer per descendant.
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(retry)
    const observeChildren = () => {
      resize?.disconnect()
      resize?.observe(element)
      for (const child of element.children) resize?.observe(child)
    }
    const mutation =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(() => {
            retry()
            if (pendingSnapshot?.has(registration.id)) observeChildren()
          })
    observeChildren()
    mutation?.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'src'],
    })
    element.addEventListener('load', retry, true)
    for (const event of ['pointerdown', 'wheel', 'keydown'])
      element.addEventListener(event, userIntent, { passive: true })
    waiting.set(registration.id, () => {
      resize?.disconnect()
      mutation?.disconnect()
      element.removeEventListener('load', retry, true)
      for (const event of ['pointerdown', 'wheel', 'keydown'])
        element.removeEventListener(event, userIntent)
    })
  }

  return {
    cancelRestoration,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    capture(captureOptions = {}) {
      // Persistence observes partially mounted screens without consuming the
      // offsets that a late registering surface still needs before paint.
      if (captureOptions.preservePending)
        return new Map([
          ...Array.from(
            registrations,
            ([id, registration]) => [id, readScrollOffset(registration.element)] as const,
          ),
          ...(pendingSnapshot ?? []),
        ])
      const unregistered = [...(pendingSnapshot?.keys() ?? [])].filter(id => !registrations.has(id))
      if (development && unregistered.length > 0) {
        console.warn(
          `[Satin fidelity: unconsumed-scroll-snapshot] Screen entry ` +
            `"${options.screenKey ?? 'unknown'}" was captured with pending snapshot ` +
            `entries for: ${unregistered.join(', ')}. ` +
            'Those surfaces did not register while the screen was uncovered; the new capture replaces the pending snapshot.',
          {
            pendingIds: unregistered,
            screenKey: options.screenKey,
          },
        )
      }
      for (const id of unregistered) pendingSnapshot?.delete(id)

      return new Map(
        Array.from(registrations, ([id, registration]) => [
          id,
          pendingSnapshot?.get(id) ?? readScrollOffset(registration.element),
        ]),
      )
    },
    get(id) {
      return registrations.get(id)
    },
    getPrimary() {
      return primaryId ? registrations.get(primaryId) : undefined
    },
    register(registration) {
      if (registration.id.trim().length === 0) {
        return rejectRegistration(
          'A Satin ScrollSurface id must be a non-empty string.',
          registration,
        )
      }

      const existing = registrations.get(registration.id)
      if (existing) {
        return rejectRegistration(
          `Satin ScrollSurface id "${registration.id}" is already registered` +
            `${options.screenKey ? ` in screen entry "${options.screenKey}"` : ''}. ` +
            'Surface ids must be stable and unique within a screen.',
          registration,
        )
      }

      if (
        registration.primary === true &&
        primaryId &&
        registrations.get(primaryId)?.primary === true
      ) {
        return rejectRegistration(
          `Satin screen entry${options.screenKey ? ` "${options.screenKey}"` : ''} ` +
            `already has primary ScrollSurface "${primaryId}".`,
          registration,
        )
      }

      const element = registration.element as Partial<HTMLElement>
      const changed = () => {
        for (const listener of listeners) listener()
      }
      element.addEventListener?.('scroll', changed, { passive: true })
      registrations.set(registration.id, registration)
      electPrimary()
      const pendingOffset = pendingSnapshot?.get(registration.id)
      if (uncovered && pendingOffset) {
        attemptRestore(registration)
        awaitContent(registration)
      }

      return () => {
        if (registrations.get(registration.id) !== registration) return
        stopWaiting(registration.id)
        element.removeEventListener?.('scroll', changed)
        registrations.delete(registration.id)
        electPrimary()
      }
    },
    reset() {
      for (const id of waiting.keys()) stopWaiting(id)
      pendingSnapshot = undefined
      pendingWarnOnMismatch = false
      for (const registration of registrations.values()) {
        const initial = registration.initialOffset?.() ?? { x: 0, y: 0 }
        registration.element.scrollTo({ behavior: 'auto', left: initial.x, top: initial.y })
        registration.onRestore?.()
      }
    },
    restore(snapshot, restoreOptions = {}) {
      const results: ScrollRestorationResult[] = []
      for (const id of waiting.keys()) stopWaiting(id)
      pendingSnapshot = new Map(snapshot)
      pendingWarnOnMismatch = Boolean(restoreOptions.warnOnMismatch)

      for (const [id] of snapshot) {
        const registration = registrations.get(id)
        if (!registration) continue
        const result = attemptRestore(registration)
        if (result) results.push(result)
        awaitContent(registration)
      }

      return results
    },
    setUncovered(nextUncovered) {
      uncovered = nextUncovered
    },
  }
}
