import { expect, it } from 'vitest'
import { staleResumeState, type ResumeReadout } from './resumeOverlay.ts'

const readout = (
  accessory: Partial<NonNullable<NonNullable<ResumeReadout['minimize']>['accessory']>> = {},
  minimize: Partial<NonNullable<ResumeReadout['minimize']>> = {},
): ResumeReadout => ({
  lifecycle: { hides: 3, resumes: 3, hidden: false },
  compact: true,
  minimize: {
    active: false,
    direction: 'collapse',
    compactLayout: true,
    accessoryRun: false,
    timelineOffset: -12,
    accessory: {
      run: false,
      motion: false,
      ink: null,
      width: null,
      readyInk: 398,
      reach: null,
      animations: 0,
      ...accessory,
    },
    ...minimize,
  },
  renderer: { visible: true, tracks: [], duplicatePresenters: [], presenters: 1 },
})

it('marks run-owned accessory state that outlives its run', () => {
  expect(staleResumeState(readout())).toEqual([])
  // The owner's recording: an envelope-wide capsule whose ink stays hidden after the run.
  expect(staleResumeState(readout({ run: true, ink: 'true', width: '398px' }))).toEqual([
    'accessory run',
    'ink hidden',
    'width 398px',
  ])
  // While a transaction runs, the same state is its own.
  expect(staleResumeState(readout({ ink: 'true' }, { active: true }))).toEqual([])
  expect(staleResumeState(readout({}, { timelineOffset: -5000 }))).toEqual(['timeline -5000 ms'])
})
