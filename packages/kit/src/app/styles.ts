import { fileURLToPath } from 'node:url'
import { normalizePath, type Plugin } from 'vite'

const stylesheet = normalizePath(fileURLToPath(new URL('../styles.css', import.meta.url)))
const legacyImport = '\0satin:included-styles'
const stylesheetUrl = '/@satin/framework.css'

export function frameworkStylesheet(base: string) {
  // Keep this a real stylesheet link: WebKit must load it before first paint.
  // Vite processes the link during builds and precaches the resulting CSS asset.
  return `<link rel="stylesheet" href="${base}${stylesheetUrl.slice(1)}">`
}

export function includedStyles(): Plugin {
  let serving = false
  let base = '/'
  return {
    name: 'satin:included-styles',
    enforce: 'pre',
    configResolved(config) {
      serving = config.command === 'serve'
      base = config.base
    },
    resolveId(id, importer) {
      // Resolve a URL rather than embedding a filesystem path in HTML. Vite's
      // build resolver does not URL-decode package paths such as @scope or spaces.
      const queryAt = id.indexOf('?')
      const path = queryAt < 0 ? id : id.slice(0, queryAt)
      if (path === stylesheetUrl || path === base + stylesheetUrl.slice(1))
        return stylesheet + (queryAt < 0 ? '' : id.slice(queryAt))
      // In production Vite deduplicates the link and import in its CSS graph.
      // In dev a JS CSS import would add a second <style> after the app CSS.
      // The link already owns loading and CSS HMR, so old side-effect imports
      // are empty modules. Leave CSS @imports and explicit ?inline/?url uses alone.
      if (!serving || !importer || /\.(?:css|scss|sass|less|styl)(?:\?|$)/.test(importer)) return
      if (id === '@satinhq/kit/styles.css' || normalizePath(id) === stylesheet) return legacyImport
    },
    load(id) {
      if (id === legacyImport) return 'export {}'
    },
  }
}
