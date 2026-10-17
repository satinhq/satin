function scriptAttributes(source: string) {
  const attributes = new Map<string, { value: string; original: string }>()
  const pattern = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g
  for (const match of source.matchAll(pattern)) {
    const name = match[1]!.toLowerCase()
    const quotedValue = match[2] ?? ''
    const value = /^["']/.test(quotedValue) ? quotedValue.slice(1, -1) : quotedValue
    if (!attributes.has(name)) attributes.set(name, { value, original: match[0] })
  }
  return attributes
}

/**
 * A redirect cannot cancel deferred modules. Convert executable app scripts
 * after Vite has emitted its entry tags, so even their imports wait for the gate.
 * Preloads can still fetch bytes, but no app module evaluates on a blocked page.
 */
export function gateAppScripts(html: string) {
  if (!html.includes('id="satin-platform-gate"')) return html
  const scriptPattern =
    /<!--[\s\S]*?-->|<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi
  const scripts = [...html.matchAll(scriptPattern)].filter(match => match[1] !== undefined)
  const gate = scripts.find(
    match => scriptAttributes(match[1]!).get('id')?.value === 'satin-platform-gate',
  )
  const firstScript = scripts[0]
  // Vite and React prepend development scripts after Satin's pre hook.
  // Move only DOM-free admission before parser loaders. Head initialization
  // remains after the metadata and links it reads.
  if (gate && firstScript && firstScript.index < gate.index) {
    html =
      html.slice(0, firstScript.index) +
      gate[0] +
      html.slice(firstScript.index, gate.index) +
      html.slice(gate.index + gate[0].length)
  }
  // Fetch app styles without blocking the independent head environment. The
  // head's capture listener activates each stylesheet only after it loads.
  html = html.replace(/<link\b[^>]*>/gi, tag => {
    const attributes = scriptAttributes(tag.slice(5, -1))
    if (attributes.get('rel')?.value !== 'stylesheet') return tag
    const media = attributes.get('media')?.value ?? 'all'
    return tag
      .replace(/\smedia\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
      .replace(/>$/, ` media="not all" data-satin-style="${media.replaceAll('"', '&quot;')}">`)
  })
  return html.replace(scriptPattern, (original, attributes: string | undefined) => {
    if (attributes === undefined) return original
    // Parse whole values so neither data-id nor quoted text can impersonate
    // a framework ID. CSP plugins may place a nonce before the actual ID.
    const parsedAttributes = scriptAttributes(attributes)
    const id = parsedAttributes.get('id')?.value
    if (
      id === 'satin-platform-gate' ||
      id === 'satin-head-init' ||
      id === 'satin-launch-cover' ||
      (id === 'satin-deployment' && parsedAttributes.get('type')?.value === 'application/json')
    ) {
      return original
    }
    // Wrap all other script types, including data and import maps. Reinserting
    // their original tags preserves browser parsing without guessing which
    // encoded type attributes the engine would treat as executable.
    const script = JSON.stringify(original).replaceAll('<', '\\u003c')
    const nonce = parsedAttributes.get('nonce')?.original ?? ''
    // These loaders are synchronous parser scripts. Reinsert allowed scripts
    // into that parser so modules/defer still precede DOMContentLoaded and
    // classic scripts retain their original ordering and attributes.
    return `<script ${nonce} data-satin-script-loader>if (window.__SATIN_PLATFORM_BLOCKED__ === false) {
      const script = ${script};
      const nonce = document.currentScript && document.currentScript.nonce;
      // Vite injects html.cspNonce after this transform. Read the final wrapper
      // nonce at execution time and give it to the script the parser receives.
      document.write(nonce ? script.replace(/^<script\\b/i,
        '<script nonce="' + nonce.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"') : script);
    }</script>`
  })
}
