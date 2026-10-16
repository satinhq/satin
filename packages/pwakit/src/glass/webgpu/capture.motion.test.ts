// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { measureMirrorLayout } from '../lens/Scene.tsx'
import { measureProductionSource } from './capture.ts'
vi.mock('../lens/Scene.tsx', () => ({
  measureMirrorLayout: vi.fn(),
  measureMirrorLayoutRelative: vi.fn(),
  lastUnstableMeasurement: '',
}))
afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('waits out a sheet transition that starts after source preparation was scheduled', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  const sheet = document.createElement('dialog')
  document.body.append(host, sheet)
  sheet.setAttribute('data-satin-presentation-moving', 'dismissal')
  const layout = {
    width: 440,
    contentHeight: 956,
    nodes: [],
    measuredAt: 0,
    screen: 'root' as const,
  }
  vi.mocked(measureMirrorLayout).mockImplementation(() =>
    sheet.hasAttribute('data-satin-presentation-moving') ? undefined : layout,
  )
  // An ordinary sheet dismissal lasts longer than the old eight-frame retry budget.
  setTimeout(() => sheet.removeAttribute('data-satin-presentation-moving'), 500)
  const result = expect(measureProductionSource(host)).resolves.toMatchObject({ layout })
  await vi.advanceTimersByTimeAsync(600)
  await result
})
it('still rejects an unstable source when no framework transition explains it', async () => {
  vi.useFakeTimers()
  vi.mocked(measureMirrorLayout).mockReturnValue(undefined)
  const result = expect(measureProductionSource(document.createElement('div'))).rejects.toThrow(
    'Glass source moved during all 8 layout measurement attempts',
  )
  await vi.advanceTimersByTimeAsync(200)
  await result
})

it('captures the settled search layout when a content mutation arrives during dismissal', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  host.setAttribute('data-satin-search-moving', '')
  const layout = (text: string) => ({
    width: 440,
    contentHeight: 956,
    nodes: [
      {
        id: 'content',
        kind: 'text' as const,
        text,
        color: '#fff',
        x: 0,
        y: 0,
        width: 100,
        height: 20,
      },
    ],
    measuredAt: 0,
    screen: 'root' as const,
  })
  vi.mocked(measureMirrorLayout).mockImplementation(() =>
    layout(host.hasAttribute('data-satin-search-moving') ? 'intermediate' : 'settled'),
  )
  const capture = measureProductionSource(host)
  setTimeout(() => host.removeAttribute('data-satin-search-moving'), 500)
  await vi.advanceTimersByTimeAsync(600)
  expect((await capture).layout.nodes[0]?.text).toBe('settled')
})

it('does not defer an unrelated source for another screen search motion', async () => {
  const host = document.createElement('div')
  const other = document.createElement('div')
  other.setAttribute('data-satin-search-moving', '')
  document.body.append(host, other)
  const layout = {
    width: 440,
    contentHeight: 956,
    nodes: [],
    measuredAt: 0,
    screen: 'root' as const,
  }
  vi.mocked(measureMirrorLayout).mockReturnValue(layout)
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
  expect((await measureProductionSource(host)).layout).toBe(layout)
  expect(raf).not.toHaveBeenCalled()
})
