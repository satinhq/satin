import { expect, it } from 'vitest'
import { satinApp } from '../app/vite.ts'
import { defineApp } from '../public/definition.ts'
import { devMenuBuild } from './build.ts'
const app = {
  id: 'dev-menu-test',
  name: 'Developer menu test',
  icons: [{ src: '/icon.png', sizes: '180x180', type: 'image/png' as const }],
}

it('enables the menu on the Vite server and only explicitly opted-in builds', async () => {
  for (const [command, option, enabled] of [
    ['serve', undefined, true],
    ['build', undefined, false],
    ['build', true, true],
    ['build', false, false],
  ] as const) {
    const plugin = satinApp(defineApp(app), { devMenu: option })[0]!
    const hook = plugin.config as (
      config: unknown,
      environment: unknown,
    ) => { define: Record<string, string> }
    const result = await hook({ root: process.cwd() }, { command })
    expect(result.define['import.meta.env.SATIN_DEV_MENU']).toBe(String(enabled))
    if (!enabled) expect(result.define['import.meta.env.SATIN_DEV_MENU_CONFIG']).toBe('undefined')
  }
})
it('captures framework version and git revision at build time, and validates status URL', () => {
  const metadata = devMenuBuild(process.cwd(), {
    version: 'owner-test',
    statusUrl: 'https://owner.test/status',
  })
  expect(metadata).toMatchObject({ version: 'owner-test', frameworkVersion: '0.1.0-beta.0' })
  expect(metadata.commit).toMatch(/^[a-f0-9]{40}$/)
  expect(metadata.branch.length).toBeGreaterThan(0)
  expect(() => devMenuBuild(process.cwd(), { statusUrl: 'javascript:alert(1)' })).toThrow('HTTP')
})
