/** Explicit strict glass always wins, even over an explicit fallback request. */
export function strictGlassRequested() {
  if (import.meta.env.SATIN_STRICT_GLASS === true || import.meta.env.SATIN_STRICT_GLASS === '1')
    return true
  if (typeof document === 'undefined') return false
  const query = new URLSearchParams(window.location.search).get('glass')
  const attribute = document.documentElement.dataset.satinGlass
  return (
    query === 'strict' ||
    attribute === 'strict' ||
    query === 'webgpu' ||
    (query === null && attribute === 'webgpu')
  )
}

let webgpuWorked = false

/** A later adapter outage on a working device is a renderer failure, not missing capability. */
export function markGlassWebGPUCapable() {
  webgpuWorked = true
}

export function glassWebGPUWasCapable() {
  return webgpuWorked
}

export function glassCapabilityUnavailable(failure: { code: string; message: string }) {
  return (
    failure.code === 'gpu-unavailable' ||
    /GlassCapabilityUnavailable:/.test(failure.message) ||
    failure.message.includes('navigator.gpu.requestAdapter returned null')
  )
}

/** Release apps recover broadly. Development only tolerates missing startup capability. */
export function automaticGlassFallbackAllowed(failure?: { code: string; message: string }) {
  if (typeof document === 'undefined' || strictGlassRequested()) return false
  if (import.meta.env.MODE === 'test') return false
  if (import.meta.env.DEV === false) return true
  return (
    import.meta.env.DEV === true &&
    !webgpuWorked &&
    (failure?.code === 'gpu-unavailable' ||
      (failure?.code === 'adapter-unavailable' &&
        failure.message.includes('navigator.gpu.requestAdapter returned null')))
  )
}
