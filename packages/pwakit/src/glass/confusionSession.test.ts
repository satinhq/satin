import { describe, expect, it } from 'vitest'
import { makeConfusionSession, scoreConfusion, type ConfusionManifest } from './confusionSession.ts'
describe('recorded glass confusion session', () => {
  it('includes every comparison exactly once and keeps a stable answer for export', () => {
    const manifest: ConfusionManifest = {
      version: 'fixture',
      status: 'synthetic test',
      pending: [],
      pairs: Array.from({ length: 56 }, (_, i) => ({
        id: String(i),
        appearance: i % 2 ? 'dark' : 'light',
        state: 'bar',
        backdrop: 'test',
        kind: 'still',
        native: 'n.png',
        pwa: 'p.png',
        widthPt: 398,
        heightPt: 62,
        build: 'fixture',
      })),
    }
    const session = makeConfusionSession(manifest)
    expect(new Set(session.trials.map(t => t.pairId)).size).toBe(56)
    expect(session.trials.every(t => !t.revealed && !t.guess)).toBe(true)
    expect(JSON.parse(JSON.stringify(session))).toEqual(session)
    expect(scoreConfusion(session.trials).hitRate).toBeNull()
  })
  it('scores guesses independently of reveal state and excludes unscored trials', () => {
    const report = scoreConfusion([
      { pairId: 'a', nativeLeft: true, guess: 'left', revealed: false },
      { pairId: 'b', nativeLeft: false, guess: 'left', revealed: true },
      { pairId: 'c', nativeLeft: true, revealed: false },
    ])
    expect(report.count).toBe(2)
    expect(report.hitRate).toBe(0.5)
    expect(report.interval95![0]).toBeLessThan(0.1)
    expect(report.interval95![1]).toBeGreaterThan(0.9)
  })
})
