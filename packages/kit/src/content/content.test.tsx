// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { useTask } from '../tasks/useTask.ts'
import {
  Text,
  VStack,
  HStack,
  ZStack,
  Spacer,
  Divider,
  LazyVStack,
  LazyHStack,
  LazyVGrid,
  LazyHGrid,
  GridItem,
} from './content.tsx'

const container = document.createElement('div')
const root = createRoot(container)
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  act(() => root.render(null))
})

it('keeps nested text inline and supports inherited emphasis', () => {
  act(() =>
    root.render(
      <Text font="headline" foregroundStyle="secondary">
        Hello <Text fontWeight="bold">world</Text>
      </Text>,
    ),
  )
  expect(container.textContent).toBe('Hello world')
  expect(container.querySelector('span span')).not.toBeNull()
  // happy-dom does not parse system keywords; unsupported styles must use an explicit font.
  expect(renderToStaticMarkup(<Text font="largeTitle">Title</Text>)).toContain(
    'font:400 34px -apple-system',
  )
  expect(renderToStaticMarkup(<Text font="callout">Callout</Text>)).toContain(
    'font:400 16px -apple-system',
  )
  expect(renderToStaticMarkup(<Text font="headline">Heading</Text>)).toContain(
    'font:-apple-system-headline',
  )
  expect(container.querySelector<HTMLSpanElement>('span span')?.style.fontWeight).toBe('700')
})
it('makes the default padding and infinite frame available without CSS translation', () => {
  act(() =>
    root.render(
      <Text padding frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
        Title
      </Text>,
    ),
  )
  const text = container.firstElementChild as HTMLElement
  expect((text.firstElementChild as HTMLElement).style.padding).toBe('16px')
  expect(text.style.width).toBe('100%')
  expect(text.style.justifyItems).toBe('start')
})
it('clamps text only when requested and supports explicit alignment', () => {
  act(() =>
    root.render(
      <Text font="subheadline" lineLimit={2} multilineTextAlignment="trailing">
        Long text
      </Text>,
    ),
  )
  const text = container.firstElementChild as HTMLElement
  // Vendor line clamping is also checked in the Catalyst specimen.
  expect(renderToStaticMarkup(<Text lineLimit={2}>Long text</Text>)).toContain(
    '-webkit-line-clamp:2',
  )
  expect(text.style.textAlign).toBe('end')
  expect(
    renderToStaticMarkup(
      <Text font="subheadline" lineLimit={2}>
        Long text
      </Text>,
    ),
  ).toContain('line-height:round(up, 20px,')
})
it('preserves empty and conditional stack children and explicit zero spacing', () => {
  act(() =>
    root.render(
      <VStack spacing={0}>
        {false}
        <Text>A</Text>
        <HStack>
          <Text>B</Text>
          <Spacer minLength={0} />
        </HStack>
      </VStack>,
    ),
  )
  expect(container.textContent).toBe('AB')
  expect(Number.parseFloat((container.firstElementChild as HTMLElement).style.gap)).toBe(0)
})
it('preserves ZStack reading order and centers its layers by default', () => {
  act(() =>
    root.render(
      <ZStack>
        <Text>Back</Text>
        <Text>Front</Text>
      </ZStack>,
    ),
  )
  expect(container.textContent).toBe('BackFront')
  expect((container.firstElementChild as HTMLElement).style.placeItems).toBe('center')
})
it('exposes dividers as decorative instead of adding an accessibility stop', () => {
  act(() =>
    root.render(
      <HStack>
        <Text>A</Text>
        <Divider />
        <Text>B</Text>
      </HStack>,
    ),
  )
  expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
})
it('keeps all eager lazy-stack rows mounted until the shared virtualizer ships', () => {
  act(() =>
    root.render(
      <>
        <LazyVStack>
          <Text>A</Text>
        </LazyVStack>
        <LazyHStack>
          <Text>B</Text>
        </LazyHStack>
      </>,
    ),
  )
  expect(container.textContent).toBe('AB')
})
it('uses the same fixed and flexible tracks on either grid axis', () => {
  const tracks = [GridItem.fixed(30), GridItem.flexible({ minimum: 20 })]
  expect(Object.isFrozen(tracks[0])).toBe(true)
  expect(() => GridItem.fixed(-1)).toThrow(RangeError)
  expect(() =>
    renderToStaticMarkup(
      <LazyVGrid
        columns={[{ kind: 'fixed', size: -1 } as unknown as ReturnType<typeof GridItem.fixed>]}
      />,
    ),
  ).toThrow('Grid tracks must be constructed with GridItem.')
  act(() =>
    root.render(
      <>
        <LazyVGrid columns={tracks}>
          <Text>A</Text>
          <Text>B</Text>
        </LazyVGrid>
        <LazyHGrid rows={tracks}>
          <Text>C</Text>
          <Text>D</Text>
        </LazyHGrid>
      </>,
    ),
  )
  expect((container.children[0] as HTMLElement).style.gridTemplateColumns).toBe(
    '30px minmax(20px, 1fr)',
  )
  expect((container.children[1] as HTMLElement).style.gridTemplateRows).toBe(
    '30px minmax(20px, 1fr)',
  )
})

it('GeometryReader reports the allocated space and reads current coordinate frames', async () => {
  const { GeometryReader } = await import('./layout.tsx')
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20,
    y: 30,
    width: 320,
    height: 80,
    top: 30,
    left: 20,
    right: 340,
    bottom: 110,
    toJSON() {},
  })
  try {
    act(() =>
      root.render(
        <GeometryReader>
          {proxy => (
            <span>
              {proxy.size.width} × {proxy.size.height}; {proxy.frame('global').x}
            </span>
          )}
        </GeometryReader>,
      ),
    )
    expect(container.textContent).toBe('320 × 80; 20')
    bounds.mockReturnValue({
      x: 40,
      y: 50,
      width: 320,
      height: 80,
      top: 50,
      left: 40,
      right: 360,
      bottom: 130,
      toJSON() {},
    })
    act(() =>
      root.render(
        <GeometryReader>{proxy => <span>{proxy.frame('global').x}</span>}</GeometryReader>,
      ),
    )
    expect(container.textContent).toBe('40')
  } finally {
    bounds.mockRestore()
  }
})

it('ViewThatFits selects by constrained ideal size and uses the last child when none fits', async () => {
  const { ViewThatFits } = await import('./layout.tsx')
  const loaded: string[] = []
  function Candidate({ title }: { title: string }) {
    useTask(() => {
      loaded.push(title)
    })
    return <Text>{title}</Text>
  }
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const width = this.textContent === 'Wide' ? 240 : this.textContent === 'Fits' ? 80 : 120
      return {
        x: 0,
        y: 0,
        width,
        height: 40,
        top: 0,
        left: 0,
        right: width,
        bottom: 40,
        toJSON() {},
      }
    })
  try {
    act(() =>
      root.render(
        <ViewThatFits in="horizontal">
          <HStack spacing={16}>
            <Candidate title="Wide" />
          </HStack>
          <div role="region" aria-label="Actions" style={{ overflowX: 'auto' }}>
            <HStack spacing={16}>
              <Candidate title="Fits" />
            </HStack>
          </div>
        </ViewThatFits>,
      ),
    )
    expect(container.querySelector('[data-satin-fit-candidate]:not([inert])')?.textContent).toBe(
      'Fits',
    )
    expect(loaded).toEqual(['Fits'])
    act(() =>
      root.render(
        <ViewThatFits in="vertical">
          <HStack spacing={16}>
            <Candidate title="Wide" />
          </HStack>
          <div role="region" aria-label="Actions" style={{ overflowX: 'auto' }}>
            <HStack spacing={16}>
              <Candidate title="Fits" />
            </HStack>
          </div>
        </ViewThatFits>,
      ),
    )
    expect(container.querySelector('[data-satin-fit-candidate]:not([inert])')?.textContent).toBe(
      'Wide',
    )
    bounds.mockImplementation(function (this: HTMLElement) {
      const width = this.hasAttribute('data-satin-view-that-fits') ? 20 : 240
      return {
        x: 0,
        y: 0,
        width,
        height: 40,
        top: 0,
        left: 0,
        right: width,
        bottom: 40,
        toJSON() {},
      }
    })
    act(() =>
      root.render(
        <ViewThatFits in="horizontal">
          <HStack spacing={16}>
            <Candidate title="Wide" />
          </HStack>
          <div role="region" aria-label="Actions" style={{ overflowX: 'auto' }}>
            <HStack spacing={16}>
              <Candidate title="Fits" />
            </HStack>
          </div>
        </ViewThatFits>,
      ),
    )
    expect(container.querySelector('[data-satin-fit-candidate]:not([inert])')?.textContent).toBe(
      'Fits',
    )
  } finally {
    bounds.mockRestore()
  }
})

it('useScaledMetric scales relative to its text style and updates when the system font changes', async () => {
  const { useScaledMetric } = await import('./scaledMetric.ts')
  let fontSize = '17px'
  const computed = vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation(() => ({ fontSize }) as CSSStyleDeclaration)
  let resize: () => void = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  function Fixture() {
    return <span>{useScaledMetric(20, 'body')}</span>
  }
  try {
    act(() => root.render(<Fixture />))
    expect(container.textContent).toBe('20')
    fontSize = '25.5px'
    act(() => resize())
    expect(container.textContent).toBe('30')
  } finally {
    act(() => root.render(null))
    computed.mockRestore()
    vi.unstubAllGlobals()
  }
})
