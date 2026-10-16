import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkDeployment, deploymentExpectation, type DeploymentExpectation } from './deployment.ts'
import { defineApp } from '../public/definition.ts'
import { appManifestFiles } from './manifests.ts'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import type { AppDefinitionInput } from '../public/definition.ts'

// Execute the starter data without adding its separate app project to this package's typecheck.
const templateSource = readFileSync(
  new URL('../../../../templates/basic/src/app.ts', import.meta.url),
  'utf8',
)
const template = runInNewContext(
  stripTypeScriptTypes(templateSource).replace('export const app =', 'const app =') + '\napp',
) as AppDefinitionInput

const origin = 'https://satin.test'
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

type Reply = () => Response | Promise<Response>

function deployment(overrides: Record<string, Reply> = {}) {
  const replies: Record<string, Reply> = {
    '/manifest.webmanifest': manifest,
    '/dark.webmanifest': manifest,
    '/icon.png': () =>
      new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }),
    '/app/sw.js': () => reply('const BUILD_ID = "fixture"', 'text/javascript'),
    '/app/': () =>
      reply(
        'satin-document-head<script id="satin-deployment" type="application/json">' +
          JSON.stringify([expected]) +
          '</script>',
        'text/html',
      ),
    '/install': () =>
      reply(
        'data-satin-install-page<link rel="manifest" href="/manifest.webmanifest"><script data-satin-install-check></script>' +
          '<script id="satin-deployment" type="application/json">' +
          JSON.stringify([expected]) +
          '</script>',
        'text/html',
      ),
    '/app/satin-version.json': () =>
      reply(JSON.stringify({ buildId: 'fixture' }), 'application/json'),
    '/precache-manifest.fixture.json': () =>
      reply(JSON.stringify({ entries: [{ url: '/asset.js' }] }), 'application/json'),
    '/asset.js': () => reply('// asset', 'text/javascript'),
    ...overrides,
  }
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const respond = replies[new URL(url).pathname]
    if (!respond) throw new Error(`Unexpected fixture request: ${url}`)
    return respond()
  })
  const decodeImage = vi.fn(async () => undefined)
  return { fetcher, decodeImage }
}

function reply(body: string, contentType: string) {
  return new Response(body, { headers: { 'content-type': contentType } })
}

function manifest() {
  return reply(
    JSON.stringify({
      ...expected,
      icons: [{ src: '/icon.png' }],
      background_color: '#ffffff',
      theme_color: '#ffffff',
      color_scheme_dark: { background_color: '#ffffff', theme_color: '#ffffff' },
    }),
    'application/manifest+json',
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('deployment checks with injected responses', () => {
  it.each([
    undefined,
    null,
    { light: '#ffffff' },
    { light: '#ffffff', dark: '#fff' },
    { light: 16777215, dark: '#000000' },
  ])('refuses missing or malformed launch metadata before fetching resources: %j', async colors => {
    const { fetcher, decodeImage } = deployment()
    const failures = await checkDeployment(
      { ...expected, launchColors: colors } as DeploymentExpectation,
      origin + '/install',
      fetcher,
      false,
      decodeImage,
    )
    expect(failures).toContainEqual(
      expect.objectContaining({
        reason: expect.stringContaining('Missing or invalid launch colors'),
        fix: expect.stringContaining('Rebuild'),
      }),
    )
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('compares hexadecimal launch colors without rejecting letter case differences', async () => {
    const { fetcher, decodeImage } = deployment()
    expect(
      await checkDeployment(
        { ...expected, launchColors: { light: '#FFFFFF', dark: '#FFFFFF' } },
        origin + '/install',
        fetcher,
        false,
        decodeImage,
      ),
    ).toEqual([])
  })

  it.each(['light', 'dark'] as const)(
    'checks each background and theme field in every manifest: %s',
    async appearance => {
      for (const path of expected.manifests) {
        for (const field of ['background_color', 'theme_color'] as const) {
          const value = JSON.parse(await manifest().text())
          const colors = appearance === 'light' ? value : value.color_scheme_dark
          colors[field] = '#ababab'
          const { fetcher, decodeImage } = deployment({
            [path]: () => reply(JSON.stringify(value), 'application/manifest+json'),
          })
          const failures = await checkDeployment(
            expected,
            origin + '/install',
            fetcher,
            false,
            decodeImage,
          )
          expect(failures.filter(failure => failure.reason.includes('launch color'))).toEqual([
            expect.objectContaining({
              url: origin + path,
              reason: expect.stringContaining(`${appearance} ${field}`),
            }),
          ])
        }
      }
    },
  )

  it('keeps public and starter defaults aligned across every generated appearance and idiom', () => {
    for (const app of [
      defineApp({ id: 'defaults', name: 'Defaults', icons: template.icons }),
      defineApp(template),
    ]) {
      expect(deploymentExpectation(app, '/').launchColors).toEqual({
        light: '#f2f2f7',
        dark: '#000000',
      })
      const manifests = Object.values(appManifestFiles(app, 'default'))
      expect(manifests).toHaveLength(3)
      for (const manifest of manifests)
        expect(JSON.parse(manifest)).toMatchObject({
          background_color: '#f2f2f7',
          theme_color: '#f2f2f7',
          color_scheme_dark: { background_color: '#000000', theme_color: '#000000' },
        })
    }
  })

  it('preserves explicit match-light launch colors in the emitted metadata and manifests', () => {
    const app = defineApp({
      ...template,
      appearance: { background: '#123456', darkLaunch: 'match-light' },
    })
    expect(deploymentExpectation(app, '/').launchColors).toEqual({
      light: '#123456',
      dark: '#123456',
    })
    for (const manifest of Object.values(appManifestFiles(app, 'match')))
      expect(JSON.parse(manifest)).toMatchObject({
        background_color: '#123456',
        theme_color: '#123456',
        color_scheme_dark: { background_color: '#123456', theme_color: '#123456' },
      })
  })

  it('publishes the app launch colors for deployment validation', () => {
    const app = defineApp({
      id: '/launch',
      name: 'Launch',
      icons: [{ src: '/icon.png', sizes: '512x512', type: 'image/png' }],
      appearance: { background: '#ffffff', darkLaunch: { background: '#101010' } },
    })
    expect(deploymentExpectation(app, '/')).toMatchObject({
      launchColors: { light: '#ffffff', dark: '#101010' },
    })
  })

  it('rejects a manifest that disagrees with the declared launch colors in either appearance', async () => {
    const colors = { light: '#ffffff', dark: '#101010' }
    const launchExpected = { ...expected, launchColors: colors }
    const wrongManifest = (dark: boolean) => () =>
      reply(
        JSON.stringify({
          ...expected,
          icons: [{ src: '/icon.png' }],
          background_color: dark ? colors.light : '#000000',
          theme_color: colors.light,
          color_scheme_dark: {
            background_color: dark ? colors.light : colors.dark,
            theme_color: colors.dark,
          },
        }),
        'application/manifest+json',
      )
    for (const dark of [false, true]) {
      const { fetcher, decodeImage } = deployment({ '/manifest.webmanifest': wrongManifest(dark) })
      const failures = await checkDeployment(
        launchExpected,
        origin + '/install',
        fetcher,
        false,
        decodeImage,
      )
      expect(failures).toContainEqual(
        expect.objectContaining({
          reason: expect.stringContaining(
            dark ? 'dark background_color' : 'light background_color',
          ),
          fix: expect.stringContaining('launch'),
        }),
      )
    }
  })

  it('accepts every install resource and required precache asset without a listening socket', async () => {
    expect(vi.isFakeTimers()).toBe(true)
    const { fetcher, decodeImage } = deployment()
    expect(
      await checkDeployment(expected, origin + '/install', fetcher, true, decodeImage),
    ).toEqual([])
    const paths = fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname)
    expect(paths).toEqual(
      expect.arrayContaining(
        Object.keys({
          '/manifest.webmanifest': true,
          '/dark.webmanifest': true,
          '/icon.png': true,
          '/app/sw.js': true,
          '/app/': true,
          '/install': true,
          '/asset.js': true,
        }),
      ),
    )
    expect(decodeImage).toHaveBeenCalled()
  })

  it.each(['/manifest.webmanifest', '/app/sw.js', '/app/', '/icon.png', '/asset.js'])(
    'names the missing resource and gives a deployment remedy for %s',
    async path => {
      const { fetcher, decodeImage } = deployment({
        [path]: () => new Response('Missing', { status: 404 }),
      })
      const failures = await checkDeployment(
        expected,
        origin + '/install',
        fetcher,
        true,
        decodeImage,
      )
      expect(failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: origin + path,
            reason: expect.stringContaining('404'),
            fix: expect.any(String),
          }),
        ]),
      )
    },
  )

  it('reports a rejected resource request as transient and continues checking the remaining resources', async () => {
    const { fetcher, decodeImage } = deployment({
      '/app/sw.js': () => Promise.reject(new TypeError('offline')),
    })
    const failures = await checkDeployment(
      expected,
      origin + '/install',
      fetcher,
      false,
      decodeImage,
    )
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: origin + '/app/sw.js', transient: true }),
      ]),
    )
    expect(fetcher.mock.calls.some(([input]) => String(input) === origin + '/icon.png')).toBe(true)
  })

  it.each([
    ['HTML fallback', () => reply('<html>Fallback</html>', 'text/html')],
    ['malformed JSON', () => reply('{broken', 'application/manifest+json')],
    [
      'invalid start URL',
      () =>
        reply(JSON.stringify({ ...expected, start_url: 'http://[' }), 'application/manifest+json'),
    ],
  ] as const)(
    'rejects a manifest served as %s without rejecting the whole check',
    async (_label, respond) => {
      const { fetcher, decodeImage } = deployment({ '/manifest.webmanifest': respond })
      const failures = await checkDeployment(
        expected,
        origin + '/install',
        fetcher,
        false,
        decodeImage,
      )
      expect(
        failures.some(
          failure => failure.url === origin + '/manifest.webmanifest' && !failure.transient,
        ),
      ).toBe(true)
    },
  )

  it('rejects an insecure remote deployment before requesting any resource', async () => {
    const { fetcher } = deployment()
    expect(await checkDeployment(expected, 'http://satin.test/install', fetcher)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining('HTTPS'), transient: false }),
    ])
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports an aborted request at the injected timeout without waiting on a real clock', async () => {
    const { fetcher, decodeImage } = deployment()
    fetcher.mockImplementationOnce(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const checking = checkDeployment(expected, origin + '/install', fetcher, false, decodeImage, 20)
    await vi.advanceTimersByTimeAsync(20)
    expect(await checking).toEqual(
      expect.arrayContaining([expect.objectContaining({ transient: true })]),
    )
  })
})
