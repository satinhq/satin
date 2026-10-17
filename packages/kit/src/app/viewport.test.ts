// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { resolveViewportFit } from './viewportValue.ts'
import { installViewportPolicy } from './viewport.ts'
import { ADAPTIVE_LAYOUT_POLICY as policy } from '../layout/layoutClass.ts'
const fit = (ua: string, width: number, height: number, platform = 'iPhone') =>
  resolveViewportFit(
    'adaptive',
    ua,
    platform,
    5,
    width,
    height,
    policy.horizontal.regularMinimum,
    policy.vertical.regularMinimum,
  )
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-satin-viewport-fit')
})
it('keeps both phone orientations fitted; opens regular phone windows without model tables', () => {
  expect(fit('iPhone', 440, 894)).toBe('auto')
  expect(fit('iPhone', 956, 440)).toBe('auto')
  expect(fit('iPhone Duo', 667, 900)).toBe('auto')
  expect(fit('iPhone Duo', 668, 900)).toBe('cover')
  expect(fit('iPhone Duo', 800, 499)).toBe('auto')
  expect(fit('iPhone Duo', 800, 500)).toBe('cover')
})
it('fits iPad in both orientations, compact split and Stage Manager windows', () => {
  for (const width of [320, 409, 667, 668, 744, 1032]) {
    expect(fit('iPad', width, 420, 'iPad')).toBe('auto')
    expect(fit('Macintosh', width, 420, 'MacIntel')).toBe('auto')
  }
  expect(fit('iPad', 1032, 1376, 'iPad')).toBe('auto')
  expect(fit('iPad', 1376, 1032, 'iPad')).toBe('auto')
  expect(fit('Macintosh', 440, 894, 'Mac')).toBe('cover')
})
it('respects every explicit override', () => {
  for (const override of ['auto', 'cover', 'contain'] as const) {
    expect(resolveViewportFit(override, 'iPhone', 'iPhone', 5, 440, 894, 668, 500)).toBe(override)
    expect(resolveViewportFit(override, 'iPad', 'MacIntel', 5, 1032, 1376, 668, 500)).toBe(override)
  }
})
it('owns resize and cleanup without deleting other viewport directives', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  vi.stubGlobal('innerWidth', 440)
  vi.stubGlobal('innerHeight', 894)
  const meta = document.createElement('meta')
  meta.name = 'viewport'
  meta.content = 'original'
  document.head.append(meta)
  const restore = installViewportPolicy()
  expect(meta.content).toContain('viewport-fit=auto')
  expect(meta.content).toContain('maximum-scale=1, user-scalable=no')
  vi.stubGlobal('innerWidth', 800)
  vi.stubGlobal('innerHeight', 900)
  window.dispatchEvent(new Event('resize'))
  expect(meta.content).toContain('viewport-fit=cover')
  restore()
  expect(meta.content).toBe('original')
  expect(document.documentElement.hasAttribute('data-satin-viewport-fit')).toBe(false)
})

it('preserves the keyboard adapter baseline when a regular phone window focuses a field', async () => {
  const adapter = await import('../keyboard/adapter.ts')
  vi.spyOn(adapter, 'readKeyboardLayoutHeight').mockReturnValue(900)
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
  vi.stubGlobal('innerWidth', 800)
  vi.stubGlobal('innerHeight', 400)
  const restore = installViewportPolicy()
  expect(document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content).toContain(
    'viewport-fit=cover',
  )
  restore()
})
