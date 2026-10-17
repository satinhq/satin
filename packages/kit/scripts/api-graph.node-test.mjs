import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDeclarationProject } from './native-api.mjs'
import { publicDeclarationGraph, assertApiSnapshot } from './api-graph.mjs'
function report(channel = 'number', interactive = 'boolean') {
  const files = {
    '/api/index.d.ts': 'export { Glass } from "./glass"',
    '/api/glass.d.ts':
      'import type { GlassMaterial, GlassTint } from "./material"; export declare class Glass { tint(value: GlassTint): Glass; readonly material: GlassMaterial; }',
    '/api/material.d.ts': `export type GlassTint = readonly [red: number, green: number, blue: ${channel}, alpha: number]; export interface GlassMaterial { interactive: ${interactive} }`,
  }
  const project = openDeclarationProject('/api/index.d.ts', { files })
  try {
    return publicDeclarationGraph(project, '/api/index.d.ts')
  } finally {
    project.close()
  }
}
test('API gate detects transitively referenced tuple channel and material member mutations', () => {
  const baseline = report()
  assert.match(baseline, /blue: number/)
  assert.match(baseline, /interactive: boolean/)
  assert.doesNotThrow(() => assertApiSnapshot(report(), baseline))
  assert.throws(() => assertApiSnapshot(report('string'), baseline), /declaration graph changed/)
  assert.throws(
    () => assertApiSnapshot(report('number', 'string'), baseline),
    /declaration graph changed/,
  )
})

test('the emitted root detects a real GlassTint mutation and excludes internal GlassMaterial', async () => {
  const { resolve } = await import('node:path')
  const entry = resolve('dist/index.d.ts'),
    regions = resolve('dist/glass/regions.d.ts')
  const build = replacement => {
    const project = openDeclarationProject(entry, {
      replace: (text, path) => (path === regions ? replacement(text) : text),
    })
    try {
      return publicDeclarationGraph(project, entry)
    } finally {
      project.close()
    }
  }
  const original = build(text => text)
  assert.match(original, /blue: number/)
  assert.throws(
    () =>
      assertApiSnapshot(
        build(text => text.replace('blue: number', 'blue: string')),
        original,
      ),
    /declaration graph changed/,
  )
  assert.doesNotMatch(original, /export type GlassMaterial/)
  assert.doesNotThrow(() =>
    assertApiSnapshot(
      build(text => text.replace('interactive: boolean', 'interactive: string')),
      original,
    ),
  )
})
