import { afterEach, expect, it, vi } from 'vitest'
import { captureRegionForeground, cloneForegroundSvg, textLines } from './foreground.ts'
afterEach(() => vi.unstubAllGlobals())
it('excludes transparent contact backgrounds and transparent ancestor subtrees from foreground', async () => {
  const drawn: { color: string; alpha: number }[] = []
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    scale() {},
    beginPath() {},
    roundRect() {},
    fill() {
      drawn.push({ color: this.fillStyle, alpha: this.globalAlpha })
    },
  }
  const rect = { left: 0, top: 0, width: 44, height: 44 }
  const root = {
    dataset: { satinGlassRegionId: 'test-region' },
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) => (selector === '*' ? [contact, hiddenInk, dot] : []),
  }
  const make = (backgroundColor: string, opacity: string, parentElement: unknown = root) => ({
    tagName: 'SPAN',
    closest: () => null,
    getBoundingClientRect: () => rect,
    parentElement,
    style: { backgroundColor, opacity, visibility: 'visible', display: 'block', borderRadius: '0' },
  })
  const contact = make('white', '0'),
    hiddenInk = make('red', '1', contact),
    dot = make('black', '1')
  vi.stubGlobal('getComputedStyle', (node: { style: unknown }) => node.style)
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => context }),
    createTreeWalker: () => ({ nextNode: () => null }),
  })
  await captureRegionForeground(root as unknown as HTMLElement, 3)
  expect(drawn).toEqual([{ color: 'black', alpha: 1 }])
})

it('retains external and descendant stroke paint when the SVG becomes an image', () => {
  const make = (paint: Record<string, string>) => ({
    paint,
    style: {
      values: {} as Record<string, string>,
      color: '',
      opacity: '',
      setProperty(k: string, v: string) {
        this.values[k] = v
      },
    },
    setAttribute() {},
    querySelectorAll: () => [] as unknown[],
  })
  const root = make({
      color: 'rgb(0, 0, 0)',
      fill: 'none',
      stroke: 'rgb(0, 0, 0)',
      'stroke-width': '1.8px',
      'stroke-linecap': 'round',
    }),
    path = make({
      color: 'rgb(0, 0, 0)',
      fill: 'none',
      stroke: 'rgb(0, 0, 0)',
      'stroke-width': '2.5px',
      'stroke-dasharray': '3px, 2px',
      'stroke-dashoffset': '1px',
      'stroke-linecap': 'square',
    }),
    circle = make({ color: 'rgb(0, 0, 0)', fill: 'rgb(0, 0, 0)', stroke: 'none' })
  const clone = make({}),
    cp = make({}),
    cc = make({})
  root.querySelectorAll = () => [path, circle]
  clone.querySelectorAll = () => [cp, cc]
  vi.stubGlobal('getComputedStyle', (node: typeof root) => ({
    color: node.paint.color,
    getPropertyValue: (key: string) => node.paint[key] ?? '',
  }))
  const source = { ...root, cloneNode: () => clone }
  cloneForegroundSvg(source as unknown as SVGSVGElement, 'rgb(0, 122, 255)')
  expect(clone.style.values).toMatchObject({
    fill: 'none',
    stroke: 'rgb(0, 122, 255)',
    'stroke-width': '1.8px',
    'stroke-linecap': 'round',
  })
  expect(cp.style.values).toMatchObject({
    stroke: 'rgb(0, 122, 255)',
    'stroke-width': '2.5px',
    'stroke-linecap': 'square',
    'stroke-dasharray': '3px, 2px',
    'stroke-dashoffset': '1px',
  })
  expect(cc.style.values).toMatchObject({ fill: 'rgb(0, 122, 255)', stroke: 'none' })
  expect(clone.style.opacity).toBe('1')
})

it('keeps first-presentation symbols visible when their menu is held hidden', () => {
  const symbol = documentlessSymbol()
  const path = documentlessSymbol()
  symbol.querySelectorAll = () => [path]
  vi.stubGlobal('getComputedStyle', () => ({
    color: 'white',
    getPropertyValue: (property: string) => (property === 'visibility' ? 'hidden' : ''),
  }))
  cloneForegroundSvg(symbol as unknown as SVGSVGElement, undefined, { inheritedHidden: true })
  expect(symbol.style.values.visibility).toBe('visible')
  expect(path.style.values.visibility).toBe('visible')
})

function documentlessSymbol() {
  return {
    style: {
      values: {} as Record<string, string>,
      setProperty(property: string, value: string) {
        this.values[property] = value
      },
    },
    setAttribute() {},
    querySelectorAll: () => [] as unknown[],
    cloneNode() {
      return this
    },
  }
}

it('splits a wrapped label into its visual lines instead of refusing it', () => {
  // "Remove from list" wraps after "Remove ": each character is 10 pt wide, lines are 22 pt apart.
  const text = 'Remove from list'
  const node = { textContent: text } as Text
  const wrapAt = 7
  const box = (index: number) => {
    const line = index < wrapAt ? 0 : 1
    const column = line ? index - wrapAt : index
    // The wrapped space collapses to zero width.
    const width = index === wrapAt - 1 ? 0 : 10
    return { left: 16 + column * 10, top: 100 + line * 22, width, height: 20 }
  }
  vi.stubGlobal('document', {
    createRange: () => {
      let start = 0,
        end = text.length,
        whole = false
      const rects = () =>
        Array.from({ length: end - start }, (_, i) => box(start + i)).filter(r => r.width)
      const bounds = () => {
        const all = rects()
        const left = Math.min(...all.map(r => r.left)),
          top = Math.min(...all.map(r => r.top))
        const right = Math.max(...all.map(r => r.left + r.width)),
          bottom = Math.max(...all.map(r => r.top + r.height))
        return { left, top, x: left, y: top, width: right - left, height: bottom - top }
      }
      return {
        selectNodeContents: () => (whole = true),
        setStart: (_: unknown, offset: number) => (start = offset),
        setEnd: (_: unknown, offset: number) => (end = offset),
        getClientRects: () =>
          whole && end - start === text.length ? [box(0), box(wrapAt)] : rects(),
        getBoundingClientRect: bounds,
      }
    },
  })
  const lines = textLines(node)
  expect(lines.map(line => line.text)).toEqual(['Remove', 'from list'])
  expect(lines.map(line => [line.rect.left, line.rect.top])).toEqual([
    [16, 100],
    [16, 122],
  ])
})

it('captures a pressed trigger glyph at its resting opacity, not mid-highlight', async () => {
  const drawn: number[] = []
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    scale() {},
    beginPath() {},
    roundRect() {},
    fill() {
      drawn.push(this.globalAlpha)
    },
  }
  const rect = { left: 0, top: 0, width: 44, height: 44 }
  const root = {
    dataset: {},
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) => (selector === '*' ? [dot] : []),
  }
  // The light press highlight left the label at 0.2, releasing to 1.
  const dot = {
    tagName: 'SPAN',
    closest: () => null,
    getBoundingClientRect: () => rect,
    parentElement: root,
    getAnimations: () => [{ effect: { getKeyframes: () => [{ opacity: 0.2 }, { opacity: 1 }] } }],
    style: { backgroundColor: 'black', opacity: '0.2', visibility: 'visible', display: 'block' },
  }
  vi.stubGlobal('getComputedStyle', (node: { style?: unknown }) => node.style ?? {})
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => context }),
    createTreeWalker: () => ({ nextNode: () => null }),
  })
  await captureRegionForeground(root as unknown as HTMLElement, 3)
  await captureRegionForeground(root as unknown as HTMLElement, 3, 20, undefined, { resting: true })
  expect(drawn).toEqual([0.2, 1])
})

// Owner Music video: a pressed interactive mini player lifted a grey square where its artwork is.
it('draws an image inside interactive glass into the lifted foreground, above its placeholder fill', async () => {
  vi.resetModules()
  const { captureRegionForeground: capture } = await import('./foreground.ts')
  const calls: string[] = []
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    scale() {},
    save() {},
    restore() {},
    clip() {},
    beginPath() {},
    roundRect() {},
    fill() {
      calls.push(`fill ${this.fillStyle}`)
    },
    drawImage(image: unknown, x: number, y: number, width: number, height: number) {
      calls.push(`image ${image === artwork} ${x} ${y} ${width} ${height}`)
    },
  }
  const rect = { left: 0, top: 0, width: 32, height: 32 }
  const root = {
    dataset: { satinGlassRegionId: 'mini-player' },
    getBoundingClientRect: () => rect,
    querySelectorAll: (selector: string) =>
      selector === '*' ? [artwork] : selector === 'img' ? [artwork] : [],
  }
  const artwork = {
    tagName: 'IMG',
    currentSrc: '/cover.jpg',
    naturalWidth: 64,
    naturalHeight: 32,
    getAttribute: () => '/cover.jpg',
    decode: async () => {},
    closest: () => null,
    getBoundingClientRect: () => rect,
    parentElement: root,
    style: {
      backgroundColor: 'rgb(120, 120, 128)',
      opacity: '1',
      visibility: 'visible',
      display: 'block',
      borderRadius: '6px',
      objectFit: 'cover',
    },
  }
  vi.stubGlobal('getComputedStyle', (node: { style: unknown }) => node.style)
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => context }),
    createTreeWalker: () => ({ nextNode: () => null }),
  })
  await capture(root as unknown as HTMLElement, 3, 0)
  // Cover fit: the 64 x 32 image keeps the square's height and overflows it sideways, centred.
  expect(calls).toEqual(['fill rgb(120, 120, 128)', 'image true -16 0 64 32'])
})

it('paints the toolbar icon without its accessible title while retaining ordinary menu text', async () => {
  const painted: string[] = []
  const rect = { left: 0, top: 0, width: 44, height: 44 }
  const context = {
    scale() {},
    measureText: () => ({ fontBoundingBoxAscent: 14, fontBoundingBoxDescent: 3 }),
    fillText: (text: string) => painted.push(text),
  }
  const root = {
    dataset: {},
    querySelectorAll: () => [],
    getBoundingClientRect: () => rect,
  }
  const title = { parentElement: root }
  const parent = (accessible: boolean) => ({
    parentElement: accessible ? title : root,
    closest: (selector: string) =>
      accessible && selector === '.satin-control-accessible-title' ? title : null,
  })
  const nodes = [
    { textContent: '…', parentElement: parent(false) },
    // A nested title is still accessibility-only, even when its own style is visible.
    { textContent: 'More', parentElement: parent(true) },
    { textContent: 'More visible', parentElement: parent(false) },
  ]
  let index = 0
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('getComputedStyle', () => ({
    display: 'inline',
    visibility: 'visible',
    opacity: '1',
    fontStyle: 'normal',
    fontWeight: '400',
    fontSize: '17px',
    fontFamily: 'system-ui',
    direction: 'ltr',
  }))
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => context }),
    createTreeWalker: () => ({ nextNode: () => nodes[index++] ?? null }),
    createRange: () => ({
      selectNodeContents() {},
      getClientRects: () => [rect],
      getBoundingClientRect: () => rect,
    }),
  })
  await captureRegionForeground(root as unknown as HTMLElement, 3, 0, undefined, { resting: true })
  expect(painted).toEqual(['…', 'More visible'])
  expect(nodes[1].textContent).toBe('More')
})

it('refreshes retained accessory ink in its expanded coordinates while its live children are hidden', async () => {
  const drawn: number[][] = []
  const context = {
    globalAlpha: 1,
    fillStyle: '',
    scale() {},
    beginPath() {},
    fill() {},
    roundRect(...box: number[]) {
      drawn.push([this.globalAlpha, ...box])
    },
  }
  const root = {
    dataset: { satinGlassRegionId: 'player', satinAccessoryInk: 'true' },
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 400, height: 48 }),
    children: [] as unknown[],
    querySelectorAll: (selector: string) => (selector === '*' ? [child] : []),
  }
  const child = {
    tagName: 'SPAN',
    parentElement: root,
    closest: () => null,
    getBoundingClientRect: () => ({ left: 370, top: 208, width: 32, height: 32 }),
    style: {
      backgroundColor: 'black',
      opacity: '0',
      visibility: 'visible',
      display: 'block',
      borderRadius: '0',
    },
  }
  root.children.push(child)
  vi.stubGlobal('getComputedStyle', (node: { style: unknown }) => node.style)
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => context }),
    createTreeWalker: () => ({ nextNode: () => null }),
  })
  await captureRegionForeground(root as unknown as HTMLElement, 1, 20, undefined, {
    accessory: {
      epoch: 0,
      duration: 100,
      widths: [400, 300],
      envelope: 400,
      slices: [{ x: 370, y: 8, width: 32, height: 32, anchor: 1, clip: 0 }],
    },
  })
  expect(drawn).toEqual([[1, 390, 28, 32, 32, 0]])
})

it('removes page positioning from the detached SVG image without moving the live symbol', () => {
  const clone = documentlessSymbol()
  const source = {
    ...documentlessSymbol(),
    style: { position: 'absolute', left: '20px', top: '9px' },
    cloneNode: () => clone,
  }
  vi.stubGlobal('getComputedStyle', () => ({
    color: 'black',
    getPropertyValue: () => '',
  }))
  cloneForegroundSvg(source as unknown as SVGSVGElement)
  expect(clone.style).toHaveProperty('position', 'static')
  expect(source.style).toEqual({ position: 'absolute', left: '20px', top: '9px' })
})
