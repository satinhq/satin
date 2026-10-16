import { readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  deriveAppShellManifest,
  type AppShellPrecacheManifest,
  type DeriveAppShellManifestOptions,
} from './manifest.ts'
import { APP_SHELL_VERSION_FILE } from './protocol.ts'
import { renderServiceWorker } from './renderServiceWorker.ts'

const GENERATED_MANIFEST = /^precache-manifest\.[a-f0-9]+\.json$/u

export interface GenerateAppShellOptions extends DeriveAppShellManifestOptions {
  readonly publicRoutes?: readonly string[]
  /** Read-only legacy asset fallbacks; ambiguous unscoped caches are retained. */
  readonly legacyCacheNames?: readonly string[]
  /** Explicit diagnostic build only; production serves cached responses unchanged. */
  readonly diagnosticTimingHeaders?: boolean
}

export interface GeneratedAppShellArtifacts {
  readonly manifest: AppShellPrecacheManifest
  readonly manifestFile: string
  readonly serviceWorkerFile: string
}

async function removePreviousArtifacts(outDir: string) {
  await rm(resolve(outDir, 'sw.js'), { force: true })
  await rm(resolve(outDir, APP_SHELL_VERSION_FILE), { force: true })
  const files = await readdir(outDir)
  await Promise.all(
    files
      .filter(file => GENERATED_MANIFEST.test(file))
      .map(file => rm(resolve(outDir, file), { force: true })),
  )
}

export async function generateAppShell({
  publicRoutes,
  legacyCacheNames,
  diagnosticTimingHeaders = false,
  ...manifestOptions
}: GenerateAppShellOptions): Promise<GeneratedAppShellArtifacts> {
  const outDir = resolve(manifestOptions.outDir)
  await removePreviousArtifacts(outDir)
  const manifest = await deriveAppShellManifest({ ...manifestOptions, outDir })
  const manifestFile = resolve(outDir, `precache-manifest.${manifest.buildId}.json`)
  const serviceWorkerFile = resolve(outDir, 'sw.js')

  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(
    serviceWorkerFile,
    renderServiceWorker({ legacyCacheNames, publicRoutes, diagnosticTimingHeaders, manifest }),
    'utf8',
  )

  // This discovery hint is network-only and excluded from the bundle hash.
  await writeFile(
    resolve(outDir, APP_SHELL_VERSION_FILE),
    JSON.stringify({ format: 1, buildId: manifest.buildId }) + '\n',
    'utf8',
  )
  return { manifest, manifestFile, serviceWorkerFile }
}
