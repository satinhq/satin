import type { SafeAreaMetrics } from './useSafeAreaMetrics.ts'
import { readDeviceIdiom } from '../layout/deviceIdiom.ts'

/** iOS 27.0 (24A434): native back origin in the measured 375 pt mini and
 * 473 pt Pro floating windows. See parity/calibrations/ipad-ios27.json.
 * WebKit reports content insets, but does not reserve horizontal toolbar space
 * for the OS window controls. Keep this clearance separate from safe-area padding.
 */
export function windowControlsBackInset(
  metrics: Pick<SafeAreaMetrics, 'standalone' | 'screen' | 'layoutViewport'>,
): number {
  const shortScreen = Math.min(metrics.screen.width, metrics.screen.height)
  return metrics.standalone &&
    readDeviceIdiom() === 'pad' &&
    metrics.layoutViewport.width < shortScreen
    ? 78
    : 0
}
