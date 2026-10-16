import { describe, expect, it } from 'vitest'
import {
  defineSatinApp,
  generateAppShellPluginOptions,
  generatePreReactAppearanceScript,
  generateSatinManifestJson,
  type AppDeploymentOptions,
  type AppDeploymentInput,
} from './definition.ts'
import type { ServerReachabilityConfig } from '../reachability/model.ts'
import startRoutes from '../../../create-pwakit/test/start-routes.json'

type ServerInput = AppDeploymentOptions & {
  readonly connectivity: 'server'
  readonly reachability: ServerReachabilityConfig
}

it.each(startRoutes)('agrees with scaffold validation for $route', ({ route, valid }) => {
  const define = () => defineSatinApp(input({ startRoute: route }))
  if (valid) expect(define).not.toThrow()
  else expect(define).toThrow()
})

function input(overrides: Partial<ServerInput> = {}): ServerInput {
  return {
    appShell: {
      additionalPrecache: ['art/empty-state.svg'],
    },
    appearance: {
      background: '#F2F2F7',
      darkLaunch: { background: '#000000' },
    },
    capabilities: ['badging'],
    connectivity: 'server',
    description: 'A runtime configuration specimen.',
    icons: [
      {
        purpose: 'any',
        sizes: '512x512',
        src: '/apple-touch-icon.png',
        type: 'image/png',
      },
    ],
    id: '/satin-measured-reference',
    name: 'Satin Runtime Configuration',
    orientations: {
      fallback: 'rotation-overlay',
      supported: ['portrait'],
    },
    reachability: {
      defaultRoutePolicy: 'requires-server',
      probe: { method: 'HEAD', timeoutMs: 4_000, url: '/health' },
      routes: { journal: 'local-first' },
      surfaces: { localFirst: 'banner', requiresServer: 'full-screen' },
    },
    scope: '/app/',
    shortName: 'Satin 06h',
    startRoute: '/app/?screen=home',

    updateActivation: 'cold-launch-or-explicit',
    ...overrides,
  }
}

describe('defineSatinApp prototype', () => {
  it('normalizes and freezes a valid definition', () => {
    const definition = defineSatinApp(input())

    expect(definition.appearance.background).toBe('#f2f2f7')
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.icons)).toBe(true)
    if (definition.connectivity !== 'server') throw new Error('Expected server definition.')
    expect(Object.isFrozen(definition.reachability.routes)).toBe(true)
  })

  it('generates a complete standalone manifest with an honest orientation hint', () => {
    const manifest = JSON.parse(generateSatinManifestJson(defineSatinApp(input()))) as Record<
      string,
      unknown
    >

    expect(manifest).toMatchObject({
      background_color: '#f2f2f7',
      display: 'standalone',
      id: '/satin-measured-reference',
      orientation: 'portrait',
      scope: '/app/',
      start_url: '/app/?screen=home',
      theme_color: '#f2f2f7',
    })
  })

  it('maps dual-orientation support to the manifest any value', () => {
    const definition = defineSatinApp(
      input({
        orientations: {
          fallback: 'none',
          supported: ['portrait', 'landscape'],
        },
      }),
    )
    expect(JSON.parse(generateSatinManifestJson(definition))).toMatchObject({
      orientation: 'any',
    })
  })

  it('generates pre-React light and dark launch policy', () => {
    const script = generatePreReactAppearanceScript(defineSatinApp(input()))

    expect(script).toContain('prefers-color-scheme: dark')
    expect(script).toContain('"dark":{"background":"#000000"}')
    expect(script).toContain("querySelector('#satin-theme-color')")
    expect(script).not.toContain("querySelector('#satin-status-bar-style')")
  })

  it('generates only the current measured-reference build-plugin options', () => {
    const definition = defineSatinApp(input())
    const options = generateAppShellPluginOptions(definition)

    expect(options).toEqual({
      additionalPrecache: ['art/empty-state.svg'],
    })
    expect(options).not.toHaveProperty('updateActivation')
    expect(Object.isFrozen(options.additionalPrecache)).toBe(true)
  })

  it.each([
    [
      'a start route outside scope',
      { startRoute: '/outside' },
      'startRoute: route must stay inside the declared scope',
    ],
    [
      'duplicate orientations',
      {
        orientations: {
          fallback: 'rotation-overlay',
          supported: ['portrait', 'portrait'],
        },
      },
      'orientations.supported: duplicate entries are not allowed',
    ],
    [
      'a single orientation without a fallback',
      { orientations: { fallback: 'none', supported: ['portrait'] } },
      'single-orientation apps need an honest runtime fallback',
    ],
    [
      'a traversal in additional precache',
      {
        appShell: {
          additionalPrecache: ['../secret.txt'],
        },
      },
      'invalid output-relative file',
    ],
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => defineSatinApp(input(overrides as Partial<ServerInput>))).toThrow(message)
  })

  it('rejects server reachability fields on a local app', () => {
    const invalid = { ...input(), connectivity: 'local' } as unknown as AppDeploymentInput
    expect(() => defineSatinApp(invalid)).toThrow(
      'local apps cannot declare a server reachability policy',
    )
  })

  it('accepts a fully local profile without a reachability policy', () => {
    const serverInput = input()
    const { reachability: _reachability, ...withoutReachability } = serverInput
    const definition = defineSatinApp({
      ...withoutReachability,
      connectivity: 'local',
    })

    expect(definition.connectivity).toBe('local')
  })
})

it('defaults to release updates and accepts the preview profile', () => {
  expect(defineSatinApp(input()).updateProfile).toBe('release')
  expect(defineSatinApp(input({ updateProfile: 'preview' })).updateProfile).toBe('preview')
})
it.each(['/app/', '/app/unsupported.html'])('rejects install route collision %s', installRoute => {
  expect(() => defineSatinApp(input({ installRoute }))).toThrow('installRoute')
})

it('emits manifest shortcuts and rejects shortcuts outside the app scope', () => {
  const shortcuts = [{ name: 'Saved workout', url: '/app/?satin-route=%5B%5D' }]
  expect(
    JSON.parse(generateSatinManifestJson(defineSatinApp(input({ shortcuts })))).shortcuts,
  ).toEqual(shortcuts)
  expect(() =>
    defineSatinApp(input({ shortcuts: [{ name: 'Escape', url: '/outside/' }] })),
  ).toThrow()
  expect(() =>
    defineSatinApp(input({ shortcuts: [{ name: 'External', url: 'https://other.test/app/' }] })),
  ).toThrow()
})

it('validates and retains the viewport override', () => {
  expect(defineSatinApp(input()).viewportFit).toBe('adaptive')
  expect(defineSatinApp(input({ viewportFit: 'cover' })).viewportFit).toBe('cover')
  expect(() => defineSatinApp(input({ viewportFit: 'invalid' as 'auto' }))).toThrow('viewportFit')
})
