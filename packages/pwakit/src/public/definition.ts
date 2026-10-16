import {
  defineSatinApp,
  type AppDeploymentInput,
  type AppDefinition,
  type AppIcon,
} from '../app/definition.ts'
import type { ServerReachabilityConfig } from '../reachability/model.ts'
/** What an app declares about itself: identity, install metadata and launch appearance. */
export type AppDefinitionInput = {
  /** Built-in acknowledgements screen, available through navigation. Defaults to true. */
  acknowledgements?: boolean
  /** A lowercase slug (`'lift-log'`) or a root-relative path. It keys storage and restoration, so
   * never change it after install. */
  id: string
  /** The Home Screen name. */
  name: string
  /** Defaults to `name`. */
  shortName?: string
  /** Defaults to `name`. */
  description?: string
  /** One square source image (`{ source: '/icon-1024.png' }`) from which the build derives every
   * size, or explicit manifest icons. */
  icons: readonly AppIcon[] | { source: string }
  appearance?: {
    /** The app's accent colour, like an asset catalog `AccentColor`. */
    tint?: string
    /** The light launch background. Defaults to the grouped system background. */
    background?: string
    darkLaunch?: 'match-light' | { readonly background: string }
  }
  /** Defaults to portrait on iPhone and every orientation on iPad. */
  orientations?: AppDeploymentInput['orientations']
  capabilities?: AppDeploymentInput['capabilities']
  /** Deployment overrides. Declare connectivity beside the app's other requirements. */
  advanced?: {
    /** Release keeps updates for the next launch; preview enables live updates in Safari tabs. */
    updateProfile?: 'release' | 'preview'
    installRoute?: AppDeploymentInput['installRoute']
    platforms?: AppDeploymentInput['platforms']
    viewportFit?: AppDeploymentInput['viewportFit']
    launchScreen?: AppDeploymentInput['launchScreen']
    mdm?: AppDeploymentInput['mdm']
    appShell?: { additionalPrecache: readonly string[] }
    scope?: AppDeploymentInput['scope']
    startRoute?: AppDeploymentInput['startRoute']
    shortcuts?: AppDeploymentInput['shortcuts']
    updateActivation?: AppDeploymentInput['updateActivation']
  }
} & (
  | { readonly connectivity?: 'local'; readonly reachability?: never }
  | { readonly connectivity: 'server'; readonly reachability: ServerReachabilityConfig }
)
/**
 * Declares app identity, install metadata and capabilities once. Pass the result to `runApp` and
 * to the `@satinhq/kit/vite` plugin. Everything not given is defaulted and the whole definition is
 * validated, so a bad id or icon fails at build time rather than after install.
 *
 * @example
 * export const app = defineApp({ id: 'notes', name: 'Notes', icons: { source: '/icon.png' } })
 */
export function defineApp(input: AppDefinitionInput): AppDefinition {
  if (!input.id.startsWith('/') && !/^[a-z][a-z0-9-]*$/.test(input.id))
    throw new Error('App id must be a slug or root-relative identity')
  const advanced = input.advanced ?? {}
  const scope = advanced.scope ?? '/app/'
  const source = 'source' in input.icons ? input.icons.source : undefined
  const directory = source?.slice(0, source.lastIndexOf('/') + 1) ?? '/'
  const icons: readonly AppIcon[] = source
    ? [180, 192, 512].map(size => ({
        src: `${directory}satin-${input.id.replace(/[^a-z0-9-]/gi, '')}-icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
      }))
    : (input.icons as readonly AppIcon[])
  return defineSatinApp({
    id: input.id.startsWith('/') ? input.id : `/${input.id}`,
    name: input.name,
    acknowledgements: input.acknowledgements ?? true,
    shortName: input.shortName ?? input.name,
    description: input.description ?? input.name,
    icons,
    ...(source ? { iconSource: source } : {}),
    scope,
    startRoute: scope,
    installRoute: '/install',
    platforms: 'ios',
    appearance: {
      ...(input.appearance?.tint ? { tint: input.appearance.tint } : {}),
      background: input.appearance?.background ?? '#f2f2f7',
      darkLaunch: input.appearance?.darkLaunch ?? {
        background: '#000000',
      },
    },
    orientations: input.orientations ?? {
      supported: ['portrait'],
      fallback: 'responsive',
      ipad: { supported: ['portrait', 'landscape'], fallback: 'none' },
    },
    capabilities: input.capabilities ?? [],
    updateActivation: 'cold-launch',
    updateProfile: 'release',
    ...advanced,
    appShell: {
      additionalPrecache: advanced.appShell?.additionalPrecache ?? [],
    },
    connectivity: input.connectivity ?? 'local',
    ...(input.reachability ? { reachability: input.reachability } : {}),
  } as AppDeploymentInput)
}
