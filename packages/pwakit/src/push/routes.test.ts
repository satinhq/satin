import { describe, expect, it } from 'vitest'
import { decodePushRoute, encodePushRoute, validatePushRoute, type PushRoute } from './routes.ts'
const rules = { detail: { params: ['id'], tabs: ['home'] }, settings: { params: [] } }
describe('push route codec', () => {
  it('round trips Unicode and reserved delimiters within the exact scope', () => {
    const route = { screen: 'detail', params: { id: 'a/雪?x=#&' }, tab: 'home' }
    const url = encodePushRoute('https://app.test/app/', route, rules, 'delivery-1')
    expect(decodePushRoute(url, 'https://app.test/app/', rules)).toEqual({
      route,
      id: 'delivery-1',
    })
  })
  it('rejects unknown screens, inherited keys, missing/extra params and unknown tabs', () => {
    for (const route of [
      { screen: 'missing' },
      { screen: '__proto__' },
      { screen: 'detail' },
      { screen: 'settings', params: { x: '1' } },
      { screen: 'detail', params: { id: '1' }, tab: 'missing' },
    ])
      expect(() => validatePushRoute(route as PushRoute, rules)).toThrow()
  })
  it('rejects origin/scope escape, malformed JSON and insecure sender configuration', () => {
    const url = encodePushRoute('https://app.test/app/', { screen: 'settings' }, rules, '1')
    expect(
      decodePushRoute(url.replace('app.test', 'evil.test'), 'https://app.test/app/', rules),
    ).toBeNull()
    expect(
      decodePushRoute(url.replace('/app/', '/outside/'), 'https://app.test/app/', rules),
    ).toBeNull()
    expect(
      decodePushRoute(
        'https://app.test/app/?satin-push={&satin-delivery=x',
        'https://app.test/app/',
        rules,
      ),
    ).toBeNull()
    expect(() =>
      encodePushRoute('http://app.test/app/', { screen: 'settings' }, rules, '1'),
    ).toThrow()
  })
})

it('preserves explicit route versions through legacy sender rules and validates their type', () => {
  const route = { screen: 'detail', version: 1, params: { id: 'one' } }
  const url = encodePushRoute('https://app.test/app/', route, rules, 'one')
  expect(
    decodePushRoute(url, 'https://app.test/app/', { detail: { params: ['id'], version: 1 } })
      ?.route,
  ).toEqual(route)
  for (const version of [NaN, Infinity, 1.2, '1', null])
    expect(() => validatePushRoute({ ...route, version } as PushRoute, rules)).toThrow(
      'Invalid route version',
    )
  expect(() => validatePushRoute(route, { detail: { params: ['id'], version: 2 } })).toThrow(
    'Incompatible route version',
  )
})
