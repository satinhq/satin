import assert from 'node:assert/strict'
import test from 'node:test'

import { analyzeSource } from '../src/checker.mjs'
import { ruleManifest } from '../src/rules.mjs'

function violations(fileName, source, ruleId) {
  return analyzeSource(fileName, source).filter(violation => violation.ruleId === ruleId)
}

function flags(fileName, source, ruleId, expected = 1) {
  assert.equal(
    violations(fileName, source, ruleId).length,
    expected,
    `${ruleId} diagnostics for ${fileName}`,
  )
}

function clean(fileName, source, ruleId) {
  flags(fileName, source, ruleId, 0)
}

test('exports a stable machine-readable manifest for every fidelity rule', () => {
  assert.deepEqual(
    ruleManifest.map(rule => rule.id),
    [
      'no-executable-url',
      'no-private-css-variable',
      'no-raw-image',
      'no-handrolled-context-menu',
      'no-internal-import',
      'no-global-focus-reset',
      'no-hidden-focus-heading',
      'require-icon-label',
      'no-browser-dialog',
      'no-browser-history',
      'no-app-reload',
      'no-global-touch-listener',
      'no-fixed-document',
      'no-global-selection-reset',
      'no-direct-push-api',
      'no-handrolled-glass',
      'valid-glass-morph',
      'no-raw-text-input',
      'no-small-input-font',
      'no-duplicate-tab-id',

      'no-custom-linear-easing',
      'no-raw-appearance-query',
      'no-direct-react-root',
      'no-page-zoom',
      'no-handwritten-app-head',
      'no-menu-motion-properties',
      'no-native-menu-active',
      'no-raw-viewport-height',
      'no-raw-safe-area-env',
      'no-raw-css-overflow-scroll',
      'no-raw-inline-overflow-scroll',
      'no-webkit-overflow-scrolling-css',
      'no-webkit-overflow-scrolling-inline',
      'no-raw-button',
      'no-onclick-activation',
      'no-direct-glass-import',
      'no-direct-sw-registration',
      'no-raw-persistent-storage',
      'require-bottom-safe-area-inset',
    ],
  )
  for (const rule of ruleManifest) {
    assert.deepEqual(Object.keys(rule), ['id', 'description', 'autofixable'])
    assert.equal(typeof rule.description, 'string')
    assert.equal(rule.autofixable, false)
  }
})

test('raw app storage requires an explicit integration escape hatch', () => {
  flags('app.ts', "localStorage.setItem('x', 'y')", 'no-raw-persistent-storage')
  flags('app.ts', "window.indexedDB.open('x')", 'no-raw-persistent-storage')
  flags('app.ts', "globalThis['indexedDB'].open('x')", 'no-raw-persistent-storage')
  clean(
    'app.ts',
    "import { defineDatabase } from '@satinhq/kit'; const db = defineDatabase",
    'no-raw-persistent-storage',
  )
  clean(
    'app.ts',
    "// satin-data-allow-raw-storage: legacy import bridge\nlocalStorage.getItem('old')",
    'no-raw-persistent-storage',
  )
})

test('menu :active guards preserve unrelated content and explicit pointer states', () => {
  flags('menu.css', '[role="menuitem"]:active { background: gray; }', 'no-native-menu-active')
  flags('menu.css', '[role=menu] button:active { opacity: .8; }', 'no-native-menu-active')
  flags(
    'menu.css',
    '[role=menuitem] { color: red; &:active { opacity: .8; } }',
    'no-native-menu-active',
  )
  clean('content.css', 'a:active { color: red; }', 'no-native-menu-active')
  clean(
    'menu.css',
    '[role=menuitem][data-pressed=true] { background: gray; }',
    'no-native-menu-active',
  )
  clean(
    'menu.css',
    '/* [role=menu]:active {} */ .x::after { content: "[role=menu]:active"; }',
    'no-native-menu-active',
  )
})

test('no-raw-viewport-height finds CSS, inline member indirection, and tagged CSS', () => {
  flags('fixture.css', '.screen { min-height: 100dvh; }', 'no-raw-viewport-height')
  flags(
    'fixture.tsx',
    "const styles = { screen: { minHeight: '100vh' } }; <main style={styles.screen} />",
    'no-raw-viewport-height',
  )
  flags(
    'fixture.ts',
    "import { css as makeCss } from '@emotion/react'; makeCss`height: 100svh;`",
    'no-raw-viewport-height',
  )
  clean(
    'fixture.ts',
    "const documentation = `Use height: 100vh here`; type Unit = '100dvh'; // 100svh\n",
    'no-raw-viewport-height',
  )
  clean(
    'fixture.css',
    '.example::after { content: "100vh"; } /* height: 100dvh */',
    'no-raw-viewport-height',
  )
})

test('no-raw-safe-area-env finds CSS and inline style values without string traps', () => {
  flags(
    'fixture.css',
    '.shell { padding-bottom: env(safe-area-inset-bottom, 0px); }',
    'no-raw-safe-area-env',
  )
  flags(
    'fixture.tsx',
    "const style = { paddingTop: 'env(safe-area-inset-top)' }; <main style={style} />",
    'no-raw-safe-area-env',
  )
  clean(
    'fixture.ts',
    "const note = 'env(safe-area-inset-left)'; type Example = 'env(safe-area-inset-right)';",
    'no-raw-safe-area-env',
  )
  clean(
    'fixture.css',
    '.example::after { content: "env(safe-area-inset-top)"; }',
    'no-raw-safe-area-env',
  )
})

test('no-raw-css-overflow-scroll parses declarations and ignores non-scrolling values', () => {
  flags('fixture.css', '.list { overflow-y: scroll; }', 'no-raw-css-overflow-scroll')
  flags('fixture.css', '.list { overflow: hidden auto; }', 'no-raw-css-overflow-scroll')
  flags(
    'fixture.ts',
    "import { css } from '@emotion/react'; css`overflow: auto;`",
    'no-raw-css-overflow-scroll',
  )
  clean('fixture.css', '.mask { overflow: hidden; }', 'no-raw-css-overflow-scroll')
  clean(
    'fixture.css',
    '.example::after { content: "overflow: auto"; } /* overflow: scroll */',
    'no-raw-css-overflow-scroll',
  )
})

test('no-raw-inline-overflow-scroll follows JSX props, spreads, and style members', () => {
  flags(
    'fixture.tsx',
    [
      "const styles = { panes: { primary: { overflowY: 'auto' } } };",
      'const props = { style: styles.panes.primary };',
      '<main {...props} />;',
    ].join('\n'),
    'no-raw-inline-overflow-scroll',
  )
  flags('fixture.ts', "element.style.overflow = 'scroll'", 'no-raw-inline-overflow-scroll')
  clean(
    'fixture.ts',
    "const transport = { overflow: 'auto' }; type Style = { overflowY: 'scroll' };",
    'no-raw-inline-overflow-scroll',
  )
  clean(
    'fixture.tsx',
    "const style = { overflowX: 'hidden' }; <main style={style} />",
    'no-raw-inline-overflow-scroll',
  )
})

test('no-webkit-overflow-scrolling-css finds the framework-owned CSS declaration', () => {
  flags(
    'fixture.css',
    '.list { -webkit-overflow-scrolling: touch; }',
    'no-webkit-overflow-scrolling-css',
  )
  flags(
    'fixture.ts',
    "import styled from 'styled-components'; styled.div`-webkit-overflow-scrolling: touch;`",
    'no-webkit-overflow-scrolling-css',
  )
  clean(
    'fixture.css',
    '.example::after { content: "-webkit-overflow-scrolling: touch"; }',
    'no-webkit-overflow-scrolling-css',
  )
  clean(
    'fixture.ts',
    'const css = String.raw; css`-webkit-overflow-scrolling: touch;`',
    'no-webkit-overflow-scrolling-css',
  )
})

test('no-webkit-overflow-scrolling-inline follows style-object spreads', () => {
  flags(
    'fixture.tsx',
    [
      "const owned = { WebkitOverflowScrolling: 'touch' };",
      'const style = { ...owned };',
      '<main style={style} />;',
    ].join('\n'),
    'no-webkit-overflow-scrolling-inline',
  )
  flags(
    'fixture.ts',
    "element.style.setProperty('-webkit-overflow-scrolling', 'touch')",
    'no-webkit-overflow-scrolling-inline',
  )
  clean(
    'fixture.ts',
    "const documentation = { WebkitOverflowScrolling: 'touch' };",
    'no-webkit-overflow-scrolling-inline',
  )
})

test('raw image and button rules find JSX and aliased, indirect, and wrapped React factories', () => {
  flags('fixture.tsx', '<img src="art.jpg" alt="Artwork" />', 'no-raw-image')
  flags(
    'fixture.tsx',
    "import {createElement as h} from 'react'; h('img', {src:'art.jpg'})",
    'no-raw-image',
  )
  clean('fixture.tsx', '<Image src={art} alt="Artwork" />', 'no-raw-image')
  flags('fixture.tsx', '<button type="button">Save</button>', 'no-raw-button')
  flags(
    'fixture.ts',
    [
      "import { createElement as h } from 'react';",
      'const wrap = (...args) => h(...args);',
      "wrap('button', {});",
    ].join('\n'),
    'no-raw-button',
  )
  flags(
    'fixture.ts',
    [
      "import * as ReactNamespace from 'react';",
      'const factory = ReactNamespace.createElement;',
      "factory('button', {});",
    ].join('\n'),
    'no-raw-button',
  )
  flags(
    'fixture.js',
    "import { jsx as render } from 'react/jsx-runtime'; render('button', {});",
    'no-raw-button',
  )
  flags('fixture.tsx', "const tags = { primary: 'button' }; <tags.primary />;", 'no-raw-button')
  flags('fixture.js', "React.createElement.apply(React, ['button', {}]);", 'no-raw-button')
  clean(
    'fixture.tsx',
    "const example = '<button>'; type Tag = 'button'; <Button onPress={() => {}} />;",
    'no-raw-button',
  )
})

test('no-onclick-activation finds JSX, spread props, and factory props', () => {
  flags('fixture.tsx', '<div onClick={save} />', 'no-onclick-activation')
  flags(
    'fixture.tsx',
    [
      'const callbacks = { primary: { onClick: save } };',
      '<section {...callbacks.primary} />;',
    ].join('\n'),
    'no-onclick-activation',
  )
  flags(
    'fixture.ts',
    [
      "import { createElement as h } from 'react';",
      'const render = (tag, props) => h(tag, props);',
      "render('div', { onClick: save });",
    ].join('\n'),
    'no-onclick-activation',
  )
  clean(
    'fixture.tsx',
    "const unusedData = { onClick: 'documentation' }; type Props = { onClick(): void }; <Pressable onPress={save} />;",
    'no-onclick-activation',
  )
})

test('no-direct-sw-registration flags navigator paths and keeps registerAppShell clean', () => {
  flags(
    'fixture.ts',
    "void navigator.serviceWorker.register('/sw.js')",
    'no-direct-sw-registration',
  )
  flags(
    'fixture.ts',
    "void window.navigator.serviceWorker?.register('/sw.js')",
    'no-direct-sw-registration',
  )
  flags(
    'fixture.ts',
    "void (navigator).serviceWorker.register('/sw.js', { scope: '/' })",
    'no-direct-sw-registration',
  )
  clean('fixture.ts', "import { registerAppShell } from '@satinhq/kit'; void registerAppShell()")
  clean('fixture.ts', "const text = 'navigator.serviceWorker.register(x)'; void text")
  clean('fixture.ts', '// navigator.serviceWorker.register belongs to registerAppShell')
  clean('fixture.ts', "void custom.serviceWorker.register('/sw.js')")
  clean('fixture.ts', 'void navigator.serviceWorker.getRegistration()')
})

test('no-direct-glass-import handles aliases, re-exports, dynamic imports, and require', () => {
  flags(
    'fixture.ts',
    "import { MaterialEffect as Material } from 'liquid-glass-web-react';",
    'no-direct-glass-import',
  )
  flags(
    'fixture.ts',
    "export { Glass as Material } from '@vendor/openglass-react/subpath';",
    'no-direct-glass-import',
  )
  flags(
    'fixture.ts',
    'const material = await import(`apple-liquid-glass-webgl`);',
    'no-direct-glass-import',
  )
  flags('fixture.js', "const material = require('liquidglass-runtime');", 'no-direct-glass-import')
  clean(
    'fixture.ts',
    [
      "import type { Glass } from 'liquid-glass-web-react';",
      "export type { GlassOptions } from 'openglass';",
      "type Lazy = import('liquid-glass-react').Glass;",
      "const documentation = `import('liquid-glass-react')`;",
      "import helper from './liquid-glass-helper';",
    ].join('\n'),
    'no-direct-glass-import',
  )
})

test('require-bottom-safe-area-inset groups declarations in nested CSS rules', () => {
  flags(
    'fixture.css',
    '@media (display-mode: standalone) { .bar { position: fixed; left: 0; right: 0; bottom: 8px; } }',
    'require-bottom-safe-area-inset',
  )
  clean(
    'fixture.css',
    '.bar { position: absolute; inset-inline-start: 0; inset-inline-end: 0; bottom: calc(var(--satin-inset-bottom) + 8px); }',
    'require-bottom-safe-area-inset',
  )
  clean(
    'fixture.css',
    '.badge { position: fixed; right: 0; bottom: 8px; }',
    'require-bottom-safe-area-inset',
  )
})

test('comments, ordinary strings, untagged templates, and type positions stay inert', () => {
  const source = [
    "// <button onClick={run} style={{ height: '100vh' }} />",
    "const stringExample = '<button onClick= overflowY: `scroll` env(safe-area-inset-top)>';",
    'const templateExample = `overflow: auto; height: 100dvh;`;',
    "type Example = { onClick(): void; overflowY: 'scroll'; height: '100vh' };",
    'interface Other { WebkitOverflowScrolling: string }',
  ].join('\n')
  assert.deepEqual(analyzeSource('fixture.tsx', source), [])
})

test('menu motion rejects retired custom-property writes but keeps unrelated styling', () => {
  flags(
    'menu.ts',
    "el.style.setProperty('--menu-highlight-y', y + 'px')",
    'no-menu-motion-properties',
  )
  flags(
    'menu.ts',
    "const key = '--menu-contact'; el.style.setProperty(key, String(alpha))",
    'no-menu-motion-properties',
  )
  flags(
    'menu.tsx',
    "const style = {'--menu-highlight-opacity': alpha}",
    'no-menu-motion-properties',
    0,
  )
  clean(
    'menu.ts',
    "el.animate([{transform: 'translateY(0px)'}, {transform: 'translateY(42px)'}], 300)",
    'no-menu-motion-properties',
  )
  clean('theme.ts', "el.style.setProperty('--menu-color', 'red')", 'no-menu-motion-properties')
})

test('page zoom and pinch zoom CSS stay framework-owned', () => {
  flags('app.css', 'html { zoom: 2 }', 'no-page-zoom')
  flags('app.css', '.app { touch-action: pan-y pinch-zoom }', 'no-page-zoom')
  clean('app.css', '.app { touch-action: manipulation }', 'no-page-zoom')
})

test('inline zoom policy cannot escape the package', () => {
  flags('App.tsx', 'const App = () => <div style={{ zoom: 2 }} />', 'no-page-zoom')
  flags(
    'App.tsx',
    'const App = () => <div style={{ touchAction: "pinch-zoom" }} />',
    'no-page-zoom',
  )
})

test('initial mount policy covers runtime aliases, namespaces and re-exports but permits root types', () => {
  const id = 'no-direct-react-root'
  for (const source of [
    "import { createRoot as boot } from 'react-dom/client'",
    "import * as dom from 'react-dom/client'",
    "export { createRoot } from 'react-dom/client'",
    "const dom = import('react-dom/client')",
    "const dom = require('react-dom/client')",
    "import dom = require('react-dom/client')",
  ])
    flags('entry.ts', source, id)
  for (const source of [
    "import type { Root } from 'react-dom/client'",
    "import { type RootOptions } from 'react-dom/client'",
    "export type { Root } from 'react-dom/client'",
    "import { mountSatin } from '@satinhq/kit'",
  ])
    clean('entry.ts', source, id)
})

test('custom linear easing guards CSS and statically resolved animation options', () => {
  const rule = 'no-custom-linear-easing'
  flags('motion.css', '.x { animation: enter 300ms linear(0, 1.1, 1); }', rule)
  flags('motion.tsx', '<div style={{ transitionTimingFunction: "linear(0, 1)" }} />', rule)
  flags(
    'motion.ts',
    'const easing = "linear(0, .8, 1)"; const options = { easing }; element.animate([], options)',
    rule,
  )
  flags('motion.ts', 'effect.updateTiming({ easing: "linear(0, 1)" })', rule)
  clean(
    'motion.css',
    '.x { animation: enter 300ms linear; background: linear-gradient(red, blue); }',
    rule,
  )
  clean(
    'motion.ts',
    'element.animate([{ opacity: 0 }, { opacity: 1 }], { easing: "linear" })',
    rule,
  )
  clean('docs.ts', 'const explanation = "linear(0, 1)"', rule)
  clean('motion.css', '.x::after { content: "linear(0, 1)"; } /* linear(0, 1) */', rule)
})

test('appearance CSS uses accepted state rather than a stale OS query', () => {
  flags(
    'app.css',
    '@media (prefers-color-scheme: dark) { .app { color: white; } }',
    'no-raw-appearance-query',
  )
  clean(
    'app.css',
    '/* prefers-color-scheme */ html[data-satin-appearance="dark"] .app { color: white; }',
    'no-raw-appearance-query',
  )
})

test('push permission and badges are framework-owned', () => {
  flags('app.ts', 'Notification.requestPermission()', 'no-direct-push-api')
  flags('app.ts', 'navigator.setAppBadge(3)', 'no-direct-push-api')
})

test('glass materials reject CSS and inline bypasses but allow removing a filter', () => {
  flags('app.css', '.glass { backdrop-filter: blur(12px); }', 'no-handrolled-glass')
  flags(
    'app.tsx',
    'const x = <div style={{ WebkitBackdropFilter: "blur(12px)" }} />',
    'no-handrolled-glass',
  )
  clean('app.css', '.glass { backdrop-filter: none; }', 'no-handrolled-glass')
})
test('text inputs require a documented escape; small fonts are rejected', () => {
  flags('a.tsx', '<input />', 'no-raw-text-input')
  flags('a.tsx', '<textarea data-satin-native-input="" />', 'no-raw-text-input')
  clean(
    'a.tsx',
    '<input data-satin-native-input="Native date picker experiment" />',
    'no-raw-text-input',
  )
  flags(
    'a.tsx',
    `import { createElement } from 'react'; createElement('textarea', {})`,
    'no-raw-text-input',
  )
  clean('a.tsx', '<TextField label="Title" value="" onChange={set} />', 'no-raw-text-input')
  flags('a.tsx', '<TextField style={{fontSize: 12}} />', 'no-small-input-font')
  flags('a.css', 'input { font-size: 14px; }', 'no-small-input-font')
  clean(
    'a.css',
    'input { font-size: 16px; } .caption { font-size: 12px; } .press-input-label { font-size: 12px; } .input { font-size: 12px; }',
    'no-small-input-font',
  )
})
test('duplicate Tab identities are scoped to imported TabView declarations', () => {
  flags(
    'app.tsx',
    `import { Tab as T, TabView as V } from '@satinhq/kit'; const app = <V><T id="a"/><T id={'a'}/></V>`,
    'no-duplicate-tab-id',
  )
  clean(
    'app.tsx',
    `import { Tab, TabView } from '@satinhq/kit'; const app = <><TabView><Tab id="a"/></TabView><TabView><Tab id="a"/></TabView></>`,
    'no-duplicate-tab-id',
  )
  clean(
    'app.tsx',
    `const app = <TabView><Tab id="a"/><Tab id="a"/></TabView>`,
    'no-duplicate-tab-id',
  )
})

test('app navigation ownership resolves browser aliases without matching local objects', () => {
  for (const source of [
    'history.pushState({}, "", "/detail")',
    'window.history.replaceState({}, "", "/detail")',
    'const h = globalThis.history; h["back"]()',
    'const { pushState: push } = window.history; push({}, "", "/")',
    'const key = "pushState"; self.history[key]({}, "", "/")',
  ])
    flags('app.ts', source, 'no-browser-history')
  clean('app.ts', 'const history = { pushState() {} }; history.pushState()', 'no-browser-history')
  clean('app.ts', 'navigator.push("detail")', 'no-browser-history')
  flags('app.ts', 'const loc = window.location; loc.reload()', 'no-app-reload')
  flags('app.ts', 'const { reload } = location; reload()', 'no-app-reload')
  clean('app.ts', 'const location = { reload() {} }; location.reload()', 'no-app-reload')
})

test('global policies leave role-owned content and local listeners alone', () => {
  for (const source of [
    'document.addEventListener("touchstart", cancel)',
    'window.addEventListener("touchmove", cancel)',
    'addEventListener("touchend", cancel)',
  ])
    flags('app.ts', source, 'no-global-touch-listener')
  clean('app.ts', 'element.addEventListener("touchstart", track)', 'no-global-touch-listener')
  clean('app.ts', 'window.addEventListener("resize", measure)', 'no-global-touch-listener')
  for (const source of [
    '* { user-select: none; }',
    'html, body { -webkit-user-select: none; }',
    '#root * { user-select: none; }',
  ])
    flags('app.css', source, 'no-global-selection-reset')
  clean(
    'app.css',
    '[data-satin-role="content"] { user-select: text; }',
    'no-global-selection-reset',
  )
})

test('browser dialogs resolve globals and aliases but preserve local functions', () => {
  for (const source of [
    'window.alert("x")',
    'globalThis.confirm("x")',
    'self["prompt"]("x")',
    'confirm("x")',
    'const ask = window.confirm; ask("x")',
    'const { alert: tell } = window; tell("x")',
  ])
    flags('app.ts', source, 'no-browser-dialog')
  clean('app.ts', 'function confirm() {}; confirm()', 'no-browser-dialog')
  clean('app.ts', 'const window = { alert() {} }; window.alert()', 'no-browser-dialog')
})

test('icon-only controls require names, including imported aliases', () => {
  flags(
    'app.tsx',
    `import { Pressable as Action } from '@satinhq/kit'; const app = <Action onPress={go}><svg /></Action>`,
    'require-icon-label',
  )
  flags(
    'app.tsx',
    `const app = <Pressable onPress={go} aria-label=" "><svg /></Pressable>`,
    'require-icon-label',
  )
  clean(
    'app.tsx',
    `const app = <Pressable onPress={go} aria-label="Add entry"><svg /></Pressable>`,
    'require-icon-label',
  )
  clean(
    'app.tsx',
    `const app = <Pressable onPress={go}><svg />Add entry</Pressable>`,
    'require-icon-label',
  )
  clean('app.tsx', `const app = <Pressable onPress={go}>{label}</Pressable>`, 'require-icon-label')
})

test('navigation heading focus cannot use statically hidden or sr-only targets', () => {
  flags('app.tsx', `<h1 tabIndex={-1} className="sr-only">Detail</h1>`, 'no-hidden-focus-heading')
  flags('app.tsx', `<h2 tabIndex={-1} aria-hidden="true">Edit</h2>`, 'no-hidden-focus-heading')
  flags(
    'app.tsx',
    `<strong role="heading" tabIndex={-1} hidden>Detail</strong>`,
    'no-hidden-focus-heading',
  )
  clean('app.tsx', `<h1 tabIndex={-1}>Detail</h1>`, 'no-hidden-focus-heading')
  clean('app.tsx', `<h1 tabIndex={-1} aria-hidden={covered}>Detail</h1>`, 'no-hidden-focus-heading')
  clean('app.tsx', `<h1 aria-hidden="true">Decorative copy</h1>`, 'no-hidden-focus-heading')
})

test('icon labels resolve spreads and child names without blocking uncertain props', () => {
  for (const source of [
    `const app = <Pressable disabled aria-label="Add entry"><svg /></Pressable>`,
    `const props = {'aria-label':'Add entry'}; const app = <Pressable {...props}><svg /></Pressable>`,
    `const a = {'aria-labelledby':'label'}; const props = {...a}; const app = <Pressable {...props}><svg /></Pressable>`,
    `const app = <Pressable {...unknownProps}><svg /></Pressable>`,
    `const app = <Pressable><img alt="Add entry" /></Pressable>`,
    `const app = <Pressable><svg aria-labelledby="title"><title id="title">Add entry</title></svg></Pressable>`,
    `const app = <Pressable><img alt={dynamicName} /></Pressable>`,
  ])
    clean('app.tsx', source, 'require-icon-label')
  flags(
    'app.tsx',
    `const props = {'aria-label':''}; const app = <Pressable {...props}><svg /></Pressable>`,
    'require-icon-label',
  )
  flags(
    'app.tsx',
    `const props = {'aria-label':'Add'}; const app = <Pressable {...props} aria-label=""><svg /></Pressable>`,
    'require-icon-label',
  )
  flags('app.tsx', `const app = <Pressable><img alt="" /></Pressable>`, 'require-icon-label')
})

test('hidden child names cannot label an icon control', () => {
  flags(
    'app.tsx',
    `const app = <Pressable><img aria-hidden="true" alt="Add" /></Pressable>`,
    'require-icon-label',
  )
  flags(
    'app.tsx',
    `const app = <Pressable><span aria-hidden={true}>+</span></Pressable>`,
    'require-icon-label',
  )
  flags(
    'app.tsx',
    `const props = { title: 'Add' }; const app = <Pressable {...props}><svg /></Pressable>`,
    'require-icon-label',
  )
})

test('document layout remains framework-owned while local fixed overlays are allowed', () => {
  for (const selector of ['html', 'body', ':root', '#root', 'html, body'])
    flags('app.css', `${selector} { position: fixed; }`, 'no-fixed-document')
  clean('app.css', '.overlay { position: fixed; }', 'no-fixed-document')
  clean('app.css', 'body { position: relative; }', 'no-fixed-document')
})

test('keeps declared chrome context menus inside the framework', () => {
  flags('app.tsx', '<Row label="Set" onContextMenu={openMenu} />', 'no-handrolled-context-menu')
  flags(
    'app.tsx',
    '<button onContextMenu={e => e.preventDefault()}>Set</button>',
    'no-handrolled-context-menu',
  )
  clean('app.tsx', '<Row label="Set" contextMenu={actions} />', 'no-handrolled-context-menu')
  clean(
    'app.tsx',
    '<article onContextMenu={recordEvent}>User content</article>',
    'no-handrolled-context-menu',
  )
})

test('glass morph relations have a namespace and valid literal transition', () => {
  flags(
    'app.tsx',
    'import { GlassEffect } from "@satinhq/kit"; const x=<GlassEffect union="actions" />',
    'valid-glass-morph',
  )
  flags(
    'app.tsx',
    'import { GlassEffect as G } from "@satinhq/kit"; const x=<G id="one" namespace="scope" transition="fade" />',
    'valid-glass-morph',
  )
  clean(
    'app.tsx',
    'import { GlassEffect } from "@satinhq/kit"; const x=<GlassEffect id="one" union="actions" namespace="scope" transition="identity" />',
    'valid-glass-morph',
  )
  clean('app.tsx', 'const x=<GlassEffect union="actions" />', 'valid-glass-morph')
})

test('Symbol-only Button actions require a control name', () => {
  flags(
    'app.tsx',
    `import { Button as Action } from '@satinhq/kit'; const app = <Action symbol="plus" onPress={go} />`,
    'require-icon-label',
  )
  flags(
    'app.tsx',
    `import { Button, Symbol as Glyph } from '@satinhq/kit'; const app = <Button onPress={go}><Glyph name="plus" /></Button>`,
    'require-icon-label',
  )
  clean(
    'app.tsx',
    `import { Button } from '@satinhq/kit'; const app = <Button symbol="plus" aria-label="Add" onPress={go} />`,
    'require-icon-label',
  )
  clean(
    'app.tsx',
    `import { Button } from '@satinhq/kit'; const app = <Button symbol="plus" onPress={go}>Add</Button>`,
    'require-icon-label',
  )
})

test('rejects private framework variable reads in CSS and app inline styles', () => {
  const id = 'no-private-css-variable'
  flags('app.css', '.jump { bottom: var(--satin-scroll-inset-bottom, 0px) }', id)
  flags('app.tsx', '<div style={{ paddingBottom: "var(--satin-inset-bottom)" }} />', id)
  flags('app.ts', 'const style = `bottom: var(--satin-scroll-${edge});`', id)
  clean(
    'app.css',
    '/* var(--satin-inset-bottom) */ .x { content: "var(--satin-inset-bottom)"; color: var(--app-tint) }',
    id,
  )
})

test('rejects executable URL actions while accepting ordinary web destinations', () => {
  flags(
    'App.tsx',
    `const target = 'javascript:alert(1)'; export const App = () => <Link destination={target}>Open</Link>`,
    'no-executable-url',
  )
  flags(
    'App.tsx',
    `export const App = () => <WebView src="data:text/html,hello" title="Page" />`,
    'no-executable-url',
  )
  clean(
    'App.tsx',
    `export const App = () => <Link destination="https://example.com/">Open</Link>`,
    'no-executable-url',
  )
})

test('checks statically known URL actions from the public hook without matching unrelated functions', () => {
  flags(
    'App.tsx',
    `import { useOpenURL as useWeb } from '@satinhq/kit'; function App() { const open = useWeb(); return () => open('javascript:alert(1)') }`,
    'no-executable-url',
  )
  clean('App.tsx', `function open(value) {} open('data:test')`, 'no-executable-url')
})

test('touch-focus fixes must not globally erase keyboard indicators', () => {
  for (const source of [
    '*:focus { outline: none; }',
    'body *:focus-visible { outline: 0; }',
    ':root { outline-style: none; }',
  ])
    flags('app.css', source, 'no-global-focus-reset')
  clean(
    'app.css',
    '[data-satin-focus-quiet]:focus-visible { outline: none; }',
    'no-global-focus-reset',
  )
  clean('app.css', '*:focus-visible { outline: 2px solid rgb(0 0 0); }', 'no-global-focus-reset')
})
