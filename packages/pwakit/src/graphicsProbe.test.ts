import { afterEach, expect, it, vi } from 'vitest'
import { installGraphicsProbe, recordGraphicsEvent } from './graphicsProbe.ts'
afterEach(() => vi.unstubAllGlobals())
it('records canvas copies and lifecycle events and restores hooks', () => {
  class Canvas {
    getContext() {
      return {}
    }
  }
  class Canvas2D {
    canvas = new Canvas()
    drawImage(_source: unknown) {}
  }
  vi.stubGlobal('HTMLCanvasElement', Canvas)
  vi.stubGlobal('CanvasRenderingContext2D', Canvas2D)
  const original = Canvas2D.prototype.drawImage
  const probe = installGraphicsProbe()
  try {
    const source = new Canvas()
    source.getContext()
    new Canvas2D().drawImage(source)
    recordGraphicsEvent('device-lost', { reason: 'test' })
    probe.frame(100)
    probe.frame(117)
    expect(probe.report().events.map(event => event.kind)).toEqual([
      'canvas-context',
      'canvas-copy',
      'device-lost',
    ])
    expect(probe.report().frames[1]).toMatchObject({ delta: 17 })
  } finally {
    probe.dispose()
  }
  expect(Canvas2D.prototype.drawImage).toBe(original)
})
