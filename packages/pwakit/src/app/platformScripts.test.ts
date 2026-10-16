import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { gateAppScripts } from './platformScripts.ts'

// jsdom is already a test dependency, but this checkout has no @types/jsdom.
// Keep the constructor surface used here explicit without adding dependencies.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: { runScripts: 'dangerously'; url?: string },
  ) => { window: Window & { appStarted?: boolean } }
}

function page(blocked: boolean | undefined, appScripts: string) {
  const gate = `<script id="satin-platform-gate">window.__SATIN_PLATFORM_BLOCKED__ = ${blocked};</script>`
  return gateAppScripts(
    `<!doctype html><html><head>${gate}</head><body>${appScripts}</body></html>`,
  )
}

describe('platform script gate', () => {
  it.each([true, undefined])('never starts app scripts when the flag is %s', blocked => {
    const dom = new JSDOM(
      page(
        blocked,
        `
      <script>window.appStarted = true;</script>
      <script type="module" src="/entry.js"></script>
      <script src="/classic.js"></script>
    `,
      ),
      { runScripts: 'dangerously', url: 'https://app.test/app/' },
    )
    expect(dom.window.appStarted).toBeUndefined()
    expect(dom.window.document.querySelectorAll('script[src]')).toHaveLength(0)
    expect(dom.window.document.querySelectorAll('script[type="module"]')).toHaveLength(0)
    dom.window.close()
  })

  it('starts inline app code only after a successful platform check', () => {
    const dom = new JSDOM(page(false, '<script>window.appStarted = true;</script>'), {
      runScripts: 'dangerously',
    })
    expect(dom.window.appStarted).toBe(true)
    dom.window.close()
  })

  it('preserves external module URLs and attributes on an allowed page', () => {
    const dom = new JSDOM(
      page(false, '<script type="module" src="/entry.js" crossorigin nonce="test"></script>'),
      {
        runScripts: 'dangerously',
        url: 'https://app.test/app/',
      },
    )
    const entry = dom.window.document.querySelector('script[src]') as HTMLScriptElement
    expect(entry.src).toBe('https://app.test/entry.js')
    expect(entry.type).toBe('module')
    expect(entry.nonce).toBe('test')
    expect(entry.hasAttribute('crossorigin')).toBe(true)
    expect(entry.hasAttribute('async')).toBe(false)
    dom.window.close()
  })

  it('leaves data and import maps intact and does not gate public pages', () => {
    const data = '<script type="application/json">{"test":true}</script>'
    const map = '<script type="importmap">{"imports":{}}</script>'
    const dom = new JSDOM(page(false, data + map), { runScripts: 'dangerously' })
    expect(dom.window.document.querySelector('script[type="application/json"]')?.outerHTML).toBe(
      data,
    )
    expect(dom.window.document.querySelector('script[type="importmap"]')?.outerHTML).toBe(map)
    dom.window.close()
    expect(gateAppScripts('<html><script>window.installStarted=true</script></html>')).toBe(
      '<html><script>window.installStarted=true</script></html>',
    )
  })

  it('blocks encoded types and does not confuse data attributes with framework IDs', () => {
    const dom = new JSDOM(
      page(
        true,
        '<script data-id="satin-platform-gate" type="text/&#106;avascript">window.appStarted=true</script>',
      ),
      { runScripts: 'dangerously' },
    )
    expect(dom.window.appStarted).toBeUndefined()
    expect(dom.window.document.querySelector('script[data-id]')).toBeNull()
    dom.window.close()
  })

  it('keeps closing script text escaped inside loader strings', () => {
    const html = page(false, '<script>window.value="<script>";</script>')
    expect(html).toContain('\\u003cscript>')
  })
})

it('retains framework scripts when a CSP nonce precedes their ID', () => {
  const gate =
    '<script nonce="trusted" id="satin-platform-gate">window.__SATIN_PLATFORM_BLOCKED__ = false;</script>'
  const html = gateAppScripts(
    `<html><head>${gate}</head><body><script>window.appStarted = true</script></body></html>`,
  )
  expect(html).toContain(gate)
  const { window } = new JSDOM(html, { runScripts: 'dangerously' })
  expect(window.appStarted).toBe(true)
})

it('preserves inert framework deployment metadata before the gate', () => {
  const metadata =
    '<script id="satin-deployment" type="application/json">{"scope":"/app/"}</script>'
  const gate =
    '<script id="satin-platform-gate">window.__SATIN_PLATFORM_BLOCKED__ = false;</script>'
  const html = gateAppScripts(
    `<html><head>${metadata}${gate}</head><body><script>window.appStarted = true</script></body></html>`,
  )
  const { window } = new JSDOM(html, { runScripts: 'dangerously' })
  expect(window.document.querySelector('#satin-deployment')?.textContent).toBe('{"scope":"/app/"}')
  expect(window.appStarted).toBe(true)
})
