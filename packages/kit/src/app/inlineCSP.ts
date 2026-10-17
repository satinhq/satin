import { createHash } from 'node:crypto'

/** Add these sources to a deployment's existing policy. Satin does not impose
 * a site-wide CSP. Hashes cover exact final bytes, including the shadow style. */
export function inlinePolicySources(html: string, shadowStyle: string) {
  const digest = (value: string) =>
    `'sha256-${createHash('sha256').update(value).digest('base64')}'`
  const scripts = new Set<string>()
  const styles = new Set<string>([digest(shadowStyle)])
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\b(?:src|type\s*=\s*["']application\/json)/i.test(match[1]!) || !match[2]!.trim()) continue
    scripts.add(digest(match[2]!))
    // Platform admission reinserts the original parser script. A hash policy
    // must admit that script as well as the small admission wrapper.
    const original = match[2]!.match(/const script = ("(?:[^"\\]|\\.)*");/)
    if (original) {
      const tag = JSON.parse(original[1]!) as string
      const body = tag.match(/<script\b([^>]*)>([\s\S]*?)<\/script>/i)
      if (body && !/\bsrc\s*=/.test(body[1]!) && body[2]!.trim()) scripts.add(digest(body[2]!))
    }
  }
  for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    styles.add(digest(match[1]!))
  return { scriptSrc: [...scripts], styleSrc: [...styles] }
}
