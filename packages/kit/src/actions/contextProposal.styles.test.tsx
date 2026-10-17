// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContextMenu } from './RowActions.tsx'
import { HStack, Spacer, Text, VStack } from '../content/content.tsx'
import { ScrollTarget, ScrollTargetContext } from '../scroll/ScrollTarget.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
function mount(fill: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <ScrollTargetContext value={() => {}}>
      <VStack frame={{ maxWidth: 'infinity' }}>
        <ScrollTarget id="message">
          <HStack frame={{ maxWidth: 'infinity' }}>
            <Spacer minLength={0} />
            <ContextMenu actions={[]}>
              <Text frame={fill ? { maxWidth: 'infinity' } : undefined}>Bubble</Text>
            </ContextMenu>
          </HStack>
        </ScrollTarget>
      </VStack>
    </ScrollTargetContext>,
  )
}
it('leaves space for a Spacer beside an intrinsic context-menu bubble', () => {
  mount(false)
  expect(getComputedStyle(document.querySelector('[data-satin-context-content]')!).width).toBe(
    'fit-content',
  )
  expect(getComputedStyle(document.querySelector('[data-satin-scroll-target]')!).width).toBe('100%')
})
it('preserves an explicit fill frame through a context-menu wrapper', () => {
  mount(true)
  expect(getComputedStyle(document.querySelector('[data-satin-context-content]')!).width).toBe(
    '100%',
  )
})

it('preserves a grid cell proposal for an authored full-width trigger', () => {
  mount(false)
  document.body.innerHTML = renderToStaticMarkup(
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
      <ContextMenu actions={[]}>
        <button style={{ width: '100%' }}>Pinned</button>
      </ContextMenu>
    </div>,
  )
  expect(getComputedStyle(document.querySelector('[data-satin-context-content]')!).width).not.toBe(
    'fit-content',
  )
})
