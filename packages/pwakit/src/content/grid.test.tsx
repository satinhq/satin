// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GridItem, LazyVGrid, LazyHGrid, Text, VStack } from './content.tsx'

it.each([
  { columns: [GridItem.adaptive({ minimum: 150, spacing: 16 })] },
  { columns: [GridItem.flexible(), GridItem.flexible()] },
  { columns: [GridItem.fixed(150), GridItem.fixed(150)] },
])('sizes vertical rows from complete cells with wrapping captions: %j', ({ columns }) => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(
    <LazyVGrid columns={columns} spacing={20}>
      {['A long caption that wraps onto several lines', 'Short', 'Next row'].map(caption => (
        <VStack key={caption} frame={{ maxWidth: 'infinity' }} spacing={0}>
          <img alt="" style={{ width: '100%', aspectRatio: '1' }} />
          <Text>{caption}</Text>
          <Text>Artist metadata</Text>
        </VStack>
      ))}
    </LazyVGrid>,
  )
  // Explicit intrinsic tracks avoid WebKit retaining the old automatic row size
  // when a flex parent's width changes. Geometry is exercised by grid-layout/acceptance.mjs.
  expect((host.firstElementChild as HTMLElement).style.gridAutoRows).toBe('max-content')
})

it.each(['vertical', 'horizontal'] as const)(
  'separates %s track spacing and alignment from line spacing',
  axis => {
    const tracks = [
      GridItem.fixed({ size: 60, spacing: 12, alignment: 'topLeading' }),
      GridItem.flexible({ minimum: 80, spacing: 24, alignment: 'bottomTrailing' }),
      GridItem.fixed({ size: 40 }),
    ]
    const host = document.createElement('div')
    const children = ['A', 'B', 'C', 'D'].map(x => <Text key={x}>{x}</Text>)
    host.innerHTML = renderToStaticMarkup(
      axis === 'vertical' ? (
        <LazyVGrid columns={tracks} alignment="leading" spacing={20}>
          {children}
        </LazyVGrid>
      ) : (
        <LazyHGrid rows={tracks} alignment="top" spacing={20}>
          {children}
        </LazyHGrid>
      ),
    )
    const grid = host.firstElementChild as HTMLElement
    expect(axis === 'vertical' ? grid.style.gridTemplateColumns : grid.style.gridTemplateRows).toBe(
      '60px 12px minmax(80px, 1fr) 24px 40px',
    )
    expect(axis === 'vertical' ? grid.style.rowGap : grid.style.columnGap).toBe('20px')
    const cells = [...grid.children] as HTMLElement[]
    expect(cells).toHaveLength(4)
    expect(cells.map(x => (axis === 'vertical' ? x.style.gridColumn : x.style.gridRow))).toEqual([
      '1',
      '3',
      '5',
      '1',
    ])
    expect(cells[0].style.justifyItems).toBe('start')
    expect(cells[1].style.alignItems).toBe('end')
    expect(cells[1].style.justifyItems).toBe('end')
  },
)
it('uses adaptive track spacing on the cross axis, retains the legacy fixed constructor and rejects invalid options', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(
    <LazyVGrid columns={[GridItem.adaptive({ minimum: 150, spacing: 16 })]} spacing={20}>
      <Text>A</Text>
    </LazyVGrid>,
  )
  const grid = host.firstElementChild as HTMLElement
  expect(grid.style.columnGap).toBe('16px')
  expect(grid.style.rowGap).toBe('20px')
  expect(GridItem.fixed(40)).toMatchObject({ kind: 'fixed', size: 40 })
  expect(() => GridItem.flexible({ spacing: -1 })).toThrow(RangeError)
  expect(() => GridItem.fixed({ size: 10, spacing: Infinity })).toThrow(RangeError)
  expect(() => GridItem.adaptive({ minimum: 40, maximum: 30 })).toThrow(RangeError)
})
