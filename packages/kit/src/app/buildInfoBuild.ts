import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { BuildInfo } from './buildInfo.ts'

/** One identity per Vite invocation, shared by every chunk of that app build. */
export function createBuildInfo(command: 'build' | 'serve'): BuildInfo {
  const framework = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  return {
    frameworkVersion: framework.version,
    appBuildId: randomUUID().replaceAll('-', ''),
    builtAt: new Date().toISOString(),
    buildKind: command === 'build' ? 'production' : 'development',
  }
}
