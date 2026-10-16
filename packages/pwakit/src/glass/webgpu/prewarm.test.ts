import { expect, it, vi } from 'vitest'
import { prewarmKernels } from './passes.ts'

const device = (fail: boolean) =>
  ({
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
    pushErrorScope: () => {},
    popErrorScope: async () => null,
    createRenderPipelineAsync: async () => {
      if (fail) throw Error('pipeline rejected')
      return {}
    },
  }) as unknown as GPUDevice

vi.stubGlobal('GPUShaderStage', { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 })
vi.stubGlobal('GPUBufferUsage', { UNIFORM: 64, COPY_DST: 8 })

it('prewarm compiles every kernel and reports a pipeline failure loudly', async () => {
  await expect(prewarmKernels(device(false))).resolves.toBeUndefined()
  await expect(prewarmKernels(device(true))).rejects.toThrow(
    /Glass kernel pipelines failed to compile: .*pipeline rejected/,
  )
})
