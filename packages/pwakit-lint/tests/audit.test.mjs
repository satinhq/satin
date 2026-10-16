import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeSource } from '../src/checker.mjs'

function ruleIds(source, fileName = 'audit.tsx') {
  return analyzeSource(fileName, source).map(violation => violation.ruleId)
}

for (const [name, expression] of [
  ['spread before overflow', '{ ...missing, overflow: "auto" }'],
  ['Object.assign before overflow', 'Object.assign({}, missing, { overflow: "auto" })'],
  ['spread after overflow', '{ overflow: "auto", ...missing }'],
  ['Object.assign after overflow', 'Object.assign({}, { overflow: "auto" }, missing)'],
  ['conditional spread', '{ ...(flag ? missing : {}), overflow: "auto" }'],
  ['nested spread', '{ ...{ ...missing }, overflow: "auto" }'],
]) {
  test(`unresolved ${name} retains known violations`, () => {
    assert.deepEqual(ruleIds(`const { missing } = {}; <div style={${expression}} />`), [
      'no-raw-inline-overflow-scroll',
    ])
  })
}

for (const [name, padding, protectedBottom] of [
  ['later zero longhand', 'padding-bottom:var(--satin-inset-bottom);padding-bottom:0', false],
  ['later inset longhand', 'padding-bottom:0;padding-bottom:var(--satin-inset-bottom)', true],
  ['later zero shorthand', 'padding-bottom:var(--satin-inset-bottom);padding:0', false],
  ['later inset after shorthand', 'padding:0;padding-bottom:var(--satin-inset-bottom)', true],
  [
    'important zero wins',
    'padding-bottom:0!important;padding-bottom:var(--satin-inset-bottom)',
    false,
  ],
  [
    'important inset wins',
    'padding-bottom:var(--satin-inset-bottom)!important;padding-bottom:0',
    true,
  ],
  ['later important zero', 'padding-bottom:var(--satin-inset-bottom);padding:0!important', false],
  [
    'earlier important shorthand',
    'padding:0!important;padding-bottom:var(--satin-inset-bottom)',
    false,
  ],
  [
    'later important inset',
    'padding:0!important;padding-bottom:var(--satin-inset-bottom)!important',
    true,
  ],
  [
    'equal important zero',
    'padding-bottom:var(--satin-inset-bottom)!important;padding:0!important',
    false,
  ],
  ['one-value shorthand', 'padding:var(--satin-inset-bottom)', true],
  ['two-value shorthand bottom', 'padding:var(--satin-inset-bottom) 0', true],
  ['two-value shorthand side', 'padding:0 var(--satin-inset-bottom)', false],
  ['three-value shorthand bottom', 'padding:0 0 var(--satin-inset-bottom)', true],
  ['four-value shorthand bottom', 'padding:0 0 var(--satin-inset-bottom) 0', true],
  ['four-value shorthand top', 'padding:var(--satin-inset-bottom) 0 0 0', false],
  ['nested functions', 'padding:0 0 calc(var(--satin-inset-bottom) + 8px) 0', true],
  [
    'important spelling and comments',
    'padding:var(--satin-inset-bottom) ! /* priority */ IMPORTANT;padding:0',
    true,
  ],
]) {
  test(`winning bottom padding uses ${name}`, () => {
    assert.deepEqual(
      ruleIds(`.bar {position:fixed;left:0;right:0;bottom:0;${padding}}`, 'audit.css'),
      [
        ...Array((padding.match(/var\(--satin-/g) ?? []).length).fill('no-private-css-variable'),
        ...(protectedBottom ? [] : ['require-bottom-safe-area-inset']),
      ],
    )
  })
}

test('array elisions do not stop later fidelity diagnostics', () => {
  assert.deepEqual(ruleIds('const [, setValue] = useState(0); location.reload()'), [
    'no-app-reload',
  ])
  assert.deepEqual(ruleIds('const [,, value] = values; const { nested: [, item] } = props'), [])
})

test('interpolated CSS keeps scrolling and glass diagnostics', () => {
  const source =
    'import { css } from "@emotion/react"; css`color:${color}; overflow:auto; backdrop-filter:blur(8px);`'
  assert.deepEqual(ruleIds(source), ['no-handrolled-glass', 'no-raw-css-overflow-scroll'])
})

test('qualified document selectors retain global policies', () => {
  assert.deepEqual(ruleIds('body.app { position:fixed }', 'audit.css'), ['no-fixed-document'])
  assert.deepEqual(ruleIds('body.app * { user-select:none }', 'audit.css'), [
    'no-global-selection-reset',
  ])
  assert.deepEqual(ruleIds('body.app .content { user-select:text }', 'audit.css'), [])
})

test('browser API ownership survives computed members and aliases', () => {
  assert.deepEqual(ruleIds('navigator.serviceWorker["register"]("/sw.js")'), [
    'no-direct-sw-registration',
  ])
  assert.deepEqual(ruleIds('Notification["requestPermission"]()'), ['no-direct-push-api'])
  assert.deepEqual(
    ruleIds('const register = navigator.serviceWorker.register; register("/sw.js")'),
    ['no-direct-sw-registration'],
  )
  assert.deepEqual(ruleIds('const { requestPermission } = Notification; requestPermission()'), [
    'no-direct-push-api',
  ])
  assert.deepEqual(
    ruleIds('const files = { requestPermission() {} }; files.requestPermission()'),
    [],
  )
})

test('type-only named specifiers do not erase a runtime default import', () => {
  assert.deepEqual(
    ruleIds('import client, { type Root } from "react-dom/client"; client.createRoot(el)'),
    ['no-direct-react-root'],
  )
})

test('every conditional dynamic import branch is checked', () => {
  assert.deepEqual(ruleIds('import(flag ? "./local" : "react-dom/client")'), [
    'no-direct-react-root',
  ])
  assert.deepEqual(ruleIds('import(flag ? "react-dom/client" : "./local")'), [
    'no-direct-react-root',
  ])
})

test('HTML inline styles and scripts retain source offsets', () => {
  const source = '<style>body{position:fixed}</style><script>location.reload()</script>'
  const found = analyzeSource('audit.html', source)
  assert.equal(
    found.filter(item => item.ruleId === 'no-fixed-document')[0]?.offset,
    source.indexOf('position'),
  )
  assert.equal(
    found.filter(item => item.ruleId === 'no-app-reload')[0]?.offset,
    source.indexOf('location'),
  )
})

test('static JSX spreads preserve glass namespace validation', () => {
  const prefix = 'import { GlassEffect } from "@satinhq/kit"; '
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...{}} id="x" />'), ['valid-glass-morph'])
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...{ id: "x" }} />'), ['valid-glass-morph'])
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...{ id: "x", namespace: "n" }} />'), [])
})

test('style spreads and Object.assign use the final property value', () => {
  assert.deepEqual(ruleIds('<div style={{ ...{ overflow: "auto" }, overflow: "hidden" }} />'), [])
  assert.deepEqual(
    ruleIds('<div style={Object.assign({}, { overflow: "auto" }, { overflow: "hidden" })} />'),
    [],
  )
  assert.deepEqual(ruleIds('<div style={{ overflow: "hidden", ...{ overflow: "auto" } }} />'), [
    'no-raw-inline-overflow-scroll',
  ])
})

test('qualified universal selectors keep semantic-role policies', () => {
  assert.deepEqual(ruleIds('*.app-chrome { user-select:none }', 'audit.css'), [])
  assert.deepEqual(ruleIds('*.floating-control { position:fixed }', 'audit.css'), [])
  assert.deepEqual(ruleIds('body.app *.content { user-select:text }', 'audit.css'), [])
  assert.deepEqual(ruleIds('* { user-select:none }', 'audit.css'), ['no-global-selection-reset'])
})

test('HTML metadata attributes do not change inline execution', () => {
  for (const attributes of [
    'data-src="metadata"',
    'data-type="application/json"',
    'title="src=metadata type=application/json"',
    'DATA-SRC="metadata" DATA-TYPE="application/json"',
  ]) {
    assert.deepEqual(ruleIds(`<script ${attributes}>location.reload()</script>`, 'audit.html'), [
      'no-app-reload',
    ])
  }
  assert.deepEqual(
    ruleIds('<style data-type="metadata">body{position:fixed}</style>', 'audit.html'),
    ['no-fixed-document'],
  )
  assert.deepEqual(
    ruleIds('<script src="external.js">location.reload()</script>', 'audit.html'),
    [],
  )
  assert.deepEqual(
    ruleIds('<script type="application/json">location.reload()</script>', 'audit.html'),
    [],
  )
})

test('bottom padding can protect full-width bar content', () => {
  assert.deepEqual(
    ruleIds(
      '.bar {position:fixed;left:0;right:0;bottom:0;padding-bottom:var(--satin-inset-bottom)}',
      'audit.css',
    ),
    ['no-private-css-variable'],
  )
  assert.deepEqual(
    ruleIds(
      '.bar {position:fixed;left:0;right:0;bottom:0;padding-bottom:var(--other-inset)}',
      'audit.css',
    ),
    ['require-bottom-safe-area-inset'],
  )
})

test('effective glass attributes respect overrides and unknown spreads', () => {
  const prefix = 'import { GlassEffect } from "@satinhq/kit"; '
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...props} id="x" namespace="" />'), [
    'valid-glass-morph',
  ])
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...props} transition="fade" />'), [
    'valid-glass-morph',
  ])
  assert.deepEqual(ruleIds(prefix + '<GlassEffect id="x" {...{ namespace: "n" }} />'), [])
  assert.deepEqual(
    ruleIds(prefix + '<GlassEffect namespace="n" {...{ namespace: "" }} id="x" />'),
    ['valid-glass-morph'],
  )
  assert.deepEqual(ruleIds(prefix + '<GlassEffect {...props} id="x" />'), [])
})

test('conditional style branches retain their own final property values', () => {
  assert.deepEqual(
    ruleIds('<div style={{ ...(flag ? { overflow: "auto" } : {}), overflow: "hidden" }} />'),
    [],
  )
  assert.deepEqual(
    ruleIds('<div style={{ overflow: "auto", ...(flag ? { overflow: "hidden" } : {}) }} />'),
    ['no-raw-inline-overflow-scroll'],
  )
  assert.deepEqual(
    ruleIds(
      '<div style={Object.assign({}, { overflow: "auto" }, flag ? { overflow: "hidden" } : {})} />',
    ),
    ['no-raw-inline-overflow-scroll'],
  )
})
