import { expect, it } from 'vitest'
import { glassFailureCode } from './errorCode.ts'
it('keeps worker-local device loss retryable through production startup reporting', () => {
  expect(
    glassFailureCode(
      'production glass startup',
      Error('Source upload worker startup failed: device lost'),
    ),
  ).toBe('worker-startup')
  expect(glassFailureCode('draw', Error('device lost'))).toBe('device-lost')
})

it('recognizes an unavailable adapter inside a worker-startup wrapper', () => {
  expect(
    glassFailureCode(
      'production glass startup',
      Error(
        'Worker startup rejected: navigator.gpu.requestAdapter returned null after five attempts',
      ),
    ),
  ).toBe('adapter-unavailable')
})
