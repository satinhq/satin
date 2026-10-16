import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { installPage } from './install.ts'
import { defineSatinApp } from './definition.ts'
import { deploymentExpectation } from './deployment.ts'
import { defineApp } from '../public/definition.ts'
import { expect, it } from 'vitest'

const execute = promisify(execFile)
it.each([
  'healthy',
  'manifest-inventory',
  'launch-colors-missing',
  'missing-ipad',
  'range-ignored',
  'slow-page',
  'slow-resource',
  'timeout-page',
  'timeout-resource',
  'query-start',
  'query-slash-start',
  'nested-start',
  'query-start-missing',
  'canonical-install',
  'canonical-index',
  'canonical-start',
  'mime-case',
  'install-redirect',
  'same-scope-start-redirect',
  'bytes',
  'hash',
  'icon',
  'worker-redirect',
  'stale-worker',
  'start-redirect',
  'asset-redirect',
  'manifest-link',
  'missing-secondary',
  'asset-mime',
  'manifest-redirect',
  'page-redirect',
])(
  'CLI exit code rejects %s deployment faults',
  async fault => {
    const startPaths: Record<string, string> = {
      'query-start': '/app/today?tab=1',
      'query-slash-start': '/app/today/?tab=1',
      'nested-start': '/app/today/details',
      'query-start-missing': '/app/today?tab=1',
    }
    const app = {
      base: '/',
      id: '/test',
      start_url: startPaths[fault] ?? (fault === 'canonical-start' ? '/app' : '/app/'),
      scope: '/app/',
      installRoute: '/install',
      manifests: deploymentExpectation(
        defineApp({
          id: '/test',
          name: 'Test',
          icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
        }),
        '/',
      ).manifests,
      icons: ['/icon.png'],
      launchColors: { light: '#ffffff', dark: '#ffffff' } as
        { light: string; dark: string } | undefined,
    }
    if (fault === 'launch-colors-missing') delete app.launchColors
    if (fault === 'manifest-inventory')
      app.manifests = app.manifests.filter(path => !path.endsWith('-ipad.webmanifest'))
    const metadata = `<script id="satin-deployment" type="application/json">${JSON.stringify([app])}</script>`
    const asset = '// asset'
    const icon = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#fff' } })
      .png()
      .toBuffer()
    const server = createServer((request, response) => {
      const path = request.url!
      if (fault === 'missing-ipad' && path.endsWith('-ipad.webmanifest')) {
        response.writeHead(404)
        response.end('Missing iPad manifest')
        return
      }
      const redirect = (target: string) => {
        response.writeHead(302, { location: target })
        response.end()
      }
      if (fault === 'canonical-install' && path === '/install') return redirect('/install/')
      if (fault === 'canonical-index' && path === '/install') return redirect('/install/index.html')
      if (fault === 'canonical-start' && path === '/app') return redirect('/app/')
      if (fault === 'install-redirect' && path === '/install') return redirect('/other/install')
      if (fault === 'same-scope-start-redirect' && path === '/app/') return redirect('/app/other/')
      if (fault === 'worker-redirect' && path === '/app/sw.js') return redirect('/other/sw.js')
      if (fault === 'start-redirect' && path === '/app/') return redirect('/other/')
      if (fault === 'asset-redirect' && path === '/asset.js') return redirect('/other/asset.js')
      if (fault === 'manifest-redirect' && path === app.manifests[0])
        return redirect('/other/manifest.webmanifest')
      if (fault === 'page-redirect' && path === '/') return redirect('/other/')
      if (
        ['missing-secondary', 'query-start-missing'].includes(fault) &&
        path === '/secondary.js'
      ) {
        response.writeHead(404)
        response.end()
        return
      }
      let type = 'text/javascript'
      let body: string | Buffer = asset
      if (
        path === app.start_url ||
        path === '/' ||
        path === '/app/' ||
        path === '/other/' ||
        path === '/app/other/'
      ) {
        type = 'text/html'
        body = metadata + 'satin-document-head'
      } else if (
        ['/install', '/install/', '/install/index.html', '/other/install'].includes(path)
      ) {
        type = 'text/html'
        body = installPage(
          defineSatinApp({
            platforms: 'all',
            id: app.id,
            name: 'Test',
            shortName: 'Test',
            description: 'Fixture',
            scope: app.scope,
            startRoute: app.scope,
            installRoute: app.installRoute,
            icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
            appearance: {
              background: '#ffffff',
              darkLaunch: 'match-light',
            },
            orientations: { supported: ['portrait', 'landscape'], fallback: 'none' },
            connectivity: 'local',

            capabilities: [],
            updateActivation: 'cold-launch',
            appShell: { additionalPrecache: [] },
          }),
          'install',
        )
          .replace(/<script id="satin-deployment" type="application\/json">.*?<\/script>/, metadata)
          .replace(
            /<link rel="manifest" href="[^"]+">/,
            `<link rel="manifest" href="${fault === 'manifest-link' ? '/other.webmanifest' : app.manifests[0]}">`,
          )
      } else if (path.endsWith('.webmanifest')) {
        type = 'application/manifest+json'
        body = JSON.stringify({
          ...app,
          id: path === '/other.webmanifest' ? '/other' : app.id,
          icons: [{ src: '/icon.png' }],
          background_color: '#ffffff',
          theme_color: '#ffffff',
          color_scheme_dark: { background_color: '#ffffff', theme_color: '#ffffff' },
        })
      } else if (path === '/probe.m4a') {
        type = 'audio/mp4'
        body = Buffer.from([0, 0, 0, 20, 102, 116, 121, 112])
      } else if (path === '/icon.png') {
        type = 'image/png'
        body = fault === 'icon' ? 'garbage' : icon
      } else if (path === '/app/sw.js') {
        body = `const BUILD_ID = "${fault === 'stale-worker' ? 'old' : 'abc'}";`
      } else if (path === '/app/satin-version.json') {
        type = 'application/json'
        body = '{"buildId":"abc"}'
      } else if (path === '/precache-manifest.abc.json') {
        type = 'application/json'
        body = JSON.stringify({
          mediaProbe:
            fault === 'range-ignored'
              ? { url: '/probe.m4a', bytes: 8, prefix: '0000', type: 'audio/mp4' }
              : null,
          entries: [
            {
              url: '/asset.js',
              bytes: fault === 'bytes' ? 1000 : Buffer.byteLength(asset),
              revision:
                fault === 'hash'
                  ? '0'.repeat(64)
                  : createHash('sha256').update(asset).digest('hex'),
            },
            { url: '/secondary.js', bytes: Buffer.byteLength(asset), revision: null },
          ],
        })
      } else if (fault === 'asset-mime' && path === '/asset.js') type = 'text/plain'
      if (fault === 'mime-case')
        type = type === 'text/javascript' ? 'Text/JavaScript; charset=UTF-8' : type
      response.setHeader('content-type', type)
      if (
        (fault === 'timeout-page' && path === '/') ||
        (fault === 'timeout-resource' && path === '/icon.png')
      ) {
        response.flushHeaders()
        return
      }
      if (
        (fault === 'slow-page' && path === '/') ||
        (fault === 'slow-resource' && path === '/icon.png')
      ) {
        response.flushHeaders()
        setTimeout(() => response.end(body), 600)
        return
      }
      response.end(body)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    let exitCode = 0
    let output = ''
    try {
      const sourceUrl = new URL('./checkCli.ts', import.meta.url).href
      const sourceEntry = `
        import { runDeployCheck } from ${JSON.stringify(sourceUrl)}
        import { checkDeployment } from ${JSON.stringify(new URL('./deployment.ts', import.meta.url).href)}
        const fault = ${JSON.stringify(fault)}
        if (fault === 'slow-resource') {
          const failures = await checkDeployment(${JSON.stringify(app)}, process.argv[1], fetch, false, undefined, 150)
          console.log(JSON.stringify(failures))
        }
        const deadline = fault.startsWith('timeout-') ? 500 : fault.startsWith('slow-') ? 5000 : undefined
        try { process.exitCode = await runDeployCheck(process.argv[1], deadline) }
        catch (error) { console.error('FAIL ' + error.message); process.exitCode = 1 }
      `
      const result = await execute(process.execPath, [
        '--input-type=module',
        '--eval',
        sourceEntry,
        origin + (startPaths[fault] ?? (fault.startsWith('canonical-') ? '/install' : '/')),
      ])
      output = result.stdout + result.stderr
    } catch (error) {
      const result = error as { code: number; stdout: string; stderr: string }
      exitCode = result.code
      output = result.stdout + result.stderr
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
    if (fault === 'range-ignored') {
      expect(exitCode).toBe(1)
      expect(output).toContain('expected HTTP 206, received HTTP 200')
    }
    if (fault === 'healthy') expect(output).toContain('NOT APPLICABLE media transport')
    if (fault === 'launch-colors-missing')
      expect(output).toContain('Missing or invalid launch colors')
    if (fault.startsWith('timeout-')) {
      expect(exitCode).toBe(1)
      expect(output).toContain(
        `${fault === 'timeout-page' ? 'Page' : 'Icon'} did not finish within 0.5 s`,
      )
      expect(output).toContain('URL: ' + origin + (fault === 'timeout-page' ? '/' : '/icon.png'))
      expect(output).toContain('Check the server or connection')
      expect(output).not.toContain('Vite base')
    }
    if (fault === 'slow-resource') {
      expect(output).toContain('Icon did not finish within 0.15 s')
      expect(output).toContain('"transient":true')
    }
    if (
      process.env.PWAKIT_SCRATCH_ROOT &&
      [
        'manifest-inventory',
        'missing-ipad',
        'bytes',
        'worker-redirect',
        'missing-secondary',
        'canonical-install',
        'install-redirect',
      ].includes(fault)
    ) {
      await writeFile(
        process.env.PWAKIT_SCRATCH_ROOT + '/cli-' + fault + '.txt',
        output + '\nexit=' + exitCode + '\n',
      )
    }
    if (fault === 'manifest-inventory') expect(output).toContain('Manifest inventory')
    if (fault === 'missing-ipad') expect(output).toContain('-ipad.webmanifest')
    const healthy =
      fault === 'healthy' ||
      fault === 'slow-page' ||
      fault === 'slow-resource' ||
      fault.startsWith('canonical-') ||
      fault === 'mime-case' ||
      ['query-start', 'query-slash-start', 'nested-start'].includes(fault)
    if (fault === 'query-start-missing') expect(output).toContain('/secondary.js')
    expect({ exitCode, failed: output.includes('FAIL') }).toEqual({
      exitCode: healthy ? 0 : 1,
      failed: !healthy,
    })
  },
  45_000,
)

it('names an unreachable origin and exits 1 with a connection remedy', async () => {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  const url = `http://127.0.0.1:${address.port}/unreachable/`
  const sourceUrl = new URL('./checkCli.ts', import.meta.url).href
  const script = `import { runDeployCheck } from ${JSON.stringify(sourceUrl)}; try { process.exitCode = await runDeployCheck(process.argv[1]) } catch (error) { console.error('FAIL ' + error.message); process.exitCode = 1 }`
  try {
    await execute(process.execPath, [
      '--input-type=module',
      '--experimental-strip-types',
      '-e',
      script,
      url,
    ])
    throw new Error('Unreachable check unexpectedly passed')
  } catch (error) {
    const failure = error as { code: number; stderr: string }
    expect(failure.code).toBe(1)
    expect(failure.stderr).toContain('FAIL Server could not be reached')
    expect(failure.stderr).toContain('URL: ' + url)
    expect(failure.stderr).toContain('Start the server and check the URL and connection')
  }
})
