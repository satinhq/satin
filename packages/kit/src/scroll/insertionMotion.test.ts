// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { insertionProgress } from '../motion/composerMotion.ts'
import { commitCarriedKeyboardRoom } from '../safe-area/keyboardCarrierGeometry.ts'
import { createInsertionMotion, insertionMotion } from './insertionMotion.ts'

const stops: (() => void)[] = []
afterEach(() => {
  stops.splice(0).forEach(stop => stop())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})
function fixture() {
  const surface = document.createElement('div')
  const content = document.createElement('div')
  surface.append(content)
  document.body.append(surface)
  const first = document.createElement('div')
  content.append(first)
  let y = 100
  first.getBoundingClientRect = () => ({ top: y }) as DOMRect
  const cancel = vi.fn()
  const animate = vi.fn(
    (_frames: Keyframe[], _options: KeyframeAnimationOptions) =>
      ({ cancel, onfinish: null }) as unknown as Animation,
  )
  content.animate = animate
  const motion = createInsertionMotion(surface, content)
  motion.reconcile(true)
  stops.push(motion.cancel)
  return {
    surface,
    content,
    first,
    animate,
    cancel,
    motion,
    move: (next: number) => {
      y = next
    },
  }
}
it('carries an append from the old row position for both short and overflowing threads', () => {
  const f = fixture()
  f.content.append(document.createElement('div'))
  f.move(48)
  f.motion.reconcile(true)
  const track = insertionMotion(f.surface)!
  expect(track.stops[0]?.[1]).toBe(52)
  expect(track.stops.at(-1)?.[1]).toBe(0)
  expect(f.animate.mock.calls[0]?.[1]).toMatchObject({ fill: 'both' })
  // An inset resize during the flight does not restart it.
  f.move(30)
  f.motion.reconcile(true)
  expect(f.animate).toHaveBeenCalledTimes(1)
})
it('does not animate streaming, a prepend, a replacement, or an unpinned append', () => {
  const f = fixture()
  f.first.textContent = 'stream'
  f.move(80)
  f.motion.reconcile(true)
  f.content.prepend(document.createElement('div'))
  f.motion.reconcile(true)
  f.content.replaceChildren(document.createElement('div'))
  f.motion.reconcile(true)
  f.content.append(document.createElement('div'))
  f.motion.reconcile(false)
  expect(f.animate).not.toHaveBeenCalled()
})
it('removes the backdrop trajectory when cancelled or disposed', () => {
  const f = fixture()
  f.content.append(document.createElement('div'))
  f.move(60)
  f.motion.reconcile(true)
  expect(insertionMotion(f.surface)).toBeDefined()
  f.motion.cancel()
  expect(f.cancel).toHaveBeenCalledOnce()
  expect(insertionMotion(f.surface)).toBeUndefined()
})
it('respects Reduce Motion', () => {
  const f = fixture()
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
  f.content.append(document.createElement('div'))
  f.move(60)
  f.motion.reconcile(true)
  expect(f.animate).not.toHaveBeenCalled()
})

it('animates the first message when it replaces an empty-thread placeholder', () => {
  const f = fixture()
  const message = document.createElement('div')
  message.getBoundingClientRect = () => ({ top: 100, height: 44 }) as DOMRect
  f.content.replaceChildren(message)
  f.motion.reconcile(true)
  expect(insertionMotion(f.surface)?.stops[0]?.[1]).toBe(44)
})

it('animates an inset resize without clipping bubbles through the accessory, then restores the clip', () => {
  const f = fixture()
  f.surface.style.clipPath = 'inset(1px)'
  f.surface.style.paddingBottom = '80px'
  f.move(78)
  f.motion.reconcile(true)
  expect(insertionMotion(f.surface)?.stops[0]?.[1]).toBe(22)
  expect(f.surface.style.clipPath).toBe('inset(0 0 80px 0)')
  f.motion.cancel()
  expect(f.surface.style.clipPath).toBe('inset(1px)')
})

it("does not replay a keyboard carrier's committed room as an insertion", () => {
  const f = fixture()
  // The carrier has shown the keyboard's travel on transforms; its commit moves the rows in layout.
  commitCarriedKeyboardRoom(() => {
    f.surface.style.paddingBottom = '380px'
    f.move(-280)
    f.motion.reconcile(true)
  })
  expect(f.animate).not.toHaveBeenCalled()
  expect(insertionMotion(f.surface)).toBeUndefined()
  // The committed layout is the new baseline.
  f.motion.reconcile(true)
  expect(f.animate).not.toHaveBeenCalled()
})

it('eases the displacement when a terminal typing row is replaced', () => {
  const f = fixture()
  const old = document.createElement('div')
  f.first.append(old)
  f.motion.reconcile(true)
  old.replaceWith(document.createElement('div'))
  f.move(98)
  f.motion.reconcile(true)
  expect(insertionMotion(f.surface)?.stops[0]?.[1]).toBe(2)
})

it('keeps the measured older-thread trajectory monotonic in either direction', () => {
  for (const distance of [-44, 54]) {
    const positions = insertionProgress.map(progress => distance * (1 - progress))
    for (let i = 1; i < positions.length; i++) {
      expect(Math.abs(positions[i]!)).toBeLessThanOrEqual(Math.abs(positions[i - 1]!))
      expect(positions[i]! * distance).toBeGreaterThanOrEqual(0)
    }
  }
})

for (const pinned of [true, false]) {
  it(`recognizes replacement before a retained decorative tail, pinned=${pinned}`, () => {
    const f = fixture()
    const typing = document.createElement('span')
    const decoration = document.createElement('svg')
    f.first.append(typing, decoration)
    f.motion.reconcile(pinned)
    typing.replaceWith(document.createElement('p'))
    f.motion.contentChanged([
      { target: f.first, removedNodes: [typing] } as unknown as MutationRecord,
    ])
    f.move(102)
    f.motion.reconcile(pinned)
    expect(f.animate).toHaveBeenCalledTimes(pinned ? 1 : 0)
    if (pinned) expect(insertionMotion(f.surface)?.stops[0]?.[1]).toBe(-2)
    f.motion.reconcile(pinned)
    expect(f.animate).toHaveBeenCalledTimes(pinned ? 1 : 0)
  })
}
