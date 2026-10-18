import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { inlinePolicySources } from './inlineCSP.ts'
import { minifyInlineScripts } from './installExperience.ts'
import { runInNewContext } from 'node:vm'
it('hashes final inline bytes, parser-inserted scripts and closed shadow styles', () => {
  const original = '<script>window.app = true</script>'
  const loader = `const script = ${JSON.stringify(original).replaceAll('<', '\\u003c')};document.write(script)`
  const html = `<style>body{margin:0}</style><script>${loader}</script><script type="application/json">{}</script><script src="/app.js"></script>`
  const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`
  const sources = inlinePolicySources(html, ':host{display:block!important}')
  expect(sources.scriptSrc).toEqual([hash(loader), hash('window.app = true')])
  expect(sources.styleSrc).toEqual([hash(':host{display:block!important}'), hash('body{margin:0}')])
})
it('minifies named classic head scripts and hashes the bytes it will execute', () => {
  const json = '<script id="definition" type="application/json">{ "name": "Example" }</script>'
  const external = '<script id="entry" src="/app.js"></script>'
  const source = '(() => { const result = 6 * 7; window.answer = result; })();'
  const html = minifyInlineScripts(`<script id="head">${source}</script>${json}${external}`)
  expect(html).toContain(json)
  expect(html).toContain(external)
  const script = html.match(/<script id="head">([\s\S]*?)<\/script>/)![1]!
  expect(script.length).toBeLessThan(source.length)
  const window = { answer: 0 }
  runInNewContext(script, { window })
  expect(window.answer).toBe(42)
  const hash = `'sha256-${createHash('sha256').update(script).digest('base64')}'`
  expect(inlinePolicySources(html, '').scriptSrc).toContain(hash)
})
