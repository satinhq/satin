import { glassTimed } from './profile.ts'
/// <reference types="@webgpu/types" />
type Reporter = (stage: string, error: unknown) => void
const reporters = new WeakMap<GPUDevice, Reporter>()
const pending = new WeakMap<GPUDevice, Set<Promise<unknown>>>()
export function registerGPUReporter(device: GPUDevice, report: Reporter) {
  reporters.set(device, report)
}
function track(device: GPUDevice, task: Promise<unknown>) {
  const tasks = pending.get(device) ?? new Set<Promise<unknown>>()
  pending.set(device, tasks)
  tasks.add(task)
  void task.finally(() => tasks.delete(task))
}
/** Pop synchronously so overlapping async readbacks cannot steal another scope. */
export function gpuScope<T>(device: GPUDevice, stage: string, work: () => T): T {
  for (const kind of ['internal', 'out-of-memory', 'validation'] as const)
    device.pushErrorScope(kind)
  try {
    return work()
  } catch (error) {
    reporters.get(device)?.(stage, error)
    throw error
  } finally {
    for (let i = 0; i < 3; i++)
      track(
        device,
        device.popErrorScope().then(
          error => {
            if (error) reporters.get(device)?.(stage, `${error.constructor.name}: ${error.message}`)
          },
          async error => {
            // GPU-process teardown can reject scopes before delivering device.lost.
            // Give that notification one task turn to retire the old-device reporter.
            await new Promise<void>(resolve => setTimeout(resolve, 0))
            reporters.get(device)?.(`${stage}: error scope`, error)
          },
        ),
      )
  }
}
export function shaderModule(device: GPUDevice, descriptor: GPUShaderModuleDescriptor) {
  const module = glassTimed(
    'shader-module',
    () => device.createShaderModule(descriptor),
    descriptor.label,
  )
  track(
    device,
    module.getCompilationInfo().then(
      info => {
        const failures = info.messages.filter(message => message.type === 'error')
        if (failures.length)
          reporters.get(device)?.(
            'shader compilation',
            failures
              .map(m => `${descriptor.label ?? 'WGSL'} ${m.lineNum}:${m.linePos}: ${m.message}`)
              .join('\n'),
          )
      },
      error => {
        reporters.get(device)?.('shader compilation info', error)
      },
    ),
  )
  return module
}
export async function drainGPUErrors(device: GPUDevice) {
  await Promise.all(pending.get(device) ?? [])
}

export function renderPipeline(device: GPUDevice, descriptor: GPURenderPipelineDescriptor) {
  return glassTimed('pipeline', () => device.createRenderPipeline(descriptor), descriptor.label)
}
