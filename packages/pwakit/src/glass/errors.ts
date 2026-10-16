import { automaticGlassFallbackAllowed, strictGlassRequested } from './failurePolicy.ts'
import { recordGraphicsEvent } from '../graphicsProbe.ts'
/** Serializable across the renderer worker boundary. Release failures may select the fallback material. */
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
let adapterRecoveryPending = false
let transportRecoveryPending = false
let nextTransportRetry = 0
let transportFailures = 0
const fallbackListeners = new Set<() => void>()
export function subscribeGlassFallback(listener: () => void) {
  fallbackListeners.add(listener)
  return () => {
    fallbackListeners.delete(listener)
  }
}
/** Retire a device outage only after resource reconstruction and presentation settle. */
export function setGlassAdapterRecovery(pending: boolean) {
  adapterRecoveryPending = pending
  if (!pending && fallbackRequired && !permanentFallback) {
    fallbackRequired = false
    for (const listener of fallbackListeners) listener()
  }
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
  const release = automaticGlassFallbackAllowed()
  if (release && !error.recovering) {
    const transportFailure =
      code === 'worker-startup' ||
      (!adapterRecoveryPending &&
        ['adapter-unavailable', 'device-request', 'readiness-timeout'].includes(code)) ||
      (code === 'presentation' &&
        /import.*module|module.*script|loading.*chunk|load failed/i.test(message))
    if (transportFailure) {
      transportRecoveryPending = true
      nextTransportRetry = Date.now() + Math.min(3000 * 2 ** transportFailures++, 30_000)
    } else if (
      !adapterRecoveryPending ||
      ['gpu-unavailable', 'unsupported-configuration', 'shader-compilation', 'validation'].includes(
        code,
      )
    )
      permanentFallback = true
    fallbackRequired = true
    for (const listener of fallbackListeners) listener()
  }
  // Exhausted null-adapter bursts remain retryable in strict development. Release
  // apps use CSS now; they must not wait for another foreground event to launch.
  if (transient && !release) return error
  console.error(`[Satin glass: ${code}] ${stage}: ${error.message}`, reason ?? '')
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('satin-glass-error', { detail: error }))
  for (const listener of listeners) listener(error)
  return error
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

/** Retry a failed transport on a visible page; device reconstruction keeps its own owner. */
export function watchGlassTransportRecovery() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const retry = () => {
    clearTimeout(timer)
    if (
      !fallbackRequired ||
      permanentFallback ||
      !transportRecoveryPending ||
      adapterRecoveryPending
    )
      return
    if (document.visibilityState !== 'visible') return
    const delay = nextTransportRetry - Date.now()
    if (delay > 0) {
      timer = setTimeout(retry, delay)
      return
    }
    transportRecoveryPending = false
    fallbackRequired = false
    for (const listener of fallbackListeners) listener()
  }
  document.addEventListener('visibilitychange', retry)
  window.addEventListener('pageshow', retry)
  window.addEventListener('focus', retry)
  retry()
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', retry)
    window.removeEventListener('pageshow', retry)
    window.removeEventListener('focus', retry)
  }
}
