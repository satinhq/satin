import { expect, it } from 'vitest'
import { createOpenURLAction } from './openURL.tsx'

it('handles registered app URLs without a document handoff and rejects unknown app paths', () => {
  const documents: string[] = []
  const routes: string[] = []
  const open = createOpenURLAction({
    scope: 'https://app.test/app/',
    openInternal: url => {
      if (!url.includes('satin-route')) return false
      routes.push(url)
      return true
    },
    dispatch: url => {
      documents.push(url)
      return true
    },
  })
  expect(open('?satin-route=[]')).toEqual({ status: 'handled', destination: 'app' })
  expect(routes).toHaveLength(1)
  expect(open('/app/unknown')).toEqual({ status: 'unavailable', reason: 'unregistered-app-url' })
  expect(documents).toEqual([])
})
it('dispatches external web pages and reports strict external-browser requests as unavailable', () => {
  const documents: string[] = []
  const open = createOpenURLAction({
    scope: 'https://app.test/app/',
    openInternal: () => false,
    dispatch: url => {
      documents.push(url)
      return true
    },
  })
  expect(open('https://web.test/')).toEqual({ status: 'dispatched', destination: 'web' })
  expect(open('https://web.test/', { prefersInApp: false })).toEqual({
    status: 'unavailable',
    reason: 'external-browser',
  })
  expect(documents).toEqual(['https://web.test/'])
})
it('rejects executable, private, credential-bearing and malformed URLs before navigation', () => {
  const documents: string[] = []
  const open = createOpenURLAction({
    scope: 'https://app.test/app/',
    openInternal: () => false,
    dispatch: url => {
      documents.push(url)
      return true
    },
  })
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hi',
    'blob:https://web.test/id',
    'x-safari-https://web.test',
    ['https://user:', 'secret@', 'web.test/'].join(''),
    'http://[broken',
  ])
    expect(open(url)).toEqual({ status: 'unavailable', reason: 'invalid-url' })
  expect(documents).toEqual([])
})
