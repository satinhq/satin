// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { GlassButton } from './GlassEffect.tsx'
import { MaterialEffectContext } from './liquidContext.ts'
import { GlassRegionRegistry } from './regionRegistry.ts'
let dark = false
vi.mock('../app/appearance.ts', () => ({ useDarkAppearance: () => dark }))

it('retires accent material when disabled, updates appearance, and restores the authored tint', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect() {},
    getImageData: () => ({ data: [255, 0, 0, 255] }),
  } as never)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const regions = new GlassRegionRegistry()
  const render = (disabled: boolean) =>
    act(() =>
      root.render(
        <MaterialEffectContext value={{ regions, ready: true, registerTabs() {} }}>
          <GlassButton
            buttonStyle="glassProminent"
            tint="red"
            disabled={disabled}
            onPress={() => {}}
          >
            Done
          </GlassButton>
        </MaterialEffectContext>,
      ),
    )
  const material = () => regions.values()[0]!.descriptor.material
  try {
    render(false)
    expect(material().tint).toEqual([1, 0, 0, 1])
    render(true)
    expect(material().tint).toEqual([209 / 255, 209 / 255, 213 / 255, 1])
    expect(material().interactive).toBe(false)
    dark = true
    render(true)
    expect(material().tint).toEqual([80 / 255, 80 / 255, 81 / 255, 1])
    render(false)
    expect(material().tint).toEqual([1, 0, 0, 1])
    expect(material().interactive).toBe(true)
  } finally {
    act(() => root.unmount())
    host.remove()
    dark = false
    vi.restoreAllMocks()
  }
})
