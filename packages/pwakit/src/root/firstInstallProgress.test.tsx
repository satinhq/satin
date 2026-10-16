// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { defineApp } from '../public/definition.ts'
const state = vi.hoisted(() => ({
  progress: undefined as undefined | ((value: { loaded: number; total: number }) => void),
}))
vi.mock('../app/launch.ts', () => ({
  prepareOfflineBundle: (_scope: string, _timeout: number, progress: typeof state.progress) => {
    state.progress = progress
    return new Promise(() => {})
  },
  prepareLaunchContent: async () => {},
}))
vi.mock('../glass/MaterialEffectRoot.tsx', () => ({
  MaterialEffectRoot: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('../app/runtime.ts', async original => ({
  ...(await original<typeof import('../app/runtime.ts')>()),
  getBuiltApp: () => app,
}))
const app = defineApp({
  id: 'first-install-test',
  name: 'First install',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
})
it('paints actual first-install byte progress for a release app before preparation completes', async () => {
  vi.stubEnv('DEV', false)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  document.body.innerHTML =
    '<div id="satin-launch-screen"><svg id="satin-launch-progress" hidden><circle stroke-dashoffset="100" /></svg></div><div id="mount"></div>'
  const { SatinRoot } = await import('./SatinRoot.tsx')
  const root = createRoot(document.getElementById('mount')!)
  try {
    await act(async () => {
      root.render(
        <SatinRoot>
          <div>App</div>
        </SatinRoot>,
      )
    })
    expect(state.progress).toBeTypeOf('function')
    act(() => state.progress!({ loaded: 25, total: 100 }))
    expect(document.getElementById('satin-launch-progress')!.hasAttribute('hidden')).toBe(false)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllEnvs()
  }
})
