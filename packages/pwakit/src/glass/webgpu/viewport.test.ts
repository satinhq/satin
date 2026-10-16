import { expect, it } from 'vitest'
import { assertViewport } from './passes.ts'
it('rejects fractional attachment overflow before WebKit invalidates the encoder', () => {
  expect(() => assertViewport(278, 126, [0, 0, 278.296875, 126])).toThrow('278.296875')
  expect(() => assertViewport(279, 126, [0, 0, 278.296875, 126])).not.toThrow()
  expect(() => assertViewport(278, 126, [0, 0, 278, 126])).not.toThrow()
  expect(() => assertViewport(278, 126, [0, 0, NaN, 126])).toThrow('validation')
})
