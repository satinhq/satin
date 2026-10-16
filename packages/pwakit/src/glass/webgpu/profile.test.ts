import { expect, it, vi } from 'vitest'
it('retains cold-start and readiness evidence after the rolling navigation buffer fills', async () => {
  vi.resetModules()
  const { receiveGlassTiming, glassProfile } = await import('./profile.ts')
  receiveGlassTiming({ stage: 'requestDevice', realm: 'worker', at: 1000, ms: 12 })
  receiveGlassTiming({ stage: 'first-present-complete', realm: 'worker', at: 1250, ms: 0 })
  receiveGlassTiming({ stage: 'production-prepared', realm: 'main', at: 1100, ms: 180 })
  for (let i = 0; i < 500; i++)
    receiveGlassTiming({ stage: 'transport', realm: 'worker', at: 2000 + i, ms: 1 })
  const report = glassProfile()
  expect(report.events).toHaveLength(240)
  expect(report.startup.map(e => e.stage)).toEqual(['requestDevice', 'first-present-complete'])
  expect(report.firstReady!.at + report.firstReady!.ms).toBe(1280)
  expect(report.firstPresent!.at).toBe(1250)
  expect(report.totals['worker:transport']).toEqual({ count: 500, ms: 500, maxMs: 1 })
})

it('does not build timing details when the diagnostic sink is disabled', async () => {
  vi.resetModules()
  const { glassTiming, setGlassTimingSink, glassProfile } = await import('./profile.ts')
  let built = 0,
    enabled = false
  const sent: string[] = []
  const detail = () => {
    built++
    return JSON.stringify({ nodes: [1, 2, 3].filter(Boolean).length })
  }
  glassTiming('without-sink', undefined, detail)
  setGlassTimingSink(
    event => sent.push(event.detail ?? ''),
    () => enabled,
  )
  glassTiming('disabled-sink', undefined, detail)
  expect(built).toBe(0)
  enabled = true
  glassTiming('enabled-sink', undefined, detail)
  expect(built).toBe(1)
  expect(sent).toEqual([JSON.stringify({ nodes: 3 })])
  expect(glassProfile().events.at(-1)?.detail).toBe(JSON.stringify({ nodes: 3 }))
})
