// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { commitPreparedAppearance } from './productionPrepare.ts'

it('retains the pending appearance when hide occurs between commit dispatch and acknowledgement', async () => {
  let acknowledge!: () => void
  const acknowledgement = new Promise<void>(resolve => {
    acknowledge = resolve
  })
  const appearanceInstall = { revision: 7, value: 'dark' as const }
  const runtime = {
    appearanceInstall,
    post: vi.fn(() => acknowledgement),
  }
  let current = true
  const completion = commitPreparedAppearance(runtime as never, 'dark', () => current)
  expect(runtime.post).toHaveBeenCalledExactlyOnceWith({ type: 'appearance-commit', revision: 7 })
  current = false
  acknowledge()
  expect(await completion).toBe(false)
  expect(runtime.appearanceInstall).toBe(appearanceInstall)
})

it('releases a confirmed appearance only after a current commit acknowledgement', async () => {
  const runtime = {
    appearanceInstall: { revision: 7, value: 'dark' as const },
    post: vi.fn(async () => ({ accepted: true, revision: 7 })),
  }
  expect(await commitPreparedAppearance(runtime as never, 'dark', () => true)).toBe(true)
  expect(runtime.appearanceInstall).toBeUndefined()
})

it('does not dispatch a reused appearance commit after its source refresh becomes stale', async () => {
  const appearanceInstall = { revision: 7, value: 'dark' as const }
  const runtime = { appearanceInstall, post: vi.fn() }
  expect(await commitPreparedAppearance(runtime as never, 'dark', () => false)).toBe(false)
  expect(runtime.post).not.toHaveBeenCalled()
  expect(runtime.appearanceInstall).toBe(appearanceInstall)
})

it.each([undefined, { accepted: false, revision: 7 }, { accepted: true, revision: 6 }])(
  'retains a current capture barrier when its worker commit is not accepted: %j',
  async acknowledgement => {
    const appearanceInstall = { revision: 7, value: 'dark' as const }
    const runtime = {
      appearanceInstall,
      post: vi.fn(async () => acknowledgement),
    }
    await expect(commitPreparedAppearance(runtime as never, 'dark', () => true)).rejects.toThrow(
      'WebGPU appearance commit rejected for revision 7',
    )
    expect(runtime.appearanceInstall).toBe(appearanceInstall)
  },
)
