// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { ProductionGlassRuntime } from './production.ts'
import { backdropOwner } from './backdropLayers.ts'
import { openModal } from '../../modal/lifecycle.ts'
afterEach(() => document.body.replaceChildren())
it.each(['entrance', 'drag', 'dismissal'])(
  'keeps page chrome below modal planes during %s',
  phase => {
    const page = document.createElement('main')
    const sheet = document.createElement('dialog')
    const nested = document.createElement('dialog')
    document.body.append(page, sheet, nested)
    for (const dialog of [sheet, nested]) {
      vi.spyOn(dialog, 'matches').mockImplementation(selector => selector === ':modal')
      openModal(dialog)
      dialog.setAttribute('data-satin-presentation-moving', phase)
    }
    const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
    Object.assign(runtime, {
      options: {
        appearance: 'light',
        menuEnabled: false,
        elements: { contentHost: page },
        geometry: {
          width: 440,
          height: 956,
          dockWidth: 400,
          dockHeight: 64,
          dockX: 20,
          dockY: 858,
          dockRadius: 32,
          physicalTopInset: 62,
          circleSize: 44,
          circleY: 70,
          leftX: 20,
          rightX: 376,
          bottomInset: 34,
          surfaceMode: 'chrome',
          tabBarSelectedIndex: 0,
        },
      },
      menuResting: () => true,
    })
    expect(runtime.currentSpecs().find(spec => spec.id === 'dock')?.backdropExclusions).toEqual([
      backdropOwner(sheet),
      backdropOwner(nested),
    ])
  },
)

it('defers playback damage during a presented menu morph but admits required coverage', async () => {
  const menu = document.createElement('div')
  menu.dataset.satinMenuPanel = 'true'
  menu.dataset.satinMenuPhase = 'pending'
  menu.dataset.satinMenuRows = 'glass'
  document.body.append(menu)
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  const prepare = vi.fn().mockResolvedValue(undefined)
  const runtime = Object.create(ProductionGlassRuntime.prototype) as ProductionGlassRuntime
  Object.assign(runtime, {
    attached: true,
    options: { elements: {} },
    lastScrollAt: -Infinity,
    prepare,
  })
  try {
    // Initial glass still needs a capture. The menu presents before that queued frame runs.
    runtime.schedulePrepare()
    expect(frames).toHaveLength(1)
    menu.dataset.satinMenuPhase = 'open'
    frames.shift()!(0)
    expect(prepare).not.toHaveBeenCalled()
    runtime.schedulePrepare()
    expect(frames).toHaveLength(0)
    menu.dataset.satinMenuPhase = 'closing'
    runtime.schedulePrepare()
    expect(frames).toHaveLength(0)
    runtime.schedulePrepare(true, true)
    frames.shift()!(0)
    expect(prepare).toHaveBeenCalledOnce()
    menu.remove()
    runtime.schedulePrepare()
    frames.shift()!(0)
    expect(prepare).toHaveBeenCalledTimes(2)
  } finally {
    vi.unstubAllGlobals()
  }
})
