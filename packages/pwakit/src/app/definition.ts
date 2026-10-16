import type { ViewportFitPolicy } from './viewportValue.ts'
import type { LaunchScreenSlot } from './launchScreen.ts'
import { installAppearanceStore } from './appearanceStore.ts'
import type { ServerReachabilityConfig } from '../reachability/model.ts'

const DEFINITION = Symbol('AppDefinition')
const HEX_COLOR = /^#[0-9a-f]{6}$/iu
const OUTPUT_FILE = /^(?!\/)(?!.*(?:^|\/)\.\.?\/(?:|$))(?!.*\\).+/u
const ICON_SIZES = /^(?:any|\d+x\d+)(?: (?:any|\d+x\d+))*$/u

const capabilities = new Set<AppCapability>(['badging', 'background-work', 'push'])
const orientations = new Set<AppOrientation>(['landscape', 'portrait'])
const iconTypes = new Set<AppIcon['type']>(['image/png', 'image/svg+xml', 'image/webp'])
const iconPurposes = new Set<NonNullable<AppIcon['purpose']>>(['any', 'maskable', 'monochrome'])

/** A declared app capability that requires framework-owned runtime support. */
export type AppCapability = 'badging' | 'background-work' | 'push'
/** An orientation that the app supports. */
export type AppOrientation = 'landscape' | 'portrait'
/** The presentation policy when the window uses an unsupported orientation. */
export type OrientationFallback = 'letterbox' | 'none' | 'rotation-overlay' | 'responsive'
/** When a prepared app update may activate. */
export type UpdateActivation = 'cold-launch' | 'cold-launch-or-explicit'

export interface AppIcon {
  readonly purpose?: 'any' | 'maskable' | 'monochrome'
  readonly sizes: string
  readonly src: string
  readonly type: 'image/png' | 'image/svg+xml' | 'image/webp'
}

/** The resolved installation, appearance, storage and update policy of an app. */
export interface AppDeploymentOptions {
  /** Built-in acknowledgements destination. False removes the screen, not distribution notices. */
  readonly acknowledgements?: boolean
  /** Preview opts iOS Safari tabs into the existing live-update policy. */
  readonly updateProfile?: 'release' | 'preview'
  readonly installRoute?: string
  // ios requires installed standalone at release; dev profiles/server permit iOS tabs.
  // all disables the gate and does not add browser support.
  readonly platforms?: 'ios' | 'all'
  /** Adaptive phone title protection; iPad retains cover at every window size. */
  readonly viewportFit?: ViewportFitPolicy
  readonly launchScreen?: LaunchScreenSlot
  readonly mdm?: { readonly origin: string }
  readonly appShell: {
    readonly additionalPrecache: readonly string[]
  }
  readonly appearance: {
    readonly tint?: string
    readonly background: string
    readonly darkLaunch:
      | 'match-light'
      | {
          readonly background: string
        }
  }
  readonly capabilities: readonly AppCapability[]
  readonly description: string
  readonly iconSource?: string
  readonly icons: readonly AppIcon[]
  readonly id: string
  readonly name: string
  readonly orientations: {
    readonly fallback: OrientationFallback
    readonly supported: readonly AppOrientation[]
    /** iPad override; the top-level policy applies to iPhone. */
    readonly ipad?: {
      readonly supported: readonly AppOrientation[]
      readonly fallback: OrientationFallback
    }
  }
  readonly scope: string
  readonly shortName: string
  readonly startRoute: string
  readonly shortcuts?: readonly { readonly name: string; readonly url: string }[]
  readonly updateActivation: UpdateActivation
}

/** Resolved app deployment fields, including local or server connectivity. */
export type AppDeploymentInput = AppDeploymentOptions &
  (
    | {
        readonly connectivity: 'local'
        readonly reachability?: never
      }
    | {
        readonly connectivity: 'server'
        readonly reachability: ServerReachabilityConfig
      }
  )

export type AppDefinition = AppDeploymentInput & {
  readonly [DEFINITION]: true
}

export interface SatinAppShellPluginOptions {
  readonly additionalPrecache: readonly string[]
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid Satin app definition at ${path}: ${message}`)
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'expected an object.')
  }
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    fail(path, 'expected a non-empty string without surrounding whitespace.')
  }
}

function assertRootRelativeUrl(
  value: unknown,
  path: string,
  options: { readonly allowQuery: boolean; readonly requireTrailingSlash?: boolean },
) {
  assertString(value, path)
  if (!value.startsWith('/') || value.startsWith('//')) {
    fail(path, 'expected a same-origin root-relative URL.')
  }

  const parsed = new URL(value, 'https://satin.invalid')
  if (parsed.origin !== 'https://satin.invalid' || parsed.hash) {
    fail(path, 'expected a same-origin URL without a fragment.')
  }
  if (!options.allowQuery && parsed.search) fail(path, 'query parameters are not allowed.')
  if (options.requireTrailingSlash && !parsed.pathname.endsWith('/')) {
    fail(path, 'scope must end with a slash.')
  }

  return parsed
}

function assertStringArray(value: unknown, path: string) {
  if (!Array.isArray(value)) fail(path, 'expected an array.')
  return value.map((item, index) => {
    assertString(item, `${path}[${index}]`)
    return item
  })
}

function assertUnique(values: readonly string[], path: string) {
  if (new Set(values).size !== values.length) fail(path, 'duplicate entries are not allowed.')
}

function cloneAppearance(value: AppDeploymentOptions['appearance']) {
  assertRecord(value, 'appearance')
  assertString(value.background, 'appearance.background')
  if (!HEX_COLOR.test(value.background)) {
    fail('appearance.background', 'expected a six-digit hexadecimal color.')
  }
  let darkLaunch: AppDefinition['appearance']['darkLaunch']
  if (value.darkLaunch === 'match-light') {
    darkLaunch = 'match-light'
  } else {
    assertRecord(value.darkLaunch, 'appearance.darkLaunch')
    assertString(value.darkLaunch.background, 'appearance.darkLaunch.background')
    if (!HEX_COLOR.test(value.darkLaunch.background)) {
      fail('appearance.darkLaunch.background', 'expected a six-digit hexadecimal color.')
    }
    darkLaunch = Object.freeze({
      background: value.darkLaunch.background.toLowerCase(),
    })
  }

  if (value.tint !== undefined && (typeof value.tint !== 'string' || !HEX_COLOR.test(value.tint)))
    fail('appearance.tint', 'expected a six-digit hexadecimal color.')

  return Object.freeze({
    ...(value.tint ? { tint: value.tint.toLowerCase() } : {}),
    background: value.background.toLowerCase(),
    darkLaunch,
  })
}

function cloneOrientations(
  value: AppDeploymentOptions['orientations'],
): AppDeploymentOptions['orientations'] {
  assertRecord(value, 'orientations')
  const supported = assertStringArray(value.supported, 'orientations.supported')
  if (!supported.length) fail('orientations.supported', 'at least one orientation is required.')
  assertUnique(supported, 'orientations.supported')
  for (const orientation of supported) {
    if (!orientations.has(orientation as AppOrientation)) {
      fail('orientations.supported', `unsupported orientation ${JSON.stringify(orientation)}.`)
    }
  }

  const fallback = value.fallback as OrientationFallback
  if (!['letterbox', 'none', 'rotation-overlay', 'responsive'].includes(fallback)) {
    fail(
      'orientations.fallback',
      'expected "rotation-overlay", "responsive", "letterbox", or "none".',
    )
  }
  if (supported.length === 2 && fallback !== 'none') {
    fail('orientations.fallback', 'apps that support both orientations must use "none".')
  }
  if (supported.length === 1 && fallback === 'none') {
    fail('orientations.fallback', 'single-orientation apps need an honest runtime fallback.')
  }

  return Object.freeze({
    fallback,
    supported: Object.freeze([...supported]) as readonly AppOrientation[],
    ...(value.ipad ? { ipad: cloneOrientations(value.ipad) } : {}),
  })
}

function cloneIcons(value: readonly AppIcon[]) {
  if (!Array.isArray(value) || !value.length) fail('icons', 'at least one icon is required.')

  return Object.freeze(
    value.map((icon, index) => {
      const path = `icons[${index}]`
      assertRecord(icon, path)
      const src = icon.src
      const sizes = icon.sizes
      const type = icon.type
      const purpose = icon.purpose
      assertString(src, `${path}.src`)
      assertRootRelativeUrl(src, `${path}.src`, { allowQuery: false })
      assertString(sizes, `${path}.sizes`)
      if (!ICON_SIZES.test(sizes)) fail(`${path}.sizes`, 'expected manifest icon sizes.')
      if (!iconTypes.has(type as AppIcon['type'])) {
        fail(`${path}.type`, 'expected a supported image MIME type.')
      }
      if (purpose !== undefined && !iconPurposes.has(purpose as NonNullable<AppIcon['purpose']>)) {
        fail(`${path}.purpose`, 'expected "any", "maskable", or "monochrome".')
      }

      return Object.freeze({
        ...(purpose ? { purpose: purpose as NonNullable<AppIcon['purpose']> } : {}),
        sizes,
        src,
        type: type as AppIcon['type'],
      }) satisfies AppIcon
    }),
  )
}

function cloneAppShell(value: AppDeploymentOptions['appShell']) {
  assertRecord(value, 'appShell')
  const additionalPrecache = assertStringArray(
    value.additionalPrecache,
    'appShell.additionalPrecache',
  )
  assertUnique(additionalPrecache, 'appShell.additionalPrecache')

  for (const file of additionalPrecache) {
    if (!OUTPUT_FILE.test(file)) {
      fail('appShell.additionalPrecache', `invalid output-relative file ${JSON.stringify(file)}.`)
    }
  }

  return Object.freeze({
    additionalPrecache: Object.freeze([...additionalPrecache]),
  })
}

function cloneReachability(value: ServerReachabilityConfig) {
  assertRecord(value, 'reachability')
  assertRecord(value.probe, 'reachability.probe')
  assertRootRelativeUrl(value.probe.url, 'reachability.probe.url', { allowQuery: true })
  if (value.probe.method !== 'GET' && value.probe.method !== 'HEAD') {
    fail('reachability.probe.method', 'expected "GET" or "HEAD".')
  }
  if (!Number.isInteger(value.probe.timeoutMs) || value.probe.timeoutMs <= 0) {
    fail('reachability.probe.timeoutMs', 'expected a positive integer.')
  }
  if (!['local-first', 'requires-server'].includes(value.defaultRoutePolicy)) {
    fail('reachability.defaultRoutePolicy', 'expected a route reachability policy.')
  }
  assertRecord(value.routes, 'reachability.routes')
  const routes: Record<string, 'local-first' | 'requires-server'> = {}
  for (const [route, policy] of Object.entries(value.routes)) {
    assertString(route, 'reachability.routes key')
    if (policy !== 'local-first' && policy !== 'requires-server') {
      fail(`reachability.routes.${route}`, 'expected a route reachability policy.')
    }
    routes[route] = policy
  }
  assertRecord(value.surfaces, 'reachability.surfaces')
  if (value.surfaces.localFirst !== 'banner' && value.surfaces.localFirst !== 'none') {
    fail('reachability.surfaces.localFirst', 'expected "banner" or "none".')
  }
  if (!['banner', 'full-screen', 'none'].includes(value.surfaces.requiresServer)) {
    fail('reachability.surfaces.requiresServer', 'expected an offline surface policy.')
  }

  return Object.freeze({
    defaultRoutePolicy: value.defaultRoutePolicy,
    probe: Object.freeze({
      method: value.probe.method,
      timeoutMs: value.probe.timeoutMs,
      url: value.probe.url,
    }),
    routes: Object.freeze(routes),
    surfaces: Object.freeze({ ...value.surfaces }),
  })
}

export function defineSatinApp(input: AppDeploymentInput): AppDefinition {
  assertRecord(input, 'app')
  assertString(input.id, 'id')
  assertString(input.name, 'name')
  assertString(input.shortName, 'shortName')
  assertString(input.description, 'description')
  const id = assertRootRelativeUrl(input.id, 'id', { allowQuery: false })
  const scope = assertRootRelativeUrl(input.scope, 'scope', {
    allowQuery: false,
    requireTrailingSlash: true,
  })
  const startRoute = assertRootRelativeUrl(input.startRoute, 'startRoute', {
    allowQuery: true,
  })
  if (scope.pathname !== '/' && !startRoute.pathname.startsWith(scope.pathname)) {
    fail('startRoute', 'route must stay inside the declared scope.')
  }

  const shortcuts = input.shortcuts?.map((shortcut, index) => {
    assertString(shortcut.name, `shortcuts[${index}].name`)
    const url = assertRootRelativeUrl(shortcut.url, `shortcuts[${index}].url`, { allowQuery: true })
    if (!url.pathname.startsWith(scope.pathname))
      fail(`shortcuts[${index}].url`, 'shortcut must stay inside the app scope.')
    return Object.freeze({ name: shortcut.name, url: `${url.pathname}${url.search}` })
  })
  const requestedCapabilities = assertStringArray(input.capabilities, 'capabilities')
  assertUnique(requestedCapabilities, 'capabilities')
  for (const capability of requestedCapabilities) {
    if (!capabilities.has(capability as AppCapability)) {
      fail('capabilities', `unknown capability ${JSON.stringify(capability)}.`)
    }
  }

  if (!['cold-launch', 'cold-launch-or-explicit'].includes(input.updateActivation)) {
    fail('updateActivation', 'expected a safe measured-reference activation policy.')
  }

  const installRoute = assertRootRelativeUrl(input.installRoute ?? '/install', 'installRoute', {
    allowQuery: false,
  }).pathname
  if (
    [
      '/',
      scope.pathname.replace(/\/$/, '') || '/',
      startRoute.pathname.replace(/\/$/, '') || '/',
      scope.pathname + 'unsupported.html',
    ].includes(installRoute.replace(/\/$/, '') || '/')
  )
    fail('installRoute', 'must not collide with the app entry or platform gate.')
  if (input.updateProfile !== undefined && !['release', 'preview'].includes(input.updateProfile))
    fail('updateProfile', 'expected release or preview.')
  if (input.platforms !== undefined && !['ios', 'all'].includes(input.platforms))
    fail('platforms', 'expected ios or all.')
  if (input.launchScreen) {
    if (input.launchScreen.icon)
      assertRootRelativeUrl(input.launchScreen.icon, 'launchScreen.icon', { allowQuery: false })
    if (input.launchScreen.label !== undefined)
      assertString(input.launchScreen.label, 'launchScreen.label')
  }
  if (input.mdm) {
    const origin = new URL(input.mdm.origin)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== input.mdm.origin)
      fail('mdm.origin', 'expected an HTTP(S) origin without a path.')
  }
  if (
    input.viewportFit !== undefined &&
    !['adaptive', 'auto', 'cover', 'contain'].includes(input.viewportFit)
  )
    fail('viewportFit', 'expected adaptive, auto, cover, or contain.')
  if (input.acknowledgements !== undefined && typeof input.acknowledgements !== 'boolean')
    fail('acknowledgements', 'expected a boolean.')
  const common = {
    acknowledgements: input.acknowledgements ?? true,
    viewportFit: input.viewportFit ?? 'adaptive',
    updateProfile: input.updateProfile ?? 'release',
    installRoute,
    platforms: input.platforms ?? 'ios',
    ...(input.launchScreen ? { launchScreen: Object.freeze({ ...input.launchScreen }) } : {}),
    ...(input.mdm ? { mdm: Object.freeze({ ...input.mdm }) } : {}),
    [DEFINITION]: true as const,
    appShell: cloneAppShell(input.appShell),
    ...(input.iconSource
      ? {
          iconSource: assertRootRelativeUrl(input.iconSource, 'iconSource', { allowQuery: false })
            .pathname,
        }
      : {}),
    appearance: cloneAppearance(input.appearance),
    capabilities: Object.freeze([...requestedCapabilities]) as readonly AppCapability[],
    description: input.description,
    icons: cloneIcons(input.icons),
    id: id.pathname,
    name: input.name,
    orientations: cloneOrientations(input.orientations),
    scope: scope.pathname,
    shortName: input.shortName,
    startRoute: `${startRoute.pathname}${startRoute.search}`,
    ...(shortcuts ? { shortcuts: Object.freeze(shortcuts) } : {}),
    updateActivation: input.updateActivation,
  }

  if (input.connectivity === 'local') {
    if ('reachability' in input && input.reachability !== undefined) {
      fail('reachability', 'local apps cannot declare a server reachability policy.')
    }
    return Object.freeze({ ...common, connectivity: 'local' })
  }
  if (input.connectivity !== 'server') {
    fail('connectivity', 'expected "local" or "server".')
  }

  return Object.freeze({
    ...common,
    connectivity: 'server',
    reachability: cloneReachability(input.reachability),
  })
}

function manifestOrientation(definition: AppDefinition, idiom: 'phone' | 'pad') {
  const policy =
    idiom === 'pad'
      ? (definition.orientations.ipad ?? definition.orientations)
      : definition.orientations
  return policy.supported.length === 2 ? 'any' : policy.supported[0]
}

export function generateSatinManifestJson(
  definition: AppDefinition,
  idiom: 'phone' | 'pad' = 'phone',
) {
  return `${JSON.stringify(
    {
      name: definition.name,
      short_name: definition.shortName,
      description: definition.description,
      start_url: definition.startRoute,
      ...(definition.shortcuts ? { shortcuts: definition.shortcuts } : {}),
      scope: definition.scope,
      id: definition.id,
      display: 'standalone',
      orientation: manifestOrientation(definition, idiom),
      background_color: definition.appearance.background,
      theme_color: definition.appearance.background,
      color_scheme_dark: {
        background_color:
          definition.appearance.darkLaunch === 'match-light'
            ? definition.appearance.background
            : definition.appearance.darkLaunch.background,
        theme_color:
          definition.appearance.darkLaunch === 'match-light'
            ? definition.appearance.background
            : definition.appearance.darkLaunch.background,
      },
      icons: definition.icons,
    },
    null,
    2,
  )}\n`
}

export function generatePreReactAppearanceScript(definition: AppDefinition) {
  const light = {
    background: definition.appearance.background,
  }
  const dark =
    definition.appearance.darkLaunch === 'match-light' ? light : definition.appearance.darkLaunch

  return `;(() => {
  const launchAppearance = ${JSON.stringify({ dark, light })}
  const store = (${installAppearanceStore.toString()})(${JSON.stringify('satin-appearance:v1:' + definition.id)})
  const applyLaunchAppearance = () => {
    const selected = store.getSnapshot().dark ? launchAppearance.dark : launchAppearance.light
    document.documentElement.style.backgroundColor = selected.background
    document.querySelector('#satin-theme-color')?.setAttribute('content', selected.background)
  }
  applyLaunchAppearance()
  store.subscribe(applyLaunchAppearance)
})()`
}

export function generateAppShellPluginOptions(
  definition: AppDefinition,
): SatinAppShellPluginOptions {
  return Object.freeze({
    additionalPrecache: Object.freeze([...definition.appShell.additionalPrecache]),
  })
}
