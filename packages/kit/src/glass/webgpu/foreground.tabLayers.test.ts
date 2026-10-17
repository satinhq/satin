import { afterEach, expect, it, vi } from 'vitest'
import { captureRegionForeground } from './foreground.ts'

afterEach(() => vi.unstubAllGlobals())

it('keeps a tab icon crossing the dock midpoint whole and isolates the complete label', async () => {
  const drawn: number[][] = []
  const context = {
    scale() {},
    beginPath() {},
    roundRect(x: number, y: number, width: number, height: number) {
      drawn.push([x, y, width, height])
    },
    fill() {},
  }
  const root = {
    dataset: {},
    getAttribute: () => 'tab',
    getBoundingClientRect: () => ({ left: 100, top: 800, width: 100, height: 60 }),
    querySelectorAll: (selector: string) => (selector === '*' ? [icon, label] : []),
  }
  const node = (top: number, height: number, isLabel: boolean) => ({
    tagName: 'SPAN',
    parentElement: root,
    closest: (selector: string) =>
      isLabel && selector === '[data-satin-tab-label], small' ? label : null,
    getBoundingClientRect: () => ({ left: 130, top, width: 40, height }),
  })
  const icon = node(810, 30, false)
  const label = node(844, 10, true)
  vi.stubGlobal('getComputedStyle', () => ({
    opacity: '1',
    visibility: 'visible',
    display: 'block',
    backgroundColor: 'blue',
    borderRadius: '0',
    maskImage: 'none',
  }))
  const canvas = { width: 0, height: 0, getContext: () => context }
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4 })
  vi.stubGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => canvas,
    createTreeWalker: () => ({ nextNode: () => null }),
  })
  await captureRegionForeground(root as unknown as HTMLElement, 3, 0, undefined, {
    tabLayers: true,
  })
  expect([canvas.width, canvas.height]).toEqual([300, 360])
  expect(drawn).toEqual([
    [30, 10, 40, 30],
    [30, 104, 40, 10],
  ])
})
