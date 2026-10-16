import { settingsChromeTokens } from '../../settings/tokens.ts'
import { MENU_BUTTON, type MenuMotionFrame } from './menuMotion.ts'

/** Toolbar endpoint projection of the retained 7o motion. Fit samples and time
 * remain unchanged; the measured toolbar capsule replaces only the closed end.
 * Idempotence lets the hybrid and ordinary presenter share the same boundary. */
export function projectToolbarMenu(frame: MenuMotionFrame, toolbar = false): MenuMotionFrame {
  if (!toolbar || frame.toolbarProjected) return frame
  const closed = 1 - Math.max(0, Math.min(1, frame.openProgress))
  const dw = (settingsChromeTokens.menuToolbarWidthPx - MENU_BUTTON.diameter) / 2
  const dh = (settingsChromeTokens.menuToolbarHeightPx - MENU_BUTTON.diameter) / 2
  const part = (shape: MenuMotionFrame['shape']['first']) => ({
    ...shape,
    centerY: shape.centerY + settingsChromeTokens.menuToolbarPanelOffsetYPx * (1 - closed),
    halfWidth: shape.halfWidth + dw * closed,
    halfHeight: shape.halfHeight + dh * closed,
    radius: Math.min(shape.radius, shape.halfHeight + dh * closed),
  })
  return {
    ...frame,
    toolbarProjected: true,
    itemOffsetY: settingsChromeTokens.menuToolbarPanelOffsetYPx,
    shape: {
      ...frame.shape,
      first: part(frame.shape.first),
      second: frame.shape.second ? part(frame.shape.second) : undefined,
    },
  }
}
