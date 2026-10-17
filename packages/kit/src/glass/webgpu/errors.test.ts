import { expect, it, vi } from 'vitest'
import { drainGPUErrors, gpuScope, registerGPUReporter, shaderModule } from './errors.ts'
it('reports scoped allocation failures and balances scopes after a synchronous exception', async () => {
  const device = {
    pushErrorScope: vi.fn(),
    popErrorScope: vi
      .fn()
      .mockResolvedValueOnce({ message: 'Allocation exceeds budget' })
      .mockResolvedValue(null),
  } as unknown as GPUDevice
  const report = vi.fn()
  registerGPUReporter(device, report)
  expect(() =>
    gpuScope(device, 'allocate layer', () => {
      throw Error('raw allocator failure')
    }),
  ).toThrow('raw allocator failure')
  await drainGPUErrors(device)
  expect(device.pushErrorScope).toHaveBeenCalledTimes(3)
  expect(device.popErrorScope).toHaveBeenCalledTimes(3)
  expect(report).toHaveBeenCalledWith(
    'allocate layer',
    expect.objectContaining({ message: 'raw allocator failure' }),
  )
  expect(report).toHaveBeenCalledWith('allocate layer', 'Object: Allocation exceeds budget')
})
it('preserves shader compiler line, column, and raw error text', async () => {
  const device = {
    createShaderModule: () => ({
      getCompilationInfo: async () => ({
        messages: [{ type: 'error', lineNum: 7, linePos: 3, message: 'unknown identifier' }],
      }),
    }),
  } as unknown as GPUDevice
  const report = vi.fn()
  registerGPUReporter(device, report)
  shaderModule(device, { code: 'invalid', label: 'bar' })
  await drainGPUErrors(device)
  expect(report).toHaveBeenCalledWith('shader compilation', 'bar 7:3: unknown identifier')
})
