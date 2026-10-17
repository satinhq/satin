import { describe, expect, it } from 'vitest'
import { collectTransitionBindings } from './transitionBindings.ts'
import type { ScreenEntry, TransitionController } from './types.ts'

function controller(): TransitionController {
  return { bind: () => () => undefined, cancel() {}, finish() {}, progress: 0 }
}

function entry(
  key: string,
  phase: ScreenEntry['transition']['phase'],
  transitionController: TransitionController,
): ScreenEntry {
  return {
    key,
    params: undefined,
    presentation: 'push',
    screenId: key,
    transition: { controller: transitionController, phase },
  }
}

function screenElements(key: string) {
  return {
    dim: { id: `${key}-dim` } as HTMLElement,
    motion: { id: `${key}-motion` } as HTMLElement,
    screen: { id: `${key}-screen` } as HTMLElement,
  }
}

describe('NavigatorHost transition bindings', () => {
  it('enables rear occlusion only for navigation inside a sheet', () => {
    const settled = controller(),
      push = controller()
    const root = screenElements('root'),
      detail = screenElements('detail')
    detail.screen.closest = (selector: string) =>
      selector === '.satin-sheet-content' ? ({} as Element) : null
    const entries = [entry('root', 'settled', settled), entry('detail', 'entering', push)]
    const elements = new Map([
      ['root', root],
      ['detail', detail],
    ])
    expect(collectTransitionBindings(entries, elements, 440)[0]!.binding.occludeSecondary).toBe(
      true,
    )
    detail.screen.closest = () => null
    expect(
      collectTransitionBindings(entries, elements, 440)[0]!.binding.occludeSecondary,
    ).toBeUndefined()
  })
  it('binds a push controller to the entering and outgoing containers', () => {
    const settled = controller()
    const push = controller()
    const elements = new Map([
      ['root', screenElements('root')],
      ['detail', screenElements('detail')],
    ])

    expect(
      collectTransitionBindings(
        [entry('root', 'settled', settled), entry('detail', 'entering', push)],
        elements,
        402,
      ),
    ).toEqual([
      {
        binding: {
          direction: 'push',
          primary: elements.get('detail')?.motion,
          secondary: elements.get('root')?.screen,
          secondaryDim: elements.get('root')?.dim,
          width: 402,
        },
        controller: push,
      },
    ])
  })

  it('binds title tracks to their screen transforms and changes back visibility in place', () => {
    const settled = controller()
    const push = controller()
    const elements = new Map([
      ['root', screenElements('root')],
      ['detail', screenElements('detail')],
    ])
    const backButtonMask = { id: 'back-mask' } as unknown as HTMLElement
    const backButtonVisual = { id: 'back-visual' } as unknown as HTMLElement
    const rootTitle = { id: 'root-title' } as unknown as HTMLElement
    const detailTitle = { id: 'detail-title' } as unknown as HTMLElement

    expect(
      collectTransitionBindings(
        [entry('root', 'settled', settled), entry('detail', 'entering', push)],
        elements,
        402,
        {
          backButtonMask,
          backButtonVisual,
          backVisibleByEntry: new Map([
            ['root', false],
            ['detail', true],
          ]),
          titles: new Map([
            ['root', rootTitle],
            ['detail', detailTitle],
          ]),
        },
      )[0]?.binding,
    ).toMatchObject({
      backButtonMask,
      backButtonFromVisible: false,
      backButtonToVisible: true,
      backButtonVisual,
      primaryTitle: detailTitle,
      secondaryTitle: rootTitle,
    })
  })

  it("binds both entries' bar toolbars so a transition can fade them over", () => {
    const settled = controller()
    const push = controller()
    const entries = [entry('root', 'settled', settled), entry('detail', 'entering', push)]
    const elements = new Map(entries.map(item => [item.key, screenElements(item.key)]))
    const rootSlots = [{ id: 'root-trailing' } as unknown as HTMLElement]
    const detailSlots = [{ id: 'detail-trailing' } as unknown as HTMLElement]
    const binding = collectTransitionBindings(entries, elements, 402, {
      backVisibleByEntry: new Map(),
      titles: new Map(),
      toolbars: new Map([
        ['root', rootSlots],
        ['detail', detailSlots],
      ]),
    })[0]?.binding
    expect(binding).toMatchObject({ primaryToolbar: detailSlots, secondaryToolbar: rootSlots })
  })

  it('does not give a deep push ownership of the already-visible shared back control', () => {
    const settled = controller()
    const push = controller()
    const entries = [entry('middle', 'settled', settled), entry('top', 'entering', push)]
    const elements = new Map(entries.map(item => [item.key, screenElements(item.key)]))
    const binding = collectTransitionBindings(entries, elements, 402, {
      backButtonMask: { id: 'back-mask' } as unknown as HTMLElement,
      backButtonVisual: { id: 'back-visual' } as unknown as HTMLElement,
      backVisibleByEntry: new Map([
        ['middle', true],
        ['top', true],
      ]),
      titles: new Map(),
    })[0]?.binding

    expect(binding).not.toHaveProperty('backButtonMask')
    expect(binding).not.toHaveProperty('backButtonVisual')
  })

  it('animates pop-to-root as one visual top-to-root step', () => {
    const settled = controller()
    const popToRoot = controller()
    const entries = [
      entry('root', 'settled', settled),
      entry('middle', 'exiting', popToRoot),
      entry('top', 'exiting', popToRoot),
    ]
    const elements = new Map(entries.map(item => [item.key, screenElements(item.key)]))

    expect(collectTransitionBindings(entries, elements, 402)[0]?.binding).toEqual({
      direction: 'pop',
      primary: elements.get('top')?.motion,
      secondary: elements.get('root')?.screen,
      secondaryDim: elements.get('root')?.dim,
      width: 402,
    })
  })

  it('keeps distinct bindings for concurrent stacked pops', () => {
    const settled = controller()
    const firstPop = controller()
    const secondPop = controller()
    const entries = [
      entry('root', 'settled', settled),
      entry('middle', 'exiting', secondPop),
      entry('top', 'exiting', firstPop),
    ]
    const elements = new Map(entries.map(item => [item.key, screenElements(item.key)]))
    const bindings = collectTransitionBindings(entries, elements, 402)

    expect(bindings).toHaveLength(2)
    expect(bindings.find(item => item.controller === firstPop)?.binding).toEqual({
      direction: 'pop',
      primary: elements.get('top')?.motion,
      secondary: elements.get('middle')?.screen,
      secondaryDim: elements.get('middle')?.dim,
      width: 402,
    })
    expect(bindings.find(item => item.controller === secondPop)?.binding).toEqual({
      direction: 'pop',
      primary: elements.get('middle')?.motion,
      secondary: elements.get('root')?.screen,
      secondaryDim: elements.get('root')?.dim,
      width: 402,
    })
  })
})

it('fades a placement owned only by the middle screen when popping to root', () => {
  const settled = controller()
  const pop = controller()
  const entries = [
    entry('root', 'settled', settled),
    entry('middle', 'exiting', pop),
    entry('top', 'exiting', pop),
  ]
  const elements = new Map(entries.map(item => [item.key, screenElements(item.key)]))
  const middleSlot = {
    childElementCount: 1,
    dataset: { satinNavigationToolbarSlot: 'bottom' },
  } as unknown as HTMLElement
  const topSlot = {
    childElementCount: 1,
    dataset: { satinNavigationToolbarSlot: 'trailing' },
  } as unknown as HTMLElement
  const [transition] = collectTransitionBindings(entries, elements, 440, {
    titles: new Map(),
    backVisibleByEntry: new Map(),
    toolbars: new Map([
      ['top', [topSlot]],
      ['middle', [middleSlot]],
    ]),
  })
  expect(transition!.binding.primaryToolbar).toEqual([topSlot, middleSlot])
})
