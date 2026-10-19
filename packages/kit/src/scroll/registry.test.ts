import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScrollSurfaceRegistry, type ScrollSurfaceNode } from './registry.ts'

function node(x = 0, y = 0) {
  const element: ScrollSurfaceNode = {
    scrollLeft: x,
    scrollTop: y,
    scrollTo: vi.fn((options?: ScrollToOptions | number, yValue?: number) => {
      if (typeof options === 'number') {
        element.scrollLeft = options
        element.scrollTop = yValue ?? element.scrollTop
        return
      }
      if (typeof options?.left === 'number') element.scrollLeft = options.left
      if (typeof options?.top === 'number') element.scrollTop = options.top
    }),
  }
  return element
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ScrollSurface registry', () => {
  it('captures every registered surface and releases ownership on unmount', () => {
    const registry = createScrollSurfaceRegistry({
      development: true,
      screenKey: 'screen-a-0',
    })
    const vertical = node(0, 318)
    const horizontal = node(144, 0)
    const unregisterVertical = registry.register({
      axis: 'vertical',
      element: vertical,
      id: 'feed',
      primary: true,
    })
    registry.register({
      axis: 'horizontal',
      element: horizontal,
      id: 'rail',
      primary: false,
    })

    expect(registry.getPrimary()?.id).toBe('feed')
    expect(Array.from(registry.capture())).toEqual([
      ['feed', { x: 0, y: 318 }],
      ['rail', { x: 144, y: 0 }],
    ])

    unregisterVertical()
    expect(registry.get('feed')).toBeUndefined()
    expect(registry.getPrimary()).toBeUndefined()
  })

  it('throws development errors for duplicate ids and primary designations', () => {
    const registry = createScrollSurfaceRegistry({
      development: true,
      screenKey: 'screen-a-0',
    })
    registry.register({
      axis: 'vertical',
      element: node(),
      id: 'feed',
      primary: true,
    })

    expect(() =>
      registry.register({
        axis: 'vertical',
        element: node(),
        id: 'feed',
        primary: false,
      }),
    ).toThrow('already registered in screen entry "screen-a-0"')
    expect(() =>
      registry.register({
        axis: 'vertical',
        element: node(),
        id: 'other',
        primary: true,
      }),
    ).toThrow('already has primary ScrollSurface "feed"')
    expect(() =>
      registry.register({
        axis: 'vertical',
        element: node(),
        id: '   ',
        primary: false,
      }),
    ).toThrow('must be a non-empty string')
  })

  it('logs and ignores every invalid registration in production', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const registry = createScrollSurfaceRegistry({
      development: false,
      screenKey: 'screen-a-0',
    })
    registry.register({
      axis: 'vertical',
      element: node(),
      id: ' ',
      primary: false,
    })
    registry.register({
      axis: 'vertical',
      element: node(),
      id: 'feed',
      primary: true,
    })
    registry.register({
      axis: 'vertical',
      element: node(),
      id: 'feed',
      primary: false,
    })
    registry.register({
      axis: 'vertical',
      element: node(),
      id: 'other',
      primary: true,
    })

    expect(registry.get(' ')).toBeUndefined()
    expect(registry.get('feed')?.primary).toBe(true)
    expect(registry.get('other')).toBeUndefined()
    expect(error).toHaveBeenCalledTimes(3)
    expect(error.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('non-empty string'),
      expect.stringContaining('already registered'),
      expect.stringContaining('already has primary'),
    ])
  })

  it('warns on live mismatch, then restores the snapshot exactly', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const registry = createScrollSurfaceRegistry({
      development: true,
      screenKey: 'screen-a-0',
    })
    const element = node(0, 92)
    registry.register({
      axis: 'vertical',
      element,
      id: 'feed',
      primary: true,
    })

    const results = registry.restore(new Map([['feed', { x: 0, y: 418 }]]), {
      warnOnMismatch: true,
    })

    expect(results).toEqual([
      {
        id: 'feed',
        live: { x: 0, y: 92 },
        matches: false,
        snapshot: { x: 0, y: 418 },
      },
    ])
    expect(element.scrollTop).toBe(418)
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('live offset (0, 92) but its snapshot was (0, 418)'),
      expect.objectContaining({ id: 'feed' }),
    )
  })

  it('returns a surface saved at its bottom to its current bottom, not to the saved offset', () => {
    // A chat thread saved at its bottom, restored after a reload whose layout is taller.
    const saved = Object.assign(node(0, 4000), { scrollHeight: 5000, clientHeight: 1000 })
    const before = createScrollSurfaceRegistry({ development: true, screenKey: 'thread-0' })
    before.register({
      axis: 'vertical',
      element: saved,
      id: 'thread',
      primary: true,
      followsEnd: () => true,
    })
    const snapshot = before.capture()
    expect(snapshot.get('thread')).toEqual({ x: 0, y: 4000, atEnd: true })

    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const onRestore = vi.fn()
    const restored = Object.assign(node(0, 0), { scrollHeight: 6200, clientHeight: 1000 })
    const after = createScrollSurfaceRegistry({ development: true, screenKey: 'thread-0' })
    after.register({ axis: 'vertical', element: restored, id: 'thread', primary: true, onRestore })
    after.restore(snapshot, { warnOnMismatch: true })

    expect(restored.scrollTop).toBe(5200)
    expect(onRestore).toHaveBeenCalledOnce()
    expect(warning).not.toHaveBeenCalled()
    // Nothing stays pending: later layout belongs to the surface's own position controller.
    expect(after.capture({ preservePending: true }).get('thread')).toEqual({ x: 0, y: 5200 })
  })

  it('restores a pending snapshot when a surface registers late while uncovered', () => {
    const registry = createScrollSurfaceRegistry({
      development: true,
      screenKey: 'screen-a-0',
    })
    const snapshot = new Map([['late-feed', { x: 0, y: 418 }]])
    registry.setUncovered(true)

    expect(registry.restore(snapshot)).toEqual([])
    expect(registry.capture({ preservePending: true })).toEqual(snapshot)
    const element = node(0, 0)
    registry.register({
      axis: 'vertical',
      element,
      id: 'late-feed',
      primary: true,
    })

    expect(element.scrollTop).toBe(418)
    expect(element.scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      left: 0,
      top: 418,
    })
  })

  it('warns before a recapture replaces unconsumed snapshot entries', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const registry = createScrollSurfaceRegistry({
      development: true,
      screenKey: 'screen-a-0',
    })
    registry.setUncovered(true)
    registry.restore(new Map([['missing-feed', { x: 0, y: 418 }]]))

    expect(registry.capture()).toEqual(new Map())
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('pending snapshot entries for: missing-feed'),
      expect.objectContaining({ pendingIds: ['missing-feed'] }),
    )

    const element = node()
    registry.register({
      axis: 'vertical',
      element,
      id: 'missing-feed',
      primary: true,
    })
    expect(element.scrollTo).not.toHaveBeenCalled()
  })

  it('initializes every surface to zero when a screen has no framework snapshot', () => {
    const registry = createScrollSurfaceRegistry({ development: true })
    const vertical = node(0, 320)
    const horizontal = node(96, 0)
    registry.register({
      axis: 'vertical',
      element: vertical,
      id: 'feed',
      primary: true,
    })
    registry.register({
      axis: 'horizontal',
      element: horizontal,
      id: 'rail',
      primary: false,
    })

    registry.reset()

    expect(vertical.scrollTop).toBe(0)
    expect(horizontal.scrollLeft).toBe(0)
  })
})
