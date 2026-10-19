import {
  automaticGlassFallbackAllowed,
  glassWebGPUWasCapable,
  glassCapabilityUnavailable,
  markGlassWebGPUCapable,
  strictGlassRequested,
} from './failurePolicy.ts'
import { recordGraphicsEvent } from '../graphicsProbe.ts'
/** Why the glass renderer failed, such as `gpu-unavailable` or `device-lost`.
 * Releases can recover with fallback; development only tolerates missing startup capability. */
export type GlassErrorCode =
  | 'gpu-unavailable'
  | 'adapter-unavailable'
  | 'device-request'
  | 'context-configure'
  | 'device-lost'
  | 'validation'
  | 'out-of-memory'
  | 'shader-compilation'
  | 'worker-startup'
  | 'readiness-timeout'
  | 'presentation'
  | 'unsupported-configuration'
/** One glass renderer failure: its code, message, the stage it happened in and when. */
export type GlassError = Readonly<{
  code: GlassErrorCode
  message: string
  stage: string
  reason?: string
  at: number
  /** Null adapters can recover on the next foreground burst; history is diagnostic. */
  transient?: true
  /** The owner still has a bounded recovery attempt in flight. */
  recovering?: true
}>
const history: GlassError[] = []
// Diagnostic history survives recovery; it is not the fallback state.
let fallbackRequired = false
let permanentFallback = false
let recoveryAttempts = 0
let developmentFallbackNoticeShown = false
const fallbackListeners = new Set<() => void>()
export function subscribeGlassFallback(listener: () => void) {
  fallbackListeners.add(listener)
  return () => {
    fallbackListeners.delete(listener)
  }
}
/** A recovery signal proves this document previously owned a working GPU device.
 * Recovery can finish before fallback, but cannot retire an already disposed renderer's material. */
export function setGlassAdapterRecovery(pending: boolean) {
  if (pending) markGlassWebGPUCapable()
}
export function glassFallbackRequired() {
  return fallbackRequired
}
const listeners = new Set<(error: GlassError) => void>()
export function reportGlassError(
  code: GlassErrorCode,
  cause: unknown,
  stage: string,
  reason?: string,
  recovery?: { recovering: boolean },
): GlassError {
  // GPUError objects are not required to inherit from JavaScript Error.
  const message =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : cause !== null && typeof cause === 'object' && 'message' in cause
        ? String(cause.message)
        : String(cause)
  const transient =
    code === 'adapter-unavailable' &&
    !strictGlassRequested() &&
    (import.meta.env.DEV !== true ||
      import.meta.env.MODE === 'test' ||
      automaticGlassFallbackAllowed({ code, message })) &&
    message.includes('navigator.gpu.requestAdapter returned null')
  const error: GlassError = {
    code,
    message,
    stage,
    reason,
    at: Date.now(),
    ...(recovery?.recovering ? { recovering: true as const } : {}),
    ...(transient ? { transient: true as const } : {}),
  }
  recordGraphicsEvent('glass-error', { ...error })
  history.push(error)
  if (history.length > 100) history.shift()
  const release = automaticGlassFallbackAllowed(error)
  if (release && !error.recovering) {
    permanentFallback ||= !glassWebGPUWasCapable() && glassCapabilityUnavailable(error)
    fallbackRequired = true
    for (const listener of fallbackListeners) listener()
  }
  // Exhausted null-adapter bursts remain retryable in strict development. Release
  // apps use CSS now; they must not wait for another foreground event to launch.
  if (transient && !release) return error
  if (release && import.meta.env.DEV === true) showDevelopmentFallbackNotice()
  else console.error(`[Satin glass: ${code}] ${stage}: ${error.message}`, reason ?? '')
  // A release app that switched to the fallback material keeps running, so the
  // event says so. Launch must not turn a handled failure into "Unable to Open App".
  // A release renderer that is still recovering (e.g. a null adapter while it retries) also
  // keeps the app running, so it must not fail launch either.
  const handledByFallback = release
  if (typeof window !== 'undefined')
    window.dispatchEvent(
      new CustomEvent('satin-glass-error', {
        detail: handledByFallback ? { ...error, fallback: true } : error,
      }),
    )
  for (const listener of listeners) listener(error)
  return error
}

function showDevelopmentFallbackNotice() {
  if (developmentFallbackNoticeShown) return
  developmentFallbackNoticeShown = true
  const notice = document.createElement('div')
  notice.dataset.satinGlassNotice = 'true'
  notice.textContent = 'Glass: fallback material, WebGPU unavailable'
  notice.setAttribute('role', 'status')
  notice.style.cssText =
    'position:fixed;top:calc(var(--satin-inset-top,0px) + 4px);left:50%;transform:translateX(-50%);' +
    'z-index:2147483646;width:max-content;max-width:calc(100% - 24px);text-align:center;' +
    'padding:4px 8px;border-radius:6px;background:#242424;' +
    'color:white;font:11px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none'
  const root = document.querySelector('[data-satin-root]') ?? document.documentElement
  root.append(notice)
  // This is startup information, not a permanent overlay on navigation titles.
  // Observe the first interaction without cancelling or retargeting its input.
  const dismiss = () => {
    notice.remove()
    document.removeEventListener('pointerdown', dismiss, true)
    document.removeEventListener('keydown', dismiss, true)
  }
  document.addEventListener('pointerdown', dismiss, { capture: true, once: true })
  document.addEventListener('keydown', dismiss, { capture: true, once: true })
  console.info(notice.textContent)
}
export function subscribeGlassErrors(listener: (error: GlassError) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getGlassErrors(): readonly GlassError[] {
  return history.slice()
}

/** Called only after the material owner has exposed a settled GPU frame. */
export function completeGlassFallbackRecovery() {
  if (permanentFallback) return
  fallbackRequired = false
  for (const listener of fallbackListeners) listener()
}

/** The callback probes without relinquishing CSS. Five document attempts, then foreground only. */
export function watchGlassTransportRecovery(recover: () => Promise<boolean>) {
  if (permanentFallback || strictGlassRequested()) return () => {}
  let stopped = false
  let inFlight = false
  let foregroundCredits = 0
  let visible = document.visibilityState === 'visible'
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    if (stopped || permanentFallback || !fallbackRequired || !visible || inFlight) return
    if (!foregroundCredits && recoveryAttempts >= 5) return
    const delay = foregroundCredits ? 0 : Math.min(3000 * 2 ** recoveryAttempts, 30_000)
    timer = setTimeout(() => {
      if (stopped || !visible || permanentFallback || !fallbackRequired) return
      if (foregroundCredits) foregroundCredits--
      else recoveryAttempts++
      inFlight = true
      void recover()
        .catch(() => false)
        .finally(() => {
          inFlight = false
          schedule()
        })
    }, delay)
  }
  const visibility = () => {
    const next = document.visibilityState === 'visible'
    if (next && !visible) foregroundCredits++
    visible = next
    schedule()
  }
  document.addEventListener('visibilitychange', visibility)
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', visibility)
  }
}
