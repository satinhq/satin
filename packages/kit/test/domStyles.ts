import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'

/** Declaration tests use DOM emulators whose cascade does not implement @layer.
 * Unwrap only Satin's outer layer so those tests still exercise every original
 * declaration. Vite integration tests and WebKit captures use the real, layered
 * file and own cascade-order acceptance. Never use this in a browser fixture. */
export function frameworkStyleDeclarations() {
  const source = readFileSync(new NodeURL('../src/styles.css', import.meta.url), 'utf8')
  const wrapped = source.match(
    /^(?:\/\*[\s\S]*?\*\/\s*)?@layer theme, base, satin, components, utilities;\s*@layer satin \{\n([\s\S]*)\n\}\s*$/,
  )
  if (!wrapped)
    throw new Error('Update the DOM declaration fixture for the framework layer structure.')
  return wrapped[1]!
}
