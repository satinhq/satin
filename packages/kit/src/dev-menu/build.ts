import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DevMenuBuild } from './types.ts'

export function devMenuBuild(
  root: string,
  option: boolean | { readonly statusUrl?: string; readonly version?: string } | undefined,
): DevMenuBuild {
  const settings = typeof option === 'object' ? option : {}
  if (settings.statusUrl) {
    const url = new URL(settings.statusUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Developer menu statusUrl must be an HTTP or HTTPS URL.')
    }
  }
  const git = (args: string[]) => {
    try {
      return execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      return 'unavailable'
    }
  }
  let version = 'unversioned'
  try {
    version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version ?? version
  } catch {
    // An app may have no package file of its own.
  }
  const framework = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  return {
    version: settings.version ?? version,
    branch: git(['branch', '--show-current']) || 'detached',
    commit: git(['rev-parse', 'HEAD']),
    frameworkVersion: framework.version,
    builtAt: new Date().toISOString(),
    statusUrl: settings.statusUrl,
  }
}
