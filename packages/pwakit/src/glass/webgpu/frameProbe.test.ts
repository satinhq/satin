import { expect, it, vi } from 'vitest'
import { FrameProbe } from './frameProbe.ts'

it('does not submit or count a frame cancelled while it was encoding', () => {
  const submit = vi.fn()
  const finish = vi.fn(() => ({}))
  const device = {
    features: new Set(),
    createCommandEncoder: () => ({ finish }),
    queue: { submit, onSubmittedWorkDone: vi.fn(() => Promise.resolve()) },
  }
  const probe = new FrameProbe(vi.fn())
  probe.useDevice(device as unknown as GPUDevice)
  let visible = true
  probe.frame(
    'scroll',
    null,
    true,
    () => {
      visible = false
    },
    () => visible,
  )
  expect(submit).not.toHaveBeenCalled()
  expect(finish).not.toHaveBeenCalled()
  expect((probe as unknown as { samples: unknown[] }).samples).toEqual([])
})
