import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import sharp from 'sharp'
import { checkDeployment as runCheckDeployment, type DeploymentExpectation } from './deployment.ts'

const checkDeployment = (
  expected: DeploymentExpectation,
  page: string,
  fetcher: typeof fetch = fetch,
  precache = false,
) =>
  runCheckDeployment(expected, page, fetcher, precache, async bytes => {
    await sharp(bytes).raw().toBuffer()
  })
let server: Server
let origin: string
const expected: DeploymentExpectation = {
  base: '/',
  id: '/test',
  start_url: '/app/',
  scope: '/app/',
  installRoute: '/install',
  manifests: ['/manifest.webmanifest', '/dark.webmanifest'],
  icons: ['/icon.png'],
  launchColors: { light: '#ffffff', dark: '#ffffff' },
}
let fault = ''
beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url!
    if (path === fault) {
      response.writeHead(404)
      response.end('Missing')
      return
    }
    if (fault === 'html-manifest' && path.endsWith('.webmanifest')) {
      response.setHeader('content-type', 'text/html')
      response.end('<html>Fallback</html>')
      return
    }
    let type = 'application/json'
    let body = '{}'
    if (path.endsWith('.webmanifest'))
      body = JSON.stringify({
        ...expected,
        background_color: '#ffffff',
        theme_color: '#ffffff',
        color_scheme_dark: { background_color: '#ffffff', theme_color: '#ffffff' },
        start_url: fault === 'invalid-start' ? 'http://[' : expected.start_url,
        icons:
          fault === 'duplicate-icons'
            ? [{ src: '/icon.png' }, { src: '/icon.png' }]
            : [{ src: '/icon.png' }],
      })
    else if (path === '/app/sw.js') {
      type = 'text/javascript'
      body =
        fault === 'missing-worker-id'
          ? '// worker'
          : 'const BUILD_ID = ' +
            JSON.stringify(fault === 'stale-worker' ? 'old-build' : 'abc') +
            '\n'
    } else if (path === '/icon.png') {
      type = 'image/png'
      body = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
        'base64',
      ) as unknown as string
    } else if (path === '/app/') {
      type = 'text/html'
      body =
        fault === 'install-start'
          ? 'data-satin-install-page'
          : 'satin-document-head<script id="satin-deployment" type="application/json">' +
            JSON.stringify([expected]) +
            '</script>'
    } else if (path === '/install') {
      type = 'text/html'
      body =
        fault === 'unwrapped-install'
          ? '<body data-satin-install-page><link rel="manifest" href="/manifest.webmanifest">'
          : '<body data-satin-install-page><link rel="manifest" href="/manifest.webmanifest">' +
            (fault === 'custom-entry' || fault === '/app/assets/install.js'
              ? '<script data-satin-install-check data-satin-install-entry="/app/assets/install.js">'
              : fault === 'embedded-source'
                ? '<script data-satin-install-check>' +
                  String(runCheckDeployment) +
                  '/data-satin-install-entry="([^"]+)"/'
                : '<script data-satin-install-check>')
      body +=
        '<script id="satin-deployment" type="application/json">' +
        JSON.stringify([expected]) +
        '</script>'
    } else if (path === '/app/assets/install.js') {
      type = 'text/javascript'
      body = '// author page'
    } else if (path === '/app/satin-version.json') body = JSON.stringify({ buildId: 'abc' })
    else if (path === '/precache-manifest.abc.json')
      body = JSON.stringify({
        entries: [{ url: fault === 'invalid-inventory' ? '/asset.js?escape=1' : '/asset.js' }],
      })
    else if (path === '/asset.js') {
      type = 'text/javascript'
      body = '// asset'
    }
    response.setHeader('content-type', type)
    response.end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port
})
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})
it('accepts a complete deployment and precache inventory', async () => {
  fault = ''
  expect(await checkDeployment(expected, origin + '/install', fetch, true)).toEqual([])
})
it.each([false, true])('rejects a stale worker with precache checking %s', async precache => {
  fault = 'stale-worker'
  const failures = await checkDeployment(expected, origin + '/install', fetch, precache)
  expect(failures).toContainEqual(
    expect.objectContaining({
      url: origin + '/app/sw.js',
      reason:
        'Service worker is from build old-build, the deployment is build abc: redeploy sw.js / purge the CDN cache for it',
    }),
  )
})
it('rejects a worker without an embedded build identity', async () => {
  fault = 'missing-worker-id'
  const failures = await checkDeployment(expected, origin + '/install')
  expect(
    failures.some(failure =>
      failure.reason.includes('Service worker build ID is missing or invalid'),
    ),
  ).toBe(true)
})
it.each(['/manifest.webmanifest', '/app/sw.js', '/app/', '/icon.png', '/asset.js'])(
  'reports a missing %s with its URL',
  async path => {
    fault = path
    const failures = await checkDeployment(expected, origin + '/install', fetch, true)
    expect(
      failures.some(
        failure => failure.url === origin + path && failure.reason.includes('HTTP 404'),
      ),
    ).toBe(true)
  },
)
it('rejects an install page that does not run Satin’s deployment check', async () => {
  fault = 'unwrapped-install'
  const failures = await checkDeployment(expected, origin + '/install', fetch, true)
  expect(failures.map(failure => failure.reason)).toContain(
    'Install page does not run the Satin deployment check.',
  )
})
it('does not mistake the embedded check source for a custom entry', async () => {
  fault = 'embedded-source'
  expect(await checkDeployment(expected, origin + '/install', fetch, true)).toEqual([])
})
it('accepts a wrapped custom install page whose entry loads', async () => {
  fault = 'custom-entry'
  expect(await checkDeployment(expected, origin + '/install', fetch, true)).toEqual([])
})
it('rejects a custom install page whose entry is missing', async () => {
  fault = '/app/assets/install.js'
  const failures = await checkDeployment(expected, origin + '/install', fetch, true)
  expect(
    failures.some(
      failure =>
        failure.url === origin + '/app/assets/install.js' && failure.reason.includes('HTTP 404'),
    ),
  ).toBe(true)
})
it('rejects a successful HTML fallback for a missing manifest', async () => {
  fault = 'html-manifest'
  expect((await checkDeployment(expected, origin + '/install'))[0]!.reason).toContain(
    'received text/html',
  )
})
it('rejects an install page used as start_url', async () => {
  fault = 'install-start'
  expect(
    (await checkDeployment(expected, origin + '/install')).some(failure =>
      failure.reason.includes('serves the install page'),
    ),
  ).toBe(true)
})
it('rejects insecure remote origins without making requests', async () => {
  const failures = await checkDeployment(expected, 'http://example.com/install')
  expect(failures[0]!.reason).toContain('HTTPS is required')
})

it.each(['invalid-start', 'invalid-inventory'])(
  'reports malformed manifest %s without throwing',
  async value => {
    fault = value
    const failures = await checkDeployment(expected, origin + '/install', fetch, true)
    expect(
      failures.some(failure =>
        failure.reason.includes(value === 'invalid-start' ? 'valid URL' : 'invalid URLs'),
      ),
    ).toBe(true)
  },
)

it('accepts multiple icon size declarations using the same image', async () => {
  fault = 'duplicate-icons'
  expect(await checkDeployment(expected, origin + '/install')).toEqual([])
})

it('rejects normalized precache URLs that leave the deployment base before fetching them', async () => {
  const requested: string[] = []
  const fetcher: typeof fetch = async (input, options) => {
    const url = String(input)
    requested.push(url)
    if (url.includes('/app/precache-manifest.')) {
      return new Response(JSON.stringify({ entries: [{ url: '/app/../outside.js' }] }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return fetch(input, options)
  }
  const failures = await checkDeployment(
    { ...expected, base: '/app/' },
    origin + '/install',
    fetcher,
    true,
  )
  expect(failures.some(failure => failure.reason.includes('invalid URLs'))).toBe(true)
  expect(requested.some(url => url.includes('outside.js'))).toBe(false)
})

it.each([
  ['/manifest.webmanifest', 'Manifest'],
  ['/dark.webmanifest', 'Dark-mode manifest'],
  ['/app/sw.js', 'Service worker'],
  ['/app/', 'App page'],
  ['/icon.png', 'Icon'],
])('names the failed resource at %s as %s', async (path, label) => {
  fault = path
  const failures = await checkDeployment(expected, origin + '/install')
  expect(failures.some(failure => failure.url === origin + path && failure.check === label)).toBe(
    true,
  )
  fault = ''
})

it.each([true, false])(
  'distinguishes subresource transport failure from HTTP failure: %s',
  async transportFailure => {
    const fetcher: typeof fetch = async (input, options) => {
      if (String(input).includes('/icon.png')) {
        if (transportFailure) throw new TypeError('Connection lost')
        return new Response('missing', { status: 404 })
      }
      return fetch(input, options)
    }
    const failures = await runCheckDeployment(expected, origin + '/install', fetcher)
    const failure = failures.find(item => item.check === 'Icon')
    expect(failure?.transient).toBe(transportFailure)
    expect(failure?.fix).toMatch(transportFailure ? /server or connection/ : /base|deploy|Deploy/)
  },
)
