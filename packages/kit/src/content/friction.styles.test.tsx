// @vitest-environment jsdom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { afterEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GeometryReader } from './layout.tsx'
import { VStack, ZStack, Text } from './content.tsx'
import { IgnoresSafeArea } from '../safe-area/modifiers.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
function mount(content: React.ReactNode) {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(content)
}
it('passes the bounded height through IgnoresSafeArea to a greedy reader', () => {
  mount(
    <div style={{ height: 600 }}>
      <IgnoresSafeArea>
        <GeometryReader>{() => null}</GeometryReader>
      </IgnoresSafeArea>
    </div>,
  )
  expect(getComputedStyle(document.querySelector('[data-satin-safe-area-modifier]')!).height).toBe(
    '100%',
  )
})
it('passes a definite frame height into its ZStack', () => {
  mount(
    <ZStack frame={{ height: 600 }}>
      <Text>Photo</Text>
    </ZStack>,
  )
  expect(getComputedStyle(document.querySelector('[data-satin-content="zstack"]')!).height).toBe(
    '100%',
  )
})

it('does not stretch an ordinary safe-area hero', () => {
  mount(
    <IgnoresSafeArea>
      <ZStack>
        <Text>Hero</Text>
      </ZStack>
    </IgnoresSafeArea>,
  )
  expect(
    getComputedStyle(document.querySelector('[data-satin-safe-area-modifier]')!).height,
  ).not.toBe('100%')
})
it('carries the proposal through an intervening ZStack', () => {
  mount(
    <IgnoresSafeArea>
      <ZStack>
        <GeometryReader>{() => null}</GeometryReader>
      </ZStack>
    </IgnoresSafeArea>,
  )
  expect(getComputedStyle(document.querySelector('[data-satin-safe-area-modifier]')!).height).toBe(
    '100%',
  )
  expect(getComputedStyle(document.querySelector('[data-satin-content="zstack"]')!).height).toBe(
    '100%',
  )
})

it('keeps an intrinsic VStack vertically centered by its frame', () => {
  mount(
    <VStack frame={{ height: 600 }}>
      <Text>Intrinsic</Text>
    </VStack>,
  )
  expect(
    getComputedStyle(document.querySelector('[data-satin-content="vstack"]')!).height,
  ).not.toBe('100%')
})
