import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { inlinePolicySources } from './inlineCSP.ts'
it('hashes final inline bytes, parser-inserted scripts and closed shadow styles', () => {
  const original = '<script>window.app = true</script>'
  const loader = `const script = ${JSON.stringify(original).replaceAll('<', '\\u003c')};document.write(script)`
  const html = `<style>body{margin:0}</style><script>${loader}</script><script type="application/json">{}</script><script src="/app.js"></script>`
  const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
  const sources = inlinePolicySources(html, ':host{display:block!important}')
  expect(sources.scriptSrc).toEqual([hash(loader), hash('window.app = true')])
  expect(sources.styleSrc).toEqual([hash(':host{display:block!important}'), hash('body{margin:0}')])
})
