// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withAnimation } from './matchedGeometry.tsx'
import { TransitionView } from './TransitionView.tsx'
import { Transition } from './transition.ts'
import { sampleChannel } from './springPath.ts'
import { Animation } from './animationValue.ts'

let root: Root
let host: HTMLElement
let toggle: (visible: boolean) => void
let reduced = false
let reduce: () => void
let runs: { frames: Keyframe[]; currentTime: number; finish(): void; cancel(): void }[]
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  runs = []
  reduced = false
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        get matches() {
          return reduced
        },
        addEventListener: (_: string, listener: () => void) => {
          reduce = listener
        },
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON() {},
  })
  vi.spyOn(Element.prototype, 'animate').mockImplementation(_frames => {
    let finish!: () => void
    const finished = new Promise<void>(resolve => {
      finish = resolve
    })
    const run = { frames: _frames as Keyframe[], currentTime: 0, finish, cancel: vi.fn(), finished }
    runs.push(run)
    return run as unknown as globalThis.Animation
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
})
function Fixture() {
  const [visible, setVisible] = useState(true)
  toggle = setVisible
  return (
    <TransitionView
      visible={visible}
      transition={Transition.combined(Transition.opacity, Transition.move('leading'))}
    >
      <button>Retained child</button>
    </TransitionView>
  )
}
it('retains an inert exiting child and reverses from its presented position and velocity', async () => {
  act(() => root.render(<Fixture />))
  act(() => withAnimation(() => toggle(false)))
  expect(host.querySelector('button')).not.toBeNull()
  expect(host.firstElementChild?.hasAttribute('inert')).toBe(true)
  const exit = runs[0]!
  exit.currentTime = 100
  const atReverse = sampleChannel(Animation.default, { displacement: 100, velocity: 0 }, 100)
  act(() => withAnimation(() => toggle(true)))
  const entering = runs[1]!
  const x = (frame: Keyframe) =>
    Number(/translate3d\(([-\d.e]+)px/.exec(String(frame.transform))![1])
  expect(x(entering.frames[0]!)).toBeCloseTo(-100 + atReverse.offset)
  const next = sampleChannel(
    Animation.default,
    { displacement: -100 + atReverse.offset, velocity: atReverse.velocity },
    1000 / 60,
  )
  expect(x(entering.frames[1]!)).toBeCloseTo(next.offset)
  await act(async () => {
    exit.finish()
    await Promise.resolve()
  })
  expect(host.querySelector('button')).not.toBeNull()
  expect(host.firstElementChild?.hasAttribute('inert')).toBe(false)
  act(() => withAnimation(() => toggle(false)))
  await act(async () => {
    runs.at(-1)!.finish()
    await Promise.resolve()
  })
  expect(host.querySelector('button')).toBeNull()
})
it('removes immediately outside a transaction and settles an exit when reduced motion changes', () => {
  act(() => root.render(<Fixture />))
  act(() => toggle(false))
  expect(host.querySelector('button')).toBeNull()
  expect(runs).toHaveLength(0)
  act(() => toggle(true))
  act(() => withAnimation(() => toggle(false)))
  expect(host.querySelector('button')).not.toBeNull()
  act(() => {
    reduced = true
    reduce()
  })
  expect(host.querySelector('button')).toBeNull()
})
