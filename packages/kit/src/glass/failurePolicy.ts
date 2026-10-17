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

/** Release apps keep working. Development and test modes never demote implicitly. */
export function automaticGlassFallbackAllowed() {
  return (
    import.meta.env.DEV === false &&
    import.meta.env.MODE !== 'test' &&
    typeof document !== 'undefined' &&
    !strictGlassRequested()
  )
}
