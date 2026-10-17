// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import {
  snapshotMenuTrigger,
  menuTriggerSnapshot,
  mapTriggerSnapshot,
} from './menuTriggerSnapshot.ts'
import { setGlassShapeTrack } from './shapeTrackRegistry.ts'
import { bindToolbarMaterialContent } from './toolbarMaterialContext.ts'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

it('keeps one source aperture and member pose through asynchronous work and envelope retirement', async () => {
  const owner = document.createElement('div')
  const member = document.createElement('button')
  document.body.append(owner, member)
  Object.assign(owner.style, {
    position: 'absolute',
    left: '280px',
    top: '66px',
    width: '120px',
    height: '44px',
  })
  vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(new DOMRect(324, 352.8, 96, 35.2))
  const memberRect = vi
    .spyOn(member, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(340, 356, 48, 28.8))
  bindToolbarMaterialContent(owner, member)
  vi.spyOn(performance, 'now').mockReturnValue(120)
  setGlassShapeTrack(owner, {
    epoch: performance.timeOrigin,
    duration: 240,
    frames: [
      { x: 80, y: 0, width: 40, height: 44 },
      { x: 0, y: 0, width: 120, height: 44 },
    ],
    radii: [4, 20],
  })
  const snapshot = snapshotMenuTrigger(owner)!
  expect(snapshot.aperture.width).toBe(64)
  await Promise.resolve()
  // Both live ink and material have moved while capture was waiting for a decoded image.
  memberRect.mockReturnValue(new DOMRect(800, 900, 60, 40))
  Object.assign(owner.style, { left: '360px', width: '40px' })
  const mapped = mapTriggerSnapshot(snapshot, { x: 360, y: 66, width: 40, height: 44 })
  expect(mapped.aperture.x).toBe(320)
  expect(mapped.aperture.width).toBe(80)
  expect(mapped.members[0]!.bounds.x).toBe(300)
  expect(mapped.members[0]!.bounds.width).toBe(60)
  expect(menuTriggerSnapshot(owner, snapshot.id)).toBe(snapshot)
  const successor = snapshotMenuTrigger(owner)!
  expect(menuTriggerSnapshot(owner, snapshot.id)).toBeUndefined()
  expect(menuTriggerSnapshot(owner, successor.id)).toBe(successor)
})

it('leaves ordinary untracked triggers on their existing capture path', () => {
  expect(snapshotMenuTrigger(document.createElement('button'))).toBeUndefined()
})
