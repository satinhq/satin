/** URL policy shared by framework web handoffs. Unknown schemes fail closed. */
export function webURL(input: string, base: string): URL | null {
  try {
    const url = new URL(input, base)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

export function secureWebURL(input: string, base: string): URL {
  const url = webURL(input, base)
  const loopback = url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (!url || (url.protocol !== 'https:' && !loopback))
    throw new Error('Web authentication requires HTTPS or a loopback origin')
  return url
}
