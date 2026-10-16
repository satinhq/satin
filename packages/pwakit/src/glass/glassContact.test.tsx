// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlassInteraction } from './rendererContract.ts'

// Label animations are not under test here (happy-dom rejects cancelled animations).
vi.mock('./pressHighlight.ts', () => ({ glassPressHighlight: () => {}, glassPressScale: () => 1 }))
const { GlassBackground, GlassButton, GlassEffect, ToolbarGroup } =
  await import('./GlassEffect.tsx')
const { MaterialEffectContext } = await import('./liquidContext.ts')
const { GlassRegionRegistry } = await import('./regionRegistry.ts')
const { Glass } = await import('./regions.ts')
const { Pressable } = await import('../press/Pressable.tsx')
const { horizontalDragBlocksBack } = await import('../navigation/horizontalDrag.ts')

const mounted: Array<() => void> = []
afterEach(() => {
  for (const dispose of mounted.splice(0)) dispose()
  vi.unstubAllGlobals()
})

function mount(node: ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const host = document.createElement('div')
  const root = createRoot(host)
  const regions = new GlassRegionRegistry()
  const inputs: GlassInteraction[] = []
  vi.spyOn(regions, 'interact').mockImplementation(input => void inputs.push(input))
  document.body.append(host)
  mounted.push(() => {
    act(() => root.unmount())
    host.remove()
  })
  act(() =>
    root.render(
      <MaterialEffectContext value={{ backend: 'webgpu', regions, ready: true, registerTabs() {} }}>
        {node}
      </MaterialEffectContext>,
    ),
  )
  return { host, inputs }
}

function pointer(type: string, target: Element, clientX: number) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 3,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX,
        clientY: 20,
      }),
    )
  })
}

const noop = () => {}
const surfaces: Record<string, { node: ReactNode; touch: string; yieldsBack?: boolean }> = {
  'glass Button (icon-only circle)': {
    node: (
      <GlassButton shape="circle" iconOnly aria-label="Add" onPress={noop}>
        +
      </GlassButton>
    ),
    touch: 'button',
    yieldsBack: true,
  },
  'glass Button (capsule label)': {
    node: <GlassButton onPress={noop}>Send</GlassButton>,
    touch: 'button',
    yieldsBack: true,
  },
  'menu trigger': {
    node: (
      <GlassButton aria-haspopup="menu" onPress={noop}>
        More
      </GlassButton>
    ),
    touch: 'button',
  },
  'text field': {
    node: (
      <GlassEffect glass={Glass.regular.interactive()}>
        <textarea aria-label="Message" />
      </GlassEffect>
    ),
    touch: '[data-satin-glass-effect]',
  },
  'toolbar group': {
    node: (
      <ToolbarGroup>
        <Pressable onPress={noop}>Bold</Pressable>
      </ToolbarGroup>
    ),
    touch: 'button',
  },
  'chrome button (back, close, sidebar)': {
    node: (
      <Pressable aria-label="Back" onPress={noop}>
        <span>
          <GlassBackground shape="circle" interactive />
          <span>‹</span>
        </span>
      </Pressable>
    ),
    touch: 'button',
  },
}

it.each(Object.keys(surfaces))(
  '%s: the glass tracks the finger through the drag, past the tap retention',
  name => {
    const { node, touch, yieldsBack } = surfaces[name]!
    const { host, inputs } = mount(node)
    const target = host.querySelector(touch)!
    pointer('pointerdown', target, 10)
    // Far beyond the button's 69 pt tap retention: the tap is cancelled, the glass still follows.
    pointer('pointermove', document.body, 60)
    pointer('pointermove', document.body, 160)
    pointer('pointerup', document.body, 160)
    const phases = inputs.map(input => input.phase)
    expect(phases).toEqual(['pressed', 'dragging', 'dragging', 'releasing'])
    const drags = inputs.filter(input => input.phase === 'dragging')
    expect(drags.map(input => input.contact?.x)).toEqual([60, 160])
    // Native: a drag that starts on a content glass button may become the back swipe
    // (GLASS_BACK_SWIPE, owner decision Oct 13); every other interactive glass owns it.
    expect(horizontalDragBlocksBack(target)).toBe(!yieldsBack)
  },
)

it('the innermost interactive glass owns a touch', () => {
  const { host, inputs } = mount(
    <GlassEffect glass={Glass.regular.interactive()}>
      <GlassButton onPress={noop}>Inner</GlassButton>
    </GlassEffect>,
  )
  pointer('pointerdown', host.querySelector('button')!, 10)
  pointer('pointerup', document.body, 10)
  expect(new Set(inputs.map(input => input.regionId)).size).toBe(1)
})

/** Interactive glass receives contact only through the one primitive (glassContact.ts). */
it('no interactive glass surface relays a press to the renderer outside the contact path', () => {
  const sourceRoot = join(import.meta.dirname, '..')
  const files: string[] = []
  const walk = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path)
    }
  }
  walk(sourceRoot)
  // Callers of the renderer's interaction input. GlassEffect sends only from its GlassContacts;
  // the menu panel and the Toggle/Slider thumb lenses are their own measured contacts.
  const allowed = new Set([
    'glass/GlassEffect.tsx',
    'glass/menuPresenter.tsx',
    'glass/ControlLens.tsx',
  ])
  const callers = files
    .filter(file => /regions\??\.interact\(/.test(readFileSync(file, 'utf8')))
    .map(file => relative(sourceRoot, file))
  expect(callers.filter(file => !allowed.has(file))).toEqual([])
  const glassEffect = readFileSync(join(sourceRoot, 'glass/GlassEffect.tsx'), 'utf8')
  // The old second path: a press state relayed from the control as a prop.
  expect(glassEffect).not.toMatch(/interactionState|onPressStateChange/)
  // GlassEffect's own contact, GlassBackground's bar button and its segmented thumb.
  expect(glassEffect.match(/new GlassContact\(/g)).toHaveLength(3)
})
