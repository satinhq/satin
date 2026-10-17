import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateBuiltDeployment } from './deploymentBuild.ts'
import type { DeploymentExpectation } from './deployment.ts'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
it('rejects a missing emitted precache file and mismatched manifest fields', async () => {
  const root = await mkdtemp(join(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'guard-build-'))
  directories.push(root)
  const expected: DeploymentExpectation = {
    base: '/fixed/',
    id: '/guard',
    start_url: '/fixed/',
    scope: '/fixed/',
    installRoute: '/fixed/install',
    manifests: ['/fixed/app.webmanifest'],
    icons: ['/fixed/icon.png'],
    launchColors: { light: '#ffffff', dark: '#ffffff' },
  }
  await mkdir(join(root, 'install'))
  for (const name of ['index.html', 'install/index.html', 'sw.js', 'icon.png'])
    await writeFile(join(root, name), '')
  await writeFile(
    join(root, 'app.webmanifest'),
    JSON.stringify({ ...expected, icons: expected.icons.map(src => ({ src })) }),
  )
  await writeFile(join(root, 'satin-version.json'), JSON.stringify({ buildId: 'abc' }))
  await writeFile(
    join(root, 'precache-manifest.abc.json'),
    JSON.stringify({ entries: [{ url: '/fixed/asset.js' }] }),
  )
  await expect(validateBuiltDeployment(root, expected)).rejects.toThrow(
    'required file /fixed/asset.js is missing',
  )
  await writeFile(join(root, 'asset.js'), '')
  await expect(validateBuiltDeployment(root, expected)).resolves.toBeUndefined()
  await writeFile(
    join(root, 'app.webmanifest'),
    JSON.stringify({ ...expected, icons: expected.icons.map(src => ({ src })), scope: '/' }),
  )
  await expect(validateBuiltDeployment(root, expected)).rejects.toThrow(
    'manifest scope must equal /fixed/',
  )
})
