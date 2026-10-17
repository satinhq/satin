import { describe, expect, it } from 'vitest'
import { classifyAppShellRequest } from './requestRouting.ts'

const precacheUrls = new Set(['/', '/assets/index-a1b2c3d4.js', '/manifest.webmanifest'])

function request(
  url: string,
  { method = 'GET', mode = 'cors' }: { method?: string; mode?: string } = {},
) {
  return { method, mode, url }
}

describe('app-shell request routing', () => {
  it('network-firsts only same-origin navigation requests', () => {
    expect(
      classifyAppShellRequest(
        request('https://satin.test/settings', { mode: 'navigate' }),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('navigation')
    expect(
      classifyAppShellRequest(
        request('https://outside.test/', { mode: 'navigate' }),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('passthrough')
  })

  it('cache-firsts only declared precache URLs', () => {
    expect(
      classifyAppShellRequest(
        request('https://satin.test/assets/index-a1b2c3d4.js?v=1'),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('precache')
    expect(
      classifyAppShellRequest(
        request('https://satin.test/manifest.webmanifest'),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('precache')
  })

  it('passes API, non-precached, cross-origin, and non-GET requests through', () => {
    expect(
      classifyAppShellRequest(
        request('https://satin.test/api/private'),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('passthrough')
    expect(
      classifyAppShellRequest(
        request('https://satin.test/avatar.png'),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('passthrough')
    expect(
      classifyAppShellRequest(
        request('https://cdn.test/font.woff2'),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('passthrough')
    expect(
      classifyAppShellRequest(
        request('https://satin.test/api/private', { method: 'POST' }),
        'https://satin.test',
        precacheUrls,
      ),
    ).toBe('passthrough')
  })
})

it('does not answer transport probes from precache', () => {
  expect(
    classifyAppShellRequest(
      { method: 'GET', mode: 'cors', cache: 'no-store', url: 'https://app.test/icon.png' },
      'https://app.test',
      new Set(['/icon.png']),
    ),
  ).toBe('passthrough')
})

it('retains network-first shell fallback for a no-store navigation', () => {
  expect(
    classifyAppShellRequest(
      { method: 'GET', mode: 'navigate', cache: 'no-store', url: 'https://app.test/' },
      'https://app.test',
      new Set(['/']),
    ),
  ).toBe('navigation')
})

it.each([
  '/install',
  '/install/',
  '/install?from=home',
  '/unsupported.html',
  '/app/unsupported.html',
  '/app/install/',
])('passes public navigation %s through under worker control', path => {
  expect(
    classifyAppShellRequest(
      request('https://app.test' + path, { mode: 'navigate' }),
      'https://app.test',
      new Set([path]),
      ['/install', '/unsupported.html', '/app/unsupported.html', '/app/install'],
    ),
  ).toBe('passthrough')
})

it('never substitutes or caches the app shell for an authorization callback', () => {
  expect(
    classifyAppShellRequest(
      request('https://app.test/auth/callback?code=secret&state=transaction', { mode: 'navigate' }),
      'https://app.test',
      new Set(['/auth/callback']),
    ),
  ).toBe('passthrough')
})
