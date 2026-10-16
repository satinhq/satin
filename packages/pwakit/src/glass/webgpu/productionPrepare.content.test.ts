// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { commitPreparedContent } from './productionPrepare.ts'

it('keeps a superseded or hidden tab source held until its current installation completes', async () => {
  let reply!: (value: unknown) => void
  const runtime = {
    contentInstall: 11 as number | undefined,
    post: vi.fn(
      () =>
        new Promise<unknown>(resolve => {
          reply = resolve
        }),
    ),
  }
  let current = true
  const completion = commitPreparedContent(runtime, () => current)
  current = false
  runtime.contentInstall = 12
  reply({ accepted: true, revision: 11 })
  expect(await completion).toBe(false)
  expect(runtime.contentInstall).toBe(12)
})

it.each([undefined, { accepted: false, revision: 11 }, { accepted: true, revision: 10 }])(
  'does not admit a tab on an invalid source commit: %j',
  async receipt => {
    const runtime = { contentInstall: 11, post: vi.fn(async () => receipt) }
    await expect(commitPreparedContent(runtime, () => true)).rejects.toThrow(
      'content commit rejected',
    )
    expect(runtime.contentInstall).toBe(11)
  },
)

it('admits the matching source only after its complete renderer transaction', async () => {
  const runtime = {
    contentInstall: 11 as number | undefined,
    post: vi.fn(async () => ({ accepted: true, revision: 11 })),
  }
  expect(await commitPreparedContent(runtime, () => true)).toBe(true)
  expect(runtime.contentInstall).toBeUndefined()
})
