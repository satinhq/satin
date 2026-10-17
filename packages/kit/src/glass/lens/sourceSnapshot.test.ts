import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureMirrorLayout, measureMirrorLayoutRelative } from './Scene.tsx'

afterEach(() => vi.unstubAllGlobals())

function source(moves: boolean) {
  const rect = {
    x: 123.125,
    y: 7.5,
    left: 123.125,
    top: 7.5,
    width: 402.0000305175781,
    height: 700.015625,
  }
  let translated = false
  vi.stubGlobal('getComputedStyle', () => {
    translated = moves
    return {
      display: 'block',
      visibility: 'visible',
      backgroundColor: 'rgb(1, 2, 3)',
      borderRadius: '25px',
    }
  })
  return {
    ownerDocument: { documentElement: { getAttribute: () => null } },
    getBoundingClientRect: () => (translated ? { ...rect, x: 119.25, left: 119.25 } : rect),
    querySelectorAll: () => [],
    closest: () => null,
    scrollLeft: 0,
    scrollTop: 0,
    scrollHeight: 900,
    childElementCount: 1,
  } as unknown as HTMLElement
}

describe('source geometry during compositor motion', () => {
  it('rejects coordinates sampled across a changing origin', () => {
    expect(measureMirrorLayout(source(true), 'general')).toBeUndefined()
  })
  it('retains exact relative geometry when the fractional origin is stable', () => {
    const layout = measureMirrorLayout(source(false), 'general')
    expect(layout?.nodes[0]).toMatchObject({ x: 0, y: 0, width: 402, height: 700.015625 })
    expect(layout?.contentHeight).toBe(900)
  })
})

it('captures a covered route only when requested, while preserving hidden descendant exclusion', () => {
  const root = source(false) as any
  const covered = {},
    hidden = { childElementCount: 1, closest: () => hidden }
  root.closest = (selector: string) =>
    selector === '[data-satin-glass-region-id]' ? null : covered
  root.contains = (node: unknown) => node === hidden
  root.querySelectorAll = (selector: string) => (selector === '*' ? [hidden] : [])
  expect(measureMirrorLayout(root, 'root')?.nodes).toHaveLength(0)
  expect(measureMirrorLayout(root, 'root', true)?.nodes).toHaveLength(1)
})

it('tags app-glass foreground separately from its transmitted backdrop', () => {
  const root = source(false) as any
  root.closest = (selector: string) =>
    selector === '[data-satin-glass-region-id]' ? { dataset: { satinGlassRegionId: 'card' } } : null
  expect(measureMirrorLayout(root, 'root')?.nodes[0].regionId).toBe('card')
})

it('keeps clipped accessibility action controls out of the painted backdrop', () => {
  const root = source(false) as any
  const access = {}
  root.closest = (selector: string) => (selector === '[data-satin-action-access]' ? access : null)
  vi.stubGlobal('getComputedStyle', () => ({
    clipPath: 'inset(50%)',
    display: 'block',
    visibility: 'visible',
    backgroundColor: 'rgb(1, 2, 3)',
    borderRadius: '0px',
  }))
  expect(measureMirrorLayout(root, 'root')?.nodes).toHaveLength(0)
  vi.stubGlobal('getComputedStyle', () => ({
    clipPath: 'none',
    display: 'block',
    visibility: 'visible',
    backgroundColor: 'rgb(1, 2, 3)',
    borderRadius: '0px',
  }))
  expect(measureMirrorLayout(root, 'root')?.nodes).toHaveLength(1)
})

it('keeps an inert duplicate preview in the painted source without using aria-hidden', () => {
  const root = source(false) as any
  root.inert = true
  root.closest = (selector: string) => (selector === '[inert]' ? root : null)
  expect(measureMirrorLayout(root, 'root')?.nodes).toHaveLength(1)
  root.closest = (selector: string) => (selector.includes('[aria-hidden="true"]') ? root : null)
  expect(measureMirrorLayout(root, 'root')?.nodes).toHaveLength(0)
})

it('retains ancestor corner clips and paints a separator after opaque row children', () => {
  const root = source(false) as any
  const child = {
    parentElement: root,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: 17.5, width: 100, height: 52 }),
  }
  root.contains = (node: unknown) => node === root || node === child
  root.querySelectorAll = (selector: string) => (selector === '*' ? [child] : [])
  vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) =>
    pseudo
      ? {
          content: element === root && pseudo === '::after' ? '""' : 'none',
          position: 'absolute',
          backgroundColor: '#ccc',
          width: 'auto',
          height: '.333px',
          left: '20px',
          right: '20px',
          top: 'auto',
          bottom: '0px',
        }
      : {
          display: 'block',
          visibility: 'visible',
          backgroundColor: '#fff',
          borderRadius: '0px',
          overflowX: 'hidden',
          overflowY: 'hidden',
          borderTopLeftRadius: '25px',
          borderTopRightRadius: '25px',
          borderBottomRightRadius: '0px',
          borderBottomLeftRadius: '0px',
        },
  )
  const nodes = measureMirrorLayout(root, 'root')!.nodes
  expect(nodes[1].clips).toEqual([
    { x: 0, y: 0, width: 402, height: 700.015625, radii: [25, 25, 0, 0] },
  ])
  expect(nodes[1]).toMatchObject({ x: 20, y: 10, width: 100, height: 52 })
  expect(nodes[2]).toMatchObject({ kind: 'rect', color: '#ccc', x: 20, width: 362 })
  const planeNodes = measureMirrorLayout(root, 'root', true, 'plane')!.nodes
  expect(planeNodes.find(node => node.width === 100)?.clips).toEqual(nodes[1].clips)
})

it('keeps rows outside the capture-time viewport of a scrolling host', () => {
  const root = source(false) as any
  root.scrollTop = 300
  root.scrollHeight = 2400
  const card = {
    parentElement: root,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: -200, width: 362, height: 2000 }),
  }
  const row = {
    parentElement: card,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: 1500, width: 362, height: 57 }),
  }
  root.contains = (node: unknown) => node === root || node === card || node === row
  root.querySelectorAll = (selector: string) => (selector === '*' ? [card, row] : [])
  vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) =>
    pseudo
      ? { content: 'none' }
      : {
          display: 'block',
          visibility: 'visible',
          backgroundColor: '#1c1c1e',
          borderRadius: '0px',
          overflowX: 'hidden',
          overflowY: element === root ? 'auto' : 'hidden',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          borderBottomRightRadius: '20px',
          borderBottomLeftRadius: '20px',
        },
  )
  const nodes = measureMirrorLayout(root, 'root')!.nodes
  const rowNode = nodes.find(node => node.height === 57)!
  // Content space: 1500 - 7.5 + 300. The host's scrollport (300..1000) must not clip it.
  expect(rowNode.y).toBe(1792.5)
  // Only the card's own rounded clip remains, spanning the row.
  expect(rowNode.clips).toEqual([
    { x: 20, y: 92.5, width: 362, height: 2000, radii: [20, 20, 20, 20] },
  ])
})

it.each([undefined, { top: 0, bottom: 200 }])(
  'pairs each moving node and clip with its current host origin (range %j)',
  captureRange => {
    const root = source(false) as any
    let translation = 0
    let tick = 0
    root.getBoundingClientRect = () => ({ left: translation, top: 0, width: 402, height: 700 })
    const clipping = {
      parentElement: root,
      getBoundingClientRect: () => ({ left: translation + 10, top: 0, width: 300, height: 200 }),
    }
    const child = {
      parentElement: clipping,
      childElementCount: 1,
      closest: () => null,
      getBoundingClientRect: () => ({ left: translation + 20, top: 10, width: 100, height: 52 }),
    }
    root.contains = (node: unknown) => [root, clipping, child].includes(node)
    root.querySelectorAll = (selector: string) => (selector === '*' ? [child] : [])
    vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) => {
      // A compositor timeline keeps advancing during the synchronous tree scan.
      translation += ++tick
      return pseudo
        ? { content: 'none' }
        : {
            display: 'block',
            visibility: 'visible',
            backgroundColor: '#fff',
            borderRadius: '0px',
            overflowX: element === clipping ? 'hidden' : 'visible',
            overflowY: element === clipping ? 'hidden' : 'visible',
            borderTopLeftRadius: '4px',
            borderTopRightRadius: '4px',
            borderBottomLeftRadius: '4px',
            borderBottomRightRadius: '4px',
          }
    })
    const row = measureMirrorLayoutRelative(root, 'root', false, 'viewport', captureRange)?.nodes[1]
    expect(row).toMatchObject({ x: 20, y: 10, width: 100, height: 52 })
    expect(row?.clips).toEqual([{ x: 10, y: 0, width: 300, height: 200, radii: [4, 4, 4, 4] }])
  },
)

it('normalizes ancestor clip cancellation residuals in moving relative snapshots', () => {
  const root = source(false) as any
  let reads = 0
  root.getBoundingClientRect = () => ({
    x: 123.125,
    y: 7.5,
    left: 123.125,
    top: 7.5,
    width: 402 + (++reads % 2 ? 0.0000305175781 : 0),
    height: 700,
  })
  const child = {
    parentElement: root,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: 17.5, width: 100, height: 52 }),
  }
  root.contains = (node: unknown) => node === root || node === child
  root.querySelectorAll = (selector: string) => (selector === '*' ? [child] : [])
  vi.stubGlobal('getComputedStyle', (_element: unknown, pseudo?: string) =>
    pseudo
      ? { content: 'none' }
      : {
          display: 'block',
          visibility: 'visible',
          backgroundColor: '#fff',
          borderRadius: '0px',
          overflowX: 'hidden',
          overflowY: 'hidden',
        },
  )
  expect(measureMirrorLayoutRelative(root, 'root')?.nodes[1].clips?.[0].width).toBe(402)
})

it('keeps a rectangular content plane immutable across scrolling; a viewport snapshot keeps the root fill', () => {
  const root = source(false) as any
  const child = {
    parentElement: root,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({
      left: 143.125,
      top: 107.5 - root.scrollTop,
      width: 100,
      height: 52,
    }),
  }
  root.contains = (node: unknown) => node === root || node === child
  root.querySelectorAll = (selector: string) => (selector === '*' ? [child] : [])
  vi.stubGlobal('getComputedStyle', (_element: unknown, pseudo?: string) =>
    pseudo
      ? { content: 'none' }
      : {
          display: 'block',
          visibility: 'visible',
          backgroundColor: '#fff',
          borderRadius: '0px',
          overflowX: 'hidden',
          overflowY: 'auto',
          borderTopLeftRadius: '0px',
          borderTopRightRadius: '0px',
          borderBottomRightRadius: '0px',
          borderBottomLeftRadius: '0px',
        },
  )
  // The live backdrop plane owns the root fill and rectangular viewport clip.
  const before = measureMirrorLayout(root, 'root', true, 'plane')!
  root.scrollTop = 100
  const after = measureMirrorLayout(root, 'root', true, 'plane')!
  expect(after.nodes).toEqual(before.nodes)
  expect(after.nodes).toHaveLength(1)
  expect(after.nodes[0]).toMatchObject({ x: 20, y: 100, clips: [] })
  // A viewport snapshot keeps the root fill. The scrolling host's scrollport is not baked into
  // either kind of capture (see 'keeps rows outside the capture-time viewport').
  const viewport = measureMirrorLayout(root, 'root', true)!
  expect(viewport.nodes).toHaveLength(2)
  expect(viewport.nodes[1].clips ?? []).toEqual([])
})
it('keeps rows outside the capture-time viewport of a scrolling host when the capture is windowed', () => {
  {
    const captureRange = { top: 1000, bottom: 2400 }
    const root = source(false) as any
    root.scrollTop = 300
    root.scrollHeight = 2400
    const card = {
      parentElement: root,
      childElementCount: 1,
      closest: () => null,
      getBoundingClientRect: () => ({ left: 143.125, top: -200, width: 362, height: 2000 }),
    }
    const row = {
      parentElement: card,
      childElementCount: 1,
      closest: () => null,
      getBoundingClientRect: () => ({ left: 143.125, top: 1500, width: 362, height: 57 }),
    }
    root.contains = (node: unknown) => node === root || node === card || node === row
    root.querySelectorAll = (selector: string) => (selector === '*' ? [card, row] : [])
    vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) =>
      pseudo
        ? { content: 'none' }
        : {
            display: 'block',
            visibility: 'visible',
            backgroundColor: '#1c1c1e',
            borderRadius: '0px',
            overflowX: 'hidden',
            overflowY: element === root ? 'auto' : 'hidden',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            borderBottomRightRadius: '20px',
            borderBottomLeftRadius: '20px',
          },
    )
    const nodes = measureMirrorLayout(root, 'root', false, 'viewport', captureRange)!.nodes
    const rowNode = nodes.find(node => node.height === 57)!
    // Content space: 1500 - 7.5 + 300. The host's scrollport (300..1000) must not clip it.
    expect(rowNode.y).toBe(1792.5)
    // Only the card's own rounded clip remains, spanning the row.
    expect(rowNode.clips).toEqual([
      { x: 20, y: 92.5, width: 362, height: 2000, radii: [20, 20, 20, 20] },
    ])
  }
})

describe('a windowed capture finds everything that paints into its range', () => {
  // An ancestor outside the capture range can contain a descendant that paints inside it.
  // A descendant is not bound to its ancestor's box.
  function measured(wrapperBox: { top: number; height: number }, childTop: number) {
    const captureRange = { top: 3000, bottom: 4400 }
    const root = source(false) as any
    root.scrollTop = 3000
    root.scrollHeight = 12000
    const style = { display: 'block', visibility: 'visible', borderRadius: '0px' }
    const wrapper = {
      parentElement: root,
      childElementCount: 1,
      closest: () => null,
      contains: (node: unknown) => node === wrapper || node === child,
      getBoundingClientRect: () => ({ left: 143.125, width: 362, ...wrapperBox }),
    }
    // Positioned or transformed away from its ancestor: on screen it is inside the range.
    const child = {
      parentElement: wrapper,
      childElementCount: 0,
      textContent: '',
      closest: () => null,
      contains: (node: unknown) => node === child,
      getBoundingClientRect: () => ({ left: 143.125, top: childTop, width: 362, height: 57 }),
    }
    root.contains = (node: unknown) => node === root || node === wrapper || node === child
    root.querySelectorAll = (selector: string) => (selector === '*' ? [wrapper, child] : [])
    vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) =>
      pseudo
        ? { content: 'none' }
        : {
            ...style,
            backgroundColor: element === child ? '#ff3b30' : 'rgba(0, 0, 0, 0)',
            overflowX: 'visible',
            overflowY: element === root ? 'auto' : 'visible',
          },
    )
    return measureMirrorLayout(root, 'root', false, 'viewport', captureRange)!.nodes
  }

  it('an absolutely positioned descendant of a zero-height wrapper far above the range', () => {
    // The wrapper sits at the top of the list (3,000 pt above the scrollport); its descendant is
    // positioned 3,500 pt down, in view.
    const nodes = measured({ top: -3000 + 7.5, height: 0 }, 500 + 7.5)
    expect(nodes.filter(node => node.color === '#ff3b30')).toHaveLength(1)
    expect(nodes.find(node => node.color === '#ff3b30')!.y).toBe(3500)
  })

  it('a transformed descendant of a row far below the range', () => {
    const nodes = measured({ top: 6000 + 7.5, height: 57 }, 200 + 7.5)
    expect(nodes.filter(node => node.color === '#ff3b30')).toHaveLength(1)
    expect(nodes.find(node => node.color === '#ff3b30')!.y).toBe(3200)
  })

  it('reads one rectangle, and nothing else, for an element outside the range', () => {
    // A long list stays cheap without skipping subtrees: an element outside the range costs its
    // rectangle only (no style, no ancestor walk).
    const captureRange = { top: 3000, bottom: 4400 }
    const root = source(false) as any
    root.scrollTop = 3000
    root.scrollHeight = 120000
    const closest = vi.fn(() => null)
    const far = Array.from({ length: 50 }, (_, index) => ({
      parentElement: root,
      childElementCount: 0,
      textContent: '',
      closest,
      contains: () => false,
      getBoundingClientRect: () => ({
        left: 143.125,
        top: 9000 + index * 58,
        width: 362,
        height: 57,
      }),
    }))
    root.contains = (node: unknown) => node === root || far.includes(node as never)
    root.querySelectorAll = (selector: string) => (selector === '*' ? far : [])
    const styled = vi.fn((element: unknown, pseudo?: string) =>
      pseudo
        ? { content: 'none' }
        : {
            display: 'block',
            visibility: 'visible',
            borderRadius: '0px',
            backgroundColor: 'rgba(0, 0, 0, 0)',
            overflowX: 'visible',
            overflowY: element === root ? 'auto' : 'visible',
          },
    )
    vi.stubGlobal('getComputedStyle', styled)
    measureMirrorLayout(root, 'root', false, 'viewport', captureRange)
    expect(closest).not.toHaveBeenCalled()
    expect(styled.mock.calls.filter(([element]) => far.includes(element as never))).toHaveLength(0)
  })
})

it('captures a stable row behind a moving empty clip but rejects movement once the clip opens', () => {
  const root = source(false) as any
  let clipWidth = 0
  let clipLeft = -70
  const clipping = {
    parentElement: root,
    getBoundingClientRect: () => ({ left: (clipLeft += 4), top: 0, width: clipWidth, height: 52 }),
  }
  const child = {
    parentElement: clipping,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: 17.5, width: 100, height: 52 }),
  }
  root.contains = () => true
  root.querySelectorAll = (selector: string) => (selector === '*' ? [child] : [])
  vi.stubGlobal('getComputedStyle', (element: unknown) => ({
    display: 'block',
    visibility: 'visible',
    backgroundColor: '#fff',
    borderRadius: '0px',
    overflowX: element === clipping ? 'hidden' : 'visible',
    overflowY: element === clipping ? 'hidden' : 'visible',
    borderTopLeftRadius: '25px',
    borderTopRightRadius: '25px',
    borderBottomRightRadius: '0px',
    borderBottomLeftRadius: '0px',
  }))
  for (const measure of [measureMirrorLayout, measureMirrorLayoutRelative]) {
    const row = measure(root, 'root')!.nodes[1]!
    expect(row).toMatchObject({ x: 20, y: 10, width: 100, height: 52 })
    expect(row.clips).toEqual([{ x: 0, y: 0, width: 0, height: 0, radii: [0, 0, 0, 0] }])
  }
  clipWidth = 100
  expect(measureMirrorLayoutRelative(root, 'root')).toBeUndefined()
})

it('captures album cards through a boxless ContextMenu scroll wrapper', () => {
  const root = source(false) as any
  const wrapper = {
    parentElement: root,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  }
  const card = {
    parentElement: wrapper,
    childElementCount: 1,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 143.125, top: 17.5, width: 192, height: 192 }),
  }
  root.contains = (node: unknown) => [root, wrapper, card].includes(node)
  root.querySelectorAll = (selector: string) => (selector === '*' ? [wrapper, card] : [])
  vi.stubGlobal('getComputedStyle', (element: unknown, pseudo?: string) =>
    pseudo
      ? { content: 'none' }
      : {
          display: element === wrapper ? 'contents' : 'block',
          visibility: 'visible',
          backgroundColor: '#ff8800',
          borderRadius: '0px',
          overflowX: element === wrapper ? 'scroll' : 'visible',
          overflowY: element === wrapper ? 'hidden' : 'visible',
        },
  )
  const paintedCard = measureMirrorLayout(root, 'root')!.nodes.find(node => node.width === 192)!
  expect(paintedCard).toBeDefined()
  expect(paintedCard.clips).toEqual([])
})
