/** Identity embedded in the running app's JavaScript bundle. The app build ID is
 * a unique build identifier, not a git revision or the service worker's cache hash. */
export type BuildInfo = Readonly<{
  frameworkVersion: string
  appBuildId: string
  builtAt: string | null
  buildKind: 'development' | 'production' | 'unavailable'
}>

const buildInfo: BuildInfo = Object.freeze(
  (import.meta as ImportMeta & { env?: { SATIN_BUILD_INFO?: BuildInfo } }).env
    ?.SATIN_BUILD_INFO ?? {
    frameworkVersion: 'unavailable',
    appBuildId: 'unavailable',
    builtAt: null,
    buildKind: 'unavailable',
  },
)

/** The build loaded by this app, including offline launches. Metadata comes from
 * satinApp at build time; it never reads the server's latest deployment. */
export function useBuildInfo(): BuildInfo {
  return buildInfo
}
