import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGlassErrors, reportGlassError, subscribeGlassErrors } from './errors.ts'

afterEach(() => vi.unstubAllEnvs())

describe('glass failure contract', () => {
  it('preserves raw failure text and reason for diagnostics and production hooks', async () => {
    // This case retains ordinary development's retryable-adapter contract.
    vi.stubEnv('SATIN_STRICT_GLASS', '')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hook = vi.fn()
    const unsubscribe = subscribeGlassErrors(hook)
    const error = reportGlassError(
      'device-lost',
      new Error('GPU allocation failed: 4096 bytes'),
      'device.lost',
      'destroyed',
    )
    expect(error.message).toBe('Error: GPU allocation failed: 4096 bytes')
    expect(error.reason).toBe('destroyed')
    expect(hook).toHaveBeenCalledWith(error)
    expect(getGlassErrors().at(-1)).toEqual(error)
    unsubscribe()
    reportGlassError('readiness-timeout', 'Glass did not present within 2500 ms.', 'launch')
    expect(hook).toHaveBeenCalledTimes(1)
    expect(getGlassErrors().at(-1)?.code).toBe('readiness-timeout')
    expect(
      reportGlassError(
        'validation',
        { message: 'Texture usage incompatible with binding 3' },
        'createBindGroup',
      ).message,
    ).toBe('Texture usage incompatible with binding 3')
    const historyLength = getGlassErrors().length
    const diagnostic = reportGlassError(
      'adapter-unavailable',
      'navigator.gpu.requestAdapter returned null after five attempts',
      'device recreation',
    )
    expect(diagnostic.transient).toBe(true)
    expect(getGlassErrors()).toHaveLength(historyLength + 1)
    expect(getGlassErrors().at(-1)).toEqual(diagnostic)
    const { formatGlassErrors } = await import('./errorAlert.ts')
    expect(formatGlassErrors([diagnostic])).toBe('')
    log.mockRestore()
  })
})

it('lists a cause that propagated through several stages once', async () => {
  const { formatGlassErrors } = await import('./errorAlert.ts')
  const at = 0
  const text = formatGlassErrors([
    {
      code: 'gpu-unavailable',
      stage: 'device acquisition',
      message: 'navigator.gpu is unavailable in the glass worker',
      at,
    },
    {
      code: 'gpu-unavailable',
      stage: 'WebGPU startup',
      message: 'Error: Error: navigator.gpu is unavailable in the glass worker',
      at,
    },
    { code: 'readiness-timeout', stage: 'launch', message: 'Glass did not present', at },
  ])
  expect(text).toBe(
    'Glass failed — gpu-unavailable — device acquisition → WebGPU startup\nnavigator.gpu is unavailable in the glass worker\n\nGlass failed — readiness-timeout — launch\nGlass did not present',
  )
})
