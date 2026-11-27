// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { setupPrelaunch, prelaunchDOM } from '../app/prelaunch.test-helper.ts'
import { prelaunchController } from '../app/launchScreenRuntime.ts'
import { defineApp } from '../public/definition.ts'
const state = vi.hoisted(() => ({ error: undefined as Error | undefined }))
vi.mock('../app/launch.ts', () => ({
  prepareOfflineBundle: async () => {
    throw state.error
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
  id: 'launch-failure-test',
  name: 'Launch failure',
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})
it.each([
  'Artwork did not finish preparing. Please retry.',
  'Check your connection and try again.',
  undefined,
])('preserves source-marked recovery copy in release: %s', reason => {
  vi.stubEnv('DEV', false)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  state.error = Object.assign(new Error('Internal stage: https://example.test/resource'), {
    satinLaunchReason: reason,
  })
  setupPrelaunch(true, false)
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  return import('./SatinRoot.tsx').then(async ({ SatinRoot }) => {
    try {
      await act(async () =>
        root.render(
          <SatinRoot>
            <div>App</div>
          </SatinRoot>,
        ),
      )
      const text = prelaunchDOM.textContent
      expect(text).toContain(reason ?? 'The app could not open. Please retry.')
      expect(text).not.toContain('https://example.test')
      expect(text).not.toContain('Internal stage')
      expect(prelaunchController().snapshot().error).toContain('https://example.test/resource')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
