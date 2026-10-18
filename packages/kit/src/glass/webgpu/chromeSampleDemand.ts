import { PAD_SEARCH_BAR_TRAVEL } from '../../search/padSearchBarMotion.ts'
import type { RuntimeGeometry, SurfaceRenderSpec } from '../renderSpecs.ts'
import type { SampleRect } from './captureBands.ts'

/** Source rows needed by a chrome surface, including its sampling halo. */
export function chromeSampleDemand(
  spec: SurfaceRenderSpec,
  placement: RuntimeGeometry['tabBarPlacement'],
): SampleRect {
  // Search translates a top tab bar offscreen. Typing may recapture its hidden
  // endpoint, but dismissal reuses those pixels throughout the measured return.
  // Reserve the same source rows in either state, before any animation starts.
  const travel = spec.id === 'dock' && placement === 'top' ? PAD_SEARCH_BAR_TRAVEL : 0
  const shownY = spec.frameY + travel * (1 - (spec.opacity ?? 1))
  return [
    spec.frameX - spec.sampleInsetX,
    shownY - travel - spec.sampleInsetY,
    spec.sampleWidth,
    spec.sampleHeight + travel,
  ]
}
