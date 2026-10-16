import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSource } from '../src/checker.mjs'
test('apps cannot import internal values, types, reexports or dynamic modules', () => {
  for (const source of [
    "import { createNavigator } from '@satinhq/kit/internal'",
    "import type { NavigatorStore } from '@satinhq/kit/internal'",
    "export { createNavigator } from '@satinhq/kit/internal'",
    "export type { NavigatorStore } from '@satinhq/kit/internal'",
    "const internal = await import('@satinhq/kit/internal')",
    "const load = require; load('@satinhq/kit/internal')",
    "const load = require; const again = load; again('@satinhq/kit/' + 'internal')",
    "const loaders = { load: require }; loaders.load('@satinhq/kit/internal')",
    "const { load } = { load: require }; load('@satinhq/kit/internal')",
    "const internal = require('@satinhq/kit/internal')",
    "type Store = import('@satinhq/kit/internal').NavigatorStore",
  ])
    assert.ok(
      analyzeSource('app.ts', source).some(item => item.ruleId === 'no-internal-import'),
      source,
    )
  for (const path of ['@satinhq/kit', '@satinhq/kit/unstable', '@satinhq/kit/testing', '@satinhq/kit/vite'])
    assert.ok(
      !analyzeSource('app.ts', `import * as api from '${path}'`).some(
        item => item.ruleId === 'no-internal-import',
      ),
    )
})

test('a shadowed require is not classified as the module loader', () => {
  assert.ok(
    !analyzeSource(
      'app.ts',
      "function test(require: (x: string) => void) { const load = require; load('@satinhq/kit/internal') }",
    ).some(item => item.ruleId === 'no-internal-import'),
  )
})
