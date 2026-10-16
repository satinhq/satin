import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeHtml } from '../src/html-analysis.mjs'
test('definition-owned head rejects attribute-order, quoting and casing variants', () => {
  for (const html of [
    '<link href="/x" rel=manifest>',
    '<META content="red" name="theme-color">',
    '<title>App</title>',
    "<meta name='viewport' content='x'>",
  ])
    assert.equal(analyzeHtml(html)[0]?.ruleId, 'no-handwritten-app-head')
  assert.deepEqual(analyzeHtml('<!-- <link rel="manifest"> --><meta charset="UTF-8">'), [])
})

test('viewport fit remains definition-owned for every mode', () => {
  for (const fit of ['auto', 'contain', 'cover'])
    assert.equal(
      analyzeHtml(`<meta name="viewport" content="width=device-width, viewport-fit=${fit}">`)[0]
        ?.ruleId,
      'no-handwritten-app-head',
    )
})
