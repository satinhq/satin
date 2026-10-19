// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { afterEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  VStack,
  HStack,
  ZStack,
  LazyVStack,
  LazyHStack,
  LazyVGrid,
  LazyHGrid,
  GridItem,
  Text,
  Spacer,
} from './content.tsx'
import { ListRow } from '../list-form/ListForm.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
it('passes the row width through an unframed stack to its filling column', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <ListRow>
      <HStack alignment="top" spacing={8}>
        <Text>Mail</Text>
        <VStack alignment="leading" frame={{ maxWidth: 'infinity' }}>
          <HStack frame={{ maxWidth: 'infinity' }}>
            <Text lineLimit={1}>Sender</Text>
            <Spacer />
            <Text>3:47 PM</Text>
          </HStack>
          <Text>A preview with a different intrinsic width</Text>
        </VStack>
      </HStack>
    </ListRow>,
  )
  const stack = document.querySelector('[data-satin-content="hstack"]')!
  expect(getComputedStyle(stack).width).toBe('100%')
})

it('centers vertical scroll content while preserving fill and explicit stack alignment', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  const content = (
    <VStack alignment="trailing" frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
      <Text>Short</Text>
      <Text>A longer line</Text>
    </VStack>
  )
  document.body.innerHTML = renderToStaticMarkup(
    <>
      <div data-satin-scroll-axis="vertical">{content}</div>
      <div data-satin-scroll-axis="vertical">
        <div data-satin-scroll-content="">{content}</div>
      </div>
      <div data-satin-scroll-axis="horizontal">{content}</div>
      <div data-satin-scroll-axis="vertical" data-satin-list="plain">
        {content}
      </div>
    </>,
  )
  const frames = [...document.querySelectorAll<HTMLElement>('[data-satin-content="frame"]')]
  const surfaces = [...document.querySelectorAll('[data-satin-scroll-axis]')]
  expect(surfaces.slice(0, 2).map(surface => getComputedStyle(surface).alignItems)).toEqual([
    'center',
    'center',
  ])
  expect(surfaces.slice(2).every(surface => getComputedStyle(surface).display !== 'flex')).toBe(
    true,
  )
  expect(
    frames.every(frame => frame.style.width === '100%' && frame.style.justifyItems === 'start'),
  ).toBe(true)
  expect(
    frames.every(frame => (frame.firstElementChild as HTMLElement).style.alignItems === 'end'),
  ).toBe(true)
})
it.each([VStack, HStack, ZStack, LazyVStack, LazyHStack])(
  '%s passes its proposal to a nested fill frame',
  Stack => {
    const style = document.createElement('style')
    style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
    document.head.append(style)
    document.body.innerHTML = renderToStaticMarkup(
      <Stack frame={{ maxWidth: 'infinity' }}>
        <VStack frame={{ maxWidth: 'infinity' }}>
          <Text>Album</Text>
        </VStack>
      </Stack>,
    )
    const stack = document.querySelector('[data-satin-content="frame"] > [data-satin-content]')!
    expect(getComputedStyle(stack).width).toBe('100%')
  },
)
it.each(['vertical', 'horizontal'] as const)('proposes each %s grid cell its track size', axis => {
  document.body.innerHTML = renderToStaticMarkup(
    axis === 'vertical' ? (
      <LazyVGrid columns={[GridItem.flexible()]}>
        <VStack frame={{ maxWidth: 'infinity' }}>
          <Text>Album</Text>
        </VStack>
      </LazyVGrid>
    ) : (
      <LazyHGrid rows={[GridItem.flexible()]}>
        <VStack frame={{ maxWidth: 'infinity' }}>
          <Text>Album</Text>
        </VStack>
      </LazyHGrid>
    ),
  )
  const grid = document.querySelector<HTMLElement>('[data-satin-content="grid"]')!
  expect(grid.style.justifyItems).toBe('stretch')
  expect(grid.style.alignItems).toBe('stretch')
})

it.each([VStack, HStack, ZStack, LazyVStack, LazyHStack])(
  '%s offers arbitrary content the same width as a fill frame',
  Stack => {
    const style = document.createElement('style')
    style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
    document.head.append(style)
    document.body.innerHTML = renderToStaticMarkup(
      <Stack frame={{ maxWidth: 'infinity' }}>
        <span data-custom-wrapper style={{ display: 'block' }}>
          <img width="1000" alt="" />
        </span>
        <Text>Intrinsic text</Text>
      </Stack>,
    )
    expect(getComputedStyle(document.querySelector('[data-custom-wrapper]')!).width).toBe('100%')
    expect(getComputedStyle(document.querySelector('[data-satin-content="text"]')!).width).not.toBe(
      '100%',
    )
  },
)

it('allocates remaining HStack width to a fill frame without shrinking its bounded sibling', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  document.body.innerHTML = renderToStaticMarkup(
    <HStack>
      <VStack frame={{ maxWidth: 320 }}>
        <img width="1000" alt="" />
      </VStack>
      <VStack frame={{ maxWidth: 'infinity' }}>
        <Text>Details</Text>
      </VStack>
    </HStack>,
  )
  const fill = document.querySelector('[data-satin-content-width="fill"]')!
  expect(getComputedStyle(fill).flexBasis).toBe('0%')
  expect(getComputedStyle(fill).flexGrow).toBe('1')
})
