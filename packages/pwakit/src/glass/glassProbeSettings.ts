import { useDarkAppearance } from '../app/appearance.ts'
import { isBitmapBackdrop } from './lens/bitmapBackdrop.ts'
import { STRIPE_BACKGROUND_MODES, TINT_BACKGROUND_MODES } from './lens/referenceBackground.ts'
import type { LiquidMotionMode } from './lens/liquidMotion.ts'
import type { ContentPage } from './lens/tabPresentation.ts'
import type { Appearance } from './lens/theme.ts'
import type { LensMode } from './renderSpecs.ts'

// The glass probe page's settings (GlassPresentation without a consumer): URL parameters and
// their persisted localStorage flags, and the measurement client identity.

export function requestedAppearance(): Appearance | undefined {
  const value = new URLSearchParams(window.location.search).get('theme')
  return value === 'dark' || value === 'light' ? value : undefined
}

export function requestedLiquidMotion(): LiquidMotionMode {
  const value = new URLSearchParams(window.location.search).get('motion')
  if (value === 'pill' || value === 'press' || value === 'merge' || value === 'none') {
    persistFlag('motion', value)
    return value
  }
  const stored = storedFlag('motion', 'none')
  return stored === 'pill' || stored === 'press' || stored === 'merge' ? stored : 'none'
}

export function requestedMenu() {
  const motion = new URLSearchParams(window.location.search).get('motion')
  return motion === null || motion === 'menu'
}

export function useAppearance() {
  const explicit = requestedAppearance()
  const dark = useDarkAppearance()
  return explicit ?? (dark ? 'dark' : 'light')
}

export function formatMetric(value: number, digits = 1) {
  return value > 0 ? value.toFixed(digits) : '--'
}

export function storedFlag(key: string, fallback: string) {
  const fromUrl = new URLSearchParams(window.location.search).get(key)
  if (fromUrl !== null) {
    try {
      localStorage.setItem(`satinGeometry-flag-${key}`, fromUrl)
    } catch {
      /* ignore */
    }
    return fromUrl
  }
  try {
    return localStorage.getItem(`satinGeometry-flag-${key}`) ?? fallback
  } catch {
    return fallback
  }
}

export function persistFlag(key: string, value: string) {
  try {
    localStorage.setItem(`satinGeometry-flag-${key}`, value)
  } catch {
    /* ignore */
  }
}

function randomClientId() {
  // crypto.randomUUID is only defined in secure contexts; LAN http:// phone
  // testing is insecure, so fall back to getRandomValues-based v4.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function measurementClientId() {
  const key = 'satinMeasurement-measurement-client:v1'
  try {
    const stored = localStorage.getItem(key)
    if (stored) return stored
    const created = randomClientId()
    localStorage.setItem(key, created)
    return created
  } catch {
    return randomClientId()
  }
}

const LENS_STORAGE_KEY = 'satinLens-lens:v1'
// measured-reference removes the capture-only `?slow` fork; retained motion uses measured playback speed.
export const LIQUID_PLAYBACK_SPEED = 1

export function isLensMode(value: string | null): value is LensMode {
  return value === 'reference-regular' || value === 'reference-clear'
}

export function storedLens(): LensMode {
  const fromUrl = new URLSearchParams(window.location.search).get('lens')
  if (fromUrl !== null) {
    const mode = isLensMode(fromUrl) ? fromUrl : 'reference-regular'
    try {
      localStorage.setItem(LENS_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
    return mode
  }
  try {
    const stored = localStorage.getItem(LENS_STORAGE_KEY)
    if (isLensMode(stored)) return stored
    return 'reference-regular'
  } catch {
    return 'reference-regular'
  }
}

export function persistLens(mode: LensMode) {
  try {
    localStorage.setItem(LENS_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

function isContentPage(value: string | null): value is ContentPage {
  return (
    isBitmapBackdrop(value) ||
    value === 'drag' ||
    value === 'settings' ||
    value === 'shapes' ||
    value === 'wallpaper' ||
    TINT_BACKGROUND_MODES.some(mode => mode === value) ||
    STRIPE_BACKGROUND_MODES.some(mode => mode === value)
  )
}

export function storedPage(): ContentPage {
  const value = storedFlag('page', 'settings')
  return isContentPage(value) ? value : 'settings'
}

export function lensLabel(mode: LensMode) {
  return mode === 'reference-clear' ? 'Clear' : 'Regular'
}
