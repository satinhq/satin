// @vitest-environment happy-dom
import { act, Fragment, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Section, ListRow } from './ListForm.tsx'
import { ForEach } from './editing.tsx'
import { withAnimation } from '../motion/matchedGeometry.tsx'
import { RowMotionScope } from './rowMotionScope.tsx'
import { resetPointerClickSuppression } from '../press/activation.ts'
import { LIST_MOVE_ANIMATION } from './rowMotion.ts'
import { sampleChannel } from '../motion/springPath.ts'

type Motion = {
  element: Element
  frames: Keyframe[]
  duration: number
  currentTime: number
  cancelled: boolean
  finished: Promise<void>
  cancel(): void
}
let motions: Motion[]
let root: Root
let host: HTMLElement
let reorder: (animated?: boolean) => void
let reduced = false

function translation(frame: Keyframe) {
  return Number(/translateY\(([-\d.e]+)px\)/.exec(String(frame.transform))?.[1] ?? 0)
}
function presented(motion: Motion) {
  const progress = (motion.currentTime / motion.duration) * (motion.frames.length - 1)
  const index = Math.min(Math.floor(progress), motion.frames.length - 2)
  const start = translation(motion.frames[index])
  return start + (translation(motion.frames[index + 1]) - start) * (progress - index)
}
function active(element: Element) {
  return motions.findLast(motion => motion.element === element && !motion.cancelled)
}

function Fixture() {
  const [items, setItems] = useState(['A', 'B', 'C'])
  reorder = (animated = true) => {
    const update = () => setItems(current => [...current].reverse())
    if (animated) withAnimation(update)
    else update()
  }
  return (
    <div data-satin-scroll="true">
      <Section>
        <ForEach data={items} id={item => item}>
          {item => (
            <ListRow swipeActions={{ actions: [{ id: 'flag', label: 'Flag', onPress() {} }] }}>
              <span data-item={item}>{item}</span>
            </ListRow>
          )}
        </ForEach>
      </Section>
    </div>
  )
}

beforeEach(async () => {
  motions = []
  reduced = false
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      ({
        matches: reduced,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )
  Element.prototype.animate = function (frames, options) {
    const motion: Motion = {
      element: this,
      frames: frames as Keyframe[],
      duration: (options as KeyframeAnimationOptions).duration as number,
      currentTime: 0,
      cancelled: false,
      finished: new Promise(() => {}),
      cancel() {
        motion.cancelled = true
      },
    }
    motions.push(motion)
    return motion as unknown as globalThis.Animation
  }
  Element.prototype.getAnimations = function () {
    return motions.filter(
      motion => motion.element === this && !motion.cancelled,
    ) as unknown as globalThis.Animation[]
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const siblings = [...(this.parentElement?.children ?? [])]
    const index = this.hasAttribute('data-satin-section-item') ? siblings.indexOf(this) : 0
    const scroll = this.closest<HTMLElement>('[data-satin-scroll]')
    const motion = active(this)
    const y =
      index * 52 -
      (this === scroll ? 0 : (scroll?.scrollTop ?? 0)) +
      (motion ? presented(motion) : 0)
    return {
      x: 0,
      y,
      top: y,
      bottom: y + 52,
      left: 0,
      right: 300,
      width: 300,
      height: 52,
      toJSON() {},
    }
  })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(() => root.render(<Fixture />))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function row(label: string) {
  return [...host.querySelectorAll<HTMLElement>('[data-satin-section-item]')].find(
    element => element.querySelector(`[data-item="${label}"]`) !== null,
  )!
}

it('moves keyed rows from their previous positions without replacing swipe content', async () => {
  const first = row('A')
  const content = first.firstElementChild
  await act(() => reorder())
  expect(row('A')).toBe(first)
  expect(first.firstElementChild).toBe(content)
  expect(translation(active(first)!.frames[0])).toBe(-104)
  expect(translation(active(first)!.frames.at(-1)!)).toBe(0)
  expect(active(row('B'))).toBeUndefined()
})

it('retargets a moving row from its presented position and preserves its velocity', async () => {
  const first = row('A')
  await act(() => reorder())
  const old = active(first)!
  old.currentTime = 150
  const offset = presented(old)
  const velocity = sampleChannel(
    LIST_MOVE_ANIMATION,
    { displacement: -104, velocity: 0 },
    150,
  ).velocity
  await act(() => reorder())
  const next = active(first)!
  expect(old.cancelled).toBe(true)
  expect(translation(next.frames[0])).toBeCloseTo(104 + offset, 4)
  expect(translation(next.frames[1])).toBeCloseTo(
    sampleChannel(LIST_MOVE_ANIMATION, { displacement: 104 + offset, velocity }, 1000 / 60).offset,
    4,
  )
})

it('keeps scroll displacement out of the interrupted move', async () => {
  const first = row('A')
  await act(() => reorder())
  const old = active(first)!
  old.currentTime = 150
  const offset = presented(old)
  host.querySelector<HTMLElement>('[data-satin-scroll]')!.scrollTop = 80
  await act(() => reorder())
  expect(translation(active(first)!.frames[0])).toBeCloseTo(104 + offset, 4)
})

it('settles immediately for reduced motion and for an unanimated replacement order', async () => {
  const first = row('A')
  await act(() => reorder())
  expect(active(first)).toBeDefined()
  await act(() => reorder(false))
  expect(active(first)).toBeUndefined()
  reduced = true
  await act(() => reorder())
  expect(active(first)).toBeUndefined()
})

it('preserves a move through an unrelated render and cancels it when the list unmounts', async () => {
  const first = row('A')
  await act(() => reorder())
  const motion = active(first)!
  await act(() => root.render(<Fixture />))
  expect(motion.cancelled).toBe(false)
  await act(() => root.render(null))
  expect(motion.cancelled).toBe(true)
})

let change: (kind: 'insert' | 'remove' | 'transfer', animated?: boolean) => void
type RowDeclaration = 'foreach' | 'keyed' | 'unkeyed'
function MutationFixture({ declaration = 'foreach' }: { declaration?: RowDeclaration }) {
  const [first, setFirst] = useState(['A', 'B'])
  const [second, setSecond] = useState(['C'])
  change = (kind, animated = true) => {
    const update = () => {
      if (kind === 'insert') setFirst(items => ['X', ...items])
      if (kind === 'remove') setFirst(items => items.filter(item => item !== 'A'))
      if (kind === 'transfer') {
        setFirst(items => items.filter(item => item !== 'A'))
        setSecond(items => [...items, 'A'])
      }
    }
    if (animated) withAnimation(update)
    else update()
  }
  return (
    <div data-satin-scroll="true">
      <RowMotionScope>
        {[first, second].map((items, index) => (
          <Section key={index}>
            {declaration === 'foreach' ? (
              <ForEach data={items} id={item => item}>
                {item => <span data-item={item}>{item}</span>}
              </ForEach>
            ) : (
              items.map(item => (
                <ListRow key={declaration === 'keyed' ? item : undefined}>
                  <span data-item={item}>{item}</span>
                </ListRow>
              ))
            )}
          </Section>
        ))}
      </RowMotionScope>
    </div>
  )
}

it.each(['foreach', 'keyed'] as const)(
  'fades an inserted row while its neighbours open the gap (%s)',
  async declaration => {
    await act(() => root.render(<MutationFixture declaration={declaration} />))
    const first = row('A')
    await act(() => change('insert'))
    expect(row('A')).toBe(first)
    expect(translation(active(first)!.frames[0])).toBe(-52)
    expect(active(row('X'))!.frames[0].opacity).toBe(0)
    expect(active(row('X'))!.frames.at(-1)!.opacity).toBe(1)
  },
)

it.each(['foreach', 'keyed'] as const)(
  'keeps removed paint inert while neighbours close the gap, and clears it on cancellation (%s)',
  async declaration => {
    await act(() => root.render(<MutationFixture declaration={declaration} />))
    const second = row('B')
    await act(() => change('remove'))
    const ghost = host.querySelector<HTMLElement>('[data-satin-row-exit]')!
    expect(ghost.inert).toBe(true)
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.textContent).toContain('A')
    expect(translation(active(second)!.frames[0])).toBe(52)
    await act(() => change('insert', false))
    expect(host.querySelector('[data-satin-row-exit]')).toBeNull()
  },
)

it('clips full-swipe removal paint with the neighbour spring without fading it', async () => {
  function SwipeFixture() {
    const [items, setItems] = useState(['A', 'B'])
    return (
      <div data-satin-scroll="true">
        <Section>
          <ForEach data={items} id={item => item}>
            {item => (
              <ListRow
                swipeActions={{
                  edge: 'trailing',
                  actions: [
                    {
                      id: 'remove',
                      label: 'Remove',
                      onPress: () => setItems(current => current.filter(value => value !== item)),
                    },
                  ],
                }}
              >
                <span data-item={item}>{item}</span>
              </ListRow>
            )}
          </ForEach>
        </Section>
      </div>
    )
  }
  await act(() => root.render(<SwipeFixture />))
  const first = row('A')
  const second = row('B')
  const actions = first.querySelector<HTMLElement>('[data-satin-row-actions]')!
  actions.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 52,
      width: 400,
      height: 52,
    }) as DOMRect
  for (const [type, x] of [
    ['touchstart', 390],
    ['touchmove', 10],
    ['touchend', 10],
  ] as const) {
    await act(() =>
      actions.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          changedTouches: [{ identifier: 9, clientX: x, clientY: 26 }],
          touches: type === 'touchend' ? [] : [{}],
        }),
      ),
    )
  }
  resetPointerClickSuppression()
  const exit = active(first)!
  const neighbour = active(second)!
  expect(first.closest('[data-satin-row-exit]')).not.toBeNull()
  expect(exit.frames.every(frame => frame.opacity === 1)).toBe(true)
  expect(exit.frames[0].clipPath).toBe('inset(0 0 0% 0)')
  expect(exit.frames.at(-1)!.clipPath).toBe('inset(0 0 100% 0)')
  expect(exit.duration).toBe(neighbour.duration)
  for (let index = 0; index < exit.frames.length; index++) {
    const clipped = Number(/inset\(0 0 ([\d.e-]+)%/.exec(String(exit.frames[index].clipPath))![1])
    expect(clipped).toBeCloseTo(
      100 * (1 - Math.max(0, translation(neighbour.frames[index]) / 52)),
      5,
    )
  }
  await act(() => root.unmount())
  expect(host.querySelector('[data-satin-row-exit]')).toBeNull()
})

it.each(['foreach', 'keyed'] as const)(
  'matches unique item identities across sections without fading them in again (%s)',
  async declaration => {
    await act(() => root.render(<MutationFixture declaration={declaration} />))
    await act(() => change('transfer'))
    const moved = active(row('A'))!
    expect(moved).toBeDefined()
    expect(moved.frames[0].opacity).toBe(1)
    expect(translation(moved.frames[0])).toBe(-52)
    expect(host.querySelector('[data-satin-row-exit]')).toBeNull()
  },
)

it('keeps a surviving duplicate identity visible when its other section removes that ID', async () => {
  let removeDuplicate!: () => void
  function DuplicateFixture() {
    const [first, setFirst] = useState(['same'])
    removeDuplicate = () => withAnimation(() => setFirst([]))
    return (
      <div data-satin-scroll="true">
        <RowMotionScope>
          {[first, ['same']].map((items, index) => (
            <Section key={index}>
              <ForEach data={items} id={item => item}>
                {item => <span>{item}</span>}
              </ForEach>
            </Section>
          ))}
        </RowMotionScope>
      </div>
    )
  }
  await act(() => root.render(<DuplicateFixture />))
  const survivor = host.querySelectorAll<HTMLElement>('[data-satin-section-item]')[1]
  await act(() => removeDuplicate())
  expect(survivor.isConnected).toBe(true)
  expect(active(survivor)).toBeUndefined()
})

it.each(['foreach', 'keyed', 'unkeyed'] as const)(
  'settles insertions, removals and transfers without a transaction (%s)',
  async declaration => {
    await act(() => root.render(<MutationFixture declaration={declaration} />))
    await act(() => change('insert', false))
    await act(() => change('remove', false))
    await act(() => change('transfer', false))
    expect(motions).toHaveLength(0)
    expect(host.querySelector('[data-satin-row-exit]')).toBeNull()
  },
)

it('leaves unkeyed children unanimated inside a transaction', async () => {
  await act(() => root.render(<MutationFixture declaration="unkeyed" />))
  await act(() => change('insert'))
  await act(() => change('remove'))
  expect(motions).toHaveLength(0)
  expect(host.querySelector('[data-satin-row-exit]')).toBeNull()
})

it('tracks keyed maps through fragments, empty groups and reorders', async () => {
  let replace!: (items: string[]) => void
  function KeyedFixture() {
    const [items, setItems] = useState<string[]>([])
    replace = next => withAnimation(() => setItems(next))
    return (
      <div data-satin-scroll="true">
        <Section>
          {false}
          <Fragment key="rows">
            {items.map(item => (
              <ListRow key={item}>
                <span data-item={item}>{item}</span>
              </ListRow>
            ))}
          </Fragment>
          {null}
        </Section>
      </div>
    )
  }
  await act(() => root.render(<KeyedFixture />))
  await act(() => replace(['A', 'B']))
  expect(active(row('A'))!.frames[0].opacity).toBe(0)
  const first = row('A')
  await act(() => replace(['B', 'A']))
  expect(row('A')).toBe(first)
  expect(translation(active(first)!.frames[0])).toBe(-52)
  await act(() => replace([]))
  expect(host.querySelectorAll('[data-satin-row-exit]')).toHaveLength(2)
})
