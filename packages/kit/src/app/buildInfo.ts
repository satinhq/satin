/** The framework version, build id, build time and build kind baked into the running bundle.
 * The build id is unique per build. */
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

/** Returns the build that is running, even offline. The values are written by `satinApp` at
 * build time; it never asks the server for the latest deployment. */
export function useBuildInfo(): BuildInfo {
  return buildInfo
}
