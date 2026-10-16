import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { APP_SHELL_VERSION_FILE } from './protocol.ts'
import { generateAppShell } from './generator.ts'

export interface SatinAppShellPluginOptions {
  readonly mediaProbe?: string
  readonly shellFile?: string
  readonly shellUrl?: string
  /** Output-relative public files that are part of an app screen but not the Vite bundle graph. */
  readonly additionalPrecache?: readonly string[]
  /** Exact pre-generator cache names to remove during the first generated-worker activation. */
  readonly publicRoutes?: readonly string[]
  /** Read-only legacy asset fallbacks; ambiguous unscoped caches are retained. */
  readonly legacyCacheNames?: readonly string[]
  /** Explicit diagnostic build only; production serves cached responses unchanged. */
  readonly diagnosticTimingHeaders?: boolean
}

export function satinAppShell(options: SatinAppShellPluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined
  let outputWritten = false
  const bundleFiles = new Set<string>()

  return {
    name: 'satin:app-shell',
    apply: 'build',
    enforce: 'post',
    buildStart() {
      outputWritten = false
    },
    writeBundle() {
      outputWritten = true
    },
    renderError() {
      outputWritten = false
    },
    // Installed WebKit glass identity depends on retaining authored CSS declarations.
    // Vite 8's default CSS optimizer changes resting canvas/rim pixels.
    config() {
      return { build: { cssMinify: false } }
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    generateBundle(_outputOptions, bundle) {
      bundleFiles.clear()
      for (const output of Object.values(bundle)) bundleFiles.add(output.fileName)
    },
    closeBundle: {
      sequential: true,
      async handler() {
        if (!outputWritten) return
        if (!config) throw new Error('Satin app-shell plugin did not receive Vite config.')
        if (!config.build.write) return

        const {
          additionalPrecache,
          mediaProbe,
          shellFile,
          shellUrl,
          publicRoutes,
          legacyCacheNames,
          diagnosticTimingHeaders,
        } = options
        await generateAppShell({
          additionalPrecache,
          mediaProbe,
          shellFile,
          shellUrl,
          base: config.base,
          bundleFiles,
          legacyCacheNames,
          publicRoutes,
          diagnosticTimingHeaders,
          outDir: resolve(config.root, config.build.outDir),
        })
        if (shellUrl && shellUrl !== config.base) {
          const out = resolve(config.root, config.build.outDir)
          await mkdir(resolve(out, shellUrl.slice(config.base.length)), { recursive: true })
          await copyFile(
            resolve(out, 'sw.js'),
            resolve(out, shellUrl.slice(config.base.length), 'sw.js'),
          )
          await copyFile(
            resolve(out, APP_SHELL_VERSION_FILE),
            resolve(out, shellUrl.slice(config.base.length), APP_SHELL_VERSION_FILE),
          )
        }
      },
    },
  }
}

// measured-reference: definition-owned build integration.
export { satinApp, satinAppFixtures, type SatinAppOptions } from '../app/vite.ts'
export { defineApp } from '../public/definition.ts'
/** Lab fixture definition, outside the stable app API. */
export { defineSatinApp as defineAppFixture } from '../app/definition.ts'
export type { AppFixture } from '../app/head.ts'
