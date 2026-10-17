import type { GlassErrorCode } from '../errors.ts'
/** Classification retains the raw message; it never chooses a replacement. */
export function glassFailureCode(stage: string, cause: unknown): GlassErrorCode {
  const message = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
    text = stage + ' ' + message
  // Preserve the failed transport owner when a worker reports its own device loss.
  if (/worker.*(?:startup|runtime|transport|rejection)/i.test(text)) return 'worker-startup'
  if (/device\.lost|device.?lost/i.test(text)) return 'device-lost'
  if (/out.?of.?memory/i.test(text)) return 'out-of-memory'
  if (/shader compilation/i.test(text)) return 'shader-compilation'
  if (/GPUValidationError|validation/i.test(text)) return 'validation'
  if (/requestAdapter/i.test(text)) return 'adapter-unavailable'
  if (/navigator\.gpu|WebGPU.*unavailable/i.test(text)) return 'gpu-unavailable'
  if (/requestDevice|device acquisition|device recreation/i.test(text)) return 'device-request'
  if (/configure canvas|Offscreen WebGPU context/i.test(text)) return 'context-configure'
  if (/readiness|2\.5 seconds|2500 ms/i.test(text)) return 'readiness-timeout'
  if (/unsupported|invalid glass|Unknown.*(?:layer|region)|exceeds.*supported/i.test(text))
    return 'unsupported-configuration'
  return 'presentation'
}
