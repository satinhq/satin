import { afterEach, expect, it, vi } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'
import { defineSatinApp } from './definition.ts'
import { satinApp, type SatinAppOptions } from './vite.ts'

const app = defineSatinApp({
  id: '/strict-glass',
  name: 'Strict glass',
  shortName: 'Strict',
  description: 'Glass build policy test',
  scope: '/app/',
  startRoute: '/app/',
  connectivity: 'local',
  appShell: { additionalPrecache: [] },
  capabilities: [],
  updateActivation: 'cold-launch',
  appearance: {
    background: '#ffffff',
    darkLaunch: { background: '#000000' },
  },
  icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
  orientations: { supported: ['portrait'], fallback: 'rotation-overlay' },
})
afterEach(() => vi.unstubAllEnvs())

async function defines(options: SatinAppOptions = {}, command: 'build' | 'serve' = 'build') {
  const plugin = satinApp(app, options)[0]!
  const hook = plugin.config!
  const run = typeof hook === 'function' ? hook : hook.handler
  const result = await run.call({} as never, {}, {
    command,
    mode: 'production',
    isSsrBuild: false,
    isPreview: false,
  } satisfies ConfigEnv)
  return (result as UserConfig).define!
}

it('release defaults to auto-fallback', async () => {
  vi.stubEnv('SATIN_STRICT_GLASS', '')
  vi.stubEnv('SATIN_DEV_MENU', '')
  expect((await defines())['import.meta.env.SATIN_STRICT_GLASS']).toBe('false')
})
it.each(['serve', 'dev-menu-option', 'dev-menu-env', 'strict-option', 'strict-env'])(
  '%s builds select their glass policy',
  async mode => {
    vi.stubEnv('SATIN_STRICT_GLASS', mode === 'strict-env' ? '1' : '')
    vi.stubEnv('SATIN_DEV_MENU', mode === 'dev-menu-env' ? '1' : '')
    const options = {
      devMenu: mode === 'dev-menu-option' ? true : undefined,
      strictGlass: mode === 'strict-option',
    }
    expect(
      (await defines(options, mode === 'serve' ? 'serve' : 'build'))[
        'import.meta.env.SATIN_STRICT_GLASS'
      ],
    ).toBe(mode === 'serve' ? 'false' : 'true')
  },
)

it('requires an explicit build opt-in for the experimental document shell', async () => {
  vi.stubEnv('SATIN_FLOW_SHELL', '')
  expect((await defines())['import.meta.env.SATIN_FLOW_SHELL']).toBe('false')
  vi.stubEnv('SATIN_FLOW_SHELL', '1')
  expect((await defines())['import.meta.env.SATIN_FLOW_SHELL']).toBe('true')
  vi.stubEnv('SATIN_FLOW_SHELL', '0')
  expect((await defines())['import.meta.env.SATIN_FLOW_SHELL']).toBe('false')
})
