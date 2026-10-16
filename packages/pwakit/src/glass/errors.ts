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
// Independent of diagnostic history. Only a reconstructed adapter outage can clear fallback.
let fallbackRequired = false
let permanentFallback = false
let adapterRecoveryPending = false
const fallbackListeners = new Set<() => void>()
export function subscribeGlassFallback(listener: () => void) {
  fallbackListeners.add(listener)
  return () => {
    fallbackListeners.delete(listener)
  }
}
/** Successful resource reconstruction can retire only an adapter-outage fallback. */
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
    if (!adapterRecoveryPending || (code !== 'adapter-unavailable' && code !== 'readiness-timeout'))
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
