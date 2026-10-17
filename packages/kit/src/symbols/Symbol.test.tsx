import { ScreenContext } from '../navigation/navigationContext.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SymbolImage, SymbolProvider, SymbolSelectionContext, resolveSymbol } from './Symbol.tsx'
import { coreSymbols } from './catalogue.ts'
import { coreSymbolSvg } from './svg.ts'
import * as lensIcons from '../glass/lens/icons.ts'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  symbolGeometry,
  symbolMetrics,
  symbolOutlineOffset,
  symbolWeightForFont,
} from './metrics.ts'
import { Button, List } from '../public/controls.tsx'
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
describe('SymbolImage contract', () => {
  it('excludes the Apple logo from catalogue, SVG exports, selection and custom overrides', () => {
    expect(Object.hasOwn(coreSymbols, 'logo.apple')).toBe(false)
    expect(Object.hasOwn(lensIcons, 'APPLE_LOGO_SVG')).toBe(false)
    const overridden = { ...coreSymbols, 'logo.apple': coreSymbols.star }
    for (const name of ['logo.apple', 'logo.apple.fill']) {
      expect(resolveSymbol(overridden, name, true)).toBeUndefined()
      expect(() => coreSymbolSvg(name as keyof typeof coreSymbols)).toThrow()
      const markup = renderToStaticMarkup(
        <SymbolProvider glyphs={overridden}>
          <SymbolImage name={name} selected glyph={coreSymbols.star} />
        </SymbolProvider>,
      )
      expect(markup).toContain('data-satin-symbol-placeholder="true"')
      expect(markup).toContain(coreSymbols['questionmark.square'].paths[0]!.d)
    }
  })
  it('regenerates without the Apple logo and refuses to restore it before writing output', async () => {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const scratchRoot = process.env.SATIN_SCRATCH_ROOT ?? tmpdir()
    await mkdir(scratchRoot, { recursive: true })
    const fixture = await mkdtemp(resolve(scratchRoot, 'symbols-generation-'))
    try {
      await mkdir(resolve(fixture, 'scripts'))
      await cp(resolve(packageRoot, 'src/symbols'), resolve(fixture, 'src/symbols'), {
        recursive: true,
      })
      await symlink(resolve(packageRoot, 'node_modules'), resolve(fixture, 'node_modules'))
      const generatorPath = resolve(fixture, 'scripts/generate-symbols.mjs')
      const generator = await readFile(resolve(packageRoot, 'scripts/generate-symbols.mjs'), 'utf8')
      await writeFile(generatorPath, generator)
      const run = () => spawnSync(process.execPath, [generatorPath], { encoding: 'utf8' })
      expect(run().status).toBe(0)
      const cataloguePath = resolve(fixture, 'src/symbols/catalogue.ts')
      const generated = await readFile(cataloguePath, 'utf8')
      expect(generated).not.toMatch(/logo[._]apple|APPLE_LOGO/)
      await writeFile(generatorPath, generator.replace('hourglass', 'hourglass logo.apple'))
      const restored = run()
      expect(restored.status).not.toBe(0)
      expect(restored.stderr).toContain('Excluded Apple logo')
      expect(await readFile(cataloguePath, 'utf8')).toBe(generated)
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })
  it('maps SF aliases to licensed Framework7 glyphs and exposes placeholders honestly', () => {
    expect(coreSymbols['square.and.arrow.up'].provenance).toContain('square_arrow_up.svg')
    expect(coreSymbols.gearshape.provenance).toContain('gear_alt.svg')
    expect(coreSymbols['arrow.uturn.backward'].provenance).toContain('arrow_uturn_left.svg')
    expect(coreSymbols.drop.provenance).toContain('drop.svg')
    expect(resolveSymbol(coreSymbols, 'drop', true)).toBe(coreSymbols['drop.fill'])
    // Owner-approved clean-room drawings replace the placeholders (approved.json binds their hashes).
    expect(coreSymbols['dumbbell'].placeholder).toBeUndefined()
    expect(coreSymbols['figure.run'].provenance).toContain('clean-room')
    expect(coreSymbols['eye.slash'].provenance).toContain('clean-room')
    expect(Object.values(coreSymbols).filter(glyph => glyph.placeholder)).toEqual([])
    expect(Object.values(coreSymbols).every(glyph => glyph.paths.length && glyph.provenance)).toBe(
      true,
    )
  })
  it('selects an available fill, preserves explicit fill, and retains base when absent', () => {
    expect(resolveSymbol(coreSymbols, 'star', true)).toBe(coreSymbols['star.fill'])
    expect(resolveSymbol(coreSymbols, 'star.fill', true)).toBe(coreSymbols['star.fill'])
    expect(resolveSymbol(coreSymbols, 'eye', true)).toBe(coreSymbols['eye.fill'])
    expect(resolveSymbol(coreSymbols, 'chevron.left', true)).toBe(coreSymbols['chevron.left'])
  })
  it('normalizes the circle to one em and keeps the center on the text cap midline at every scale', () => {
    for (const scale of ['small', 'medium', 'large'] as const) {
      const geometry = symbolGeometry(scale)
      expect((geometry.size * symbolMetrics.circleDiameter) / 56).toBeCloseTo(
        symbolMetrics.scales[scale],
      )
      expect(geometry.verticalAlign + geometry.size / 2).toBeCloseTo(0.356)
    }
  })
  it('matches measured regular/semibold ring thickness using vector contour expansion', () => {
    for (const [weight, target] of [
      ['regular', 0.085],
      ['semibold', 0.11],
    ] as const) {
      expect(
        (symbolMetrics.sourceRingStroke + symbolOutlineOffset(weight)) /
          symbolMetrics.circleDiameter,
      ).toBeCloseTo(target)
    }
    expect(symbolOutlineOffset('ultraLight')).toBeLessThan(0)
    expect(symbolWeightForFont('normal')).toBe('regular')
    expect(symbolWeightForFont('bold')).toBe('bold')
    expect(symbolWeightForFont(550)).toBe('semibold')
  })
  it('inherits surrounding weight on mount and renders a vector mask for light weights', () => {
    act(() =>
      root.render(
        <span style={{ fontWeight: 600 }}>
          <SymbolImage name="star" />
        </span>,
      ),
    )
    // jsdom does not resolve inherited font-weight. Browser verification covers inheritance.
    act(() => root.render(<SymbolImage name="circle" weight="thin" />))
    expect(container.querySelector('mask path')?.getAttribute('stroke')).toBe('black')
    expect(container.querySelector('g')?.getAttribute('mask')).toMatch(/^url\(#satin-symbol-/)
  })
  it('is decorative by default, labels meaningful artwork and keeps icon-only button names', () => {
    act(() =>
      root.render(
        <>
          <SymbolImage name="star" />
          <SymbolImage name="heart" label="Favorite" />
          <Button symbol="plus" iconOnly aria-label="Add" onPress={() => {}} />
        </>,
      ),
    )
    expect(container.querySelector('[data-satin-symbol="star"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Favorite')
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Add')
    expect(container.querySelector('button svg')?.getAttribute('aria-hidden')).toBe('true')
  })
  it('accepts scoped glyph sources with real layers and never injects SVG markup', () => {
    const custom = {
      paths: [
        { ...coreSymbols.star.paths[0]!, layer: 'primary' as const },
        { ...coreSymbols.circle.paths[0]!, layer: 'secondary' as const },
      ],
      provenance: 'Test composition from Framework7 MIT paths',
    }
    const html = renderToStaticMarkup(
      <SymbolProvider glyphs={{ custom }}>
        <SymbolImage
          name="custom"
          weight="regular"
          renderingMode="palette"
          palette={['red', 'blue']}
        />
      </SymbolProvider>,
    )
    expect(html).toContain('fill="red"')
    expect(html).toContain('fill="blue"')
    const hierarchical = renderToStaticMarkup(
      <SymbolImage name="custom" glyph={custom} weight="regular" renderingMode="hierarchical" />,
    )
    expect(hierarchical).toContain('opacity="0.55"')
  })
  it('fills Symbols supplied as tab ReactNodes through selected context', () => {
    const html = renderToStaticMarkup(
      <SymbolSelectionContext value={true}>
        <SymbolImage name="star" weight="regular" />
      </SymbolSelectionContext>,
    )
    expect(html).toContain(coreSymbols['star.fill'].paths[0]!.d)
  })
  it('marks unknown glyphs visibly and structurally instead of silently omitting them', () => {
    for (const name of ['not-a-symbol', 'constructor', '__proto__', 'toString']) {
      const html = renderToStaticMarkup(<SymbolImage name={name} weight="regular" />)
      expect(html).toContain('data-satin-symbol-placeholder="true"')
      expect(html).toContain(coreSymbols['questionmark.square'].paths[0]!.d)
    }
  })
})

it('updates inherited weight after an ancestor change but ignores transform-only animation writes', async () => {
  let fontWeight = '400'
  let scheduled: FrameRequestCallback | undefined
  const computed = vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation(() => ({ fontWeight }) as CSSStyleDeclaration)
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    scheduled = callback
    return 1
  })
  try {
    act(() =>
      root.render(
        <div data-parent="true">
          <SymbolImage name="star" />
        </div>,
      ),
    )
    const parent = container.querySelector('[data-parent]') as HTMLElement
    expect(container.querySelector('svg')?.getAttribute('data-satin-symbol-weight')).toBe('regular')
    computed.mockClear()
    await act(async () => {
      parent.style.transform = 'translateX(10px)'
      await Promise.resolve()
    })
    expect(computed).not.toHaveBeenCalled()
    expect(scheduled).toBeUndefined()
    fontWeight = '600'
    await act(async () => {
      parent.style.fontWeight = '600'
      await Promise.resolve()
    })
    expect(scheduled).toBeDefined()
    act(() => scheduled!(0))
    expect(container.querySelector('svg')?.getAttribute('data-satin-symbol-weight')).toBe(
      'semibold',
    )
    scheduled = undefined
    fontWeight = '700'
    await act(async () => {
      parent.dataset.selected = 'true'
      await Promise.resolve()
    })
    expect(scheduled).toBeDefined()
    act(() => scheduled!(0))
    expect(container.querySelector('svg')?.getAttribute('data-satin-symbol-weight')).toBe('bold')
  } finally {
    computed.mockRestore()
    raf.mockRestore()
  }
})

it('uses native ink calibration per glyph while retaining cap-midline alignment', () => {
  expect(coreSymbols.house.opticalSize).toBeGreaterThan(coreSymbols.bell.opticalSize!)
  const geometry = symbolGeometry('medium', coreSymbols.house.opticalSize)
  expect(geometry.size).toBeCloseTo(1.178527)
  expect(geometry.verticalAlign + geometry.size / 2).toBeCloseTo(0.356)
  const html = renderToStaticMarkup(<SymbolImage name="house" weight="regular" />)
  expect(html).toContain(`width="${geometry.size}em"`)
  expect(html).not.toContain('style="display:inline-block;width:')
})

it('sizes a fill exactly like its outline, because they share one silhouette', () => {
  for (const name of ['house', 'bell', 'trash', 'person', 'folder', 'envelope'] as const) {
    const fill = coreSymbols[`${name}.fill`]
    expect(fill.provenance).toContain('Framework7 Icons 5.0.5 (MIT)')
    expect(fill.provenance).toContain("outline's outer silhouette")
    expect(fill.opticalSize).toBe(coreSymbols[name].opticalSize)
    expect(fill.normalization).toEqual(coreSymbols[name].normalization)
  }
})

it('lets a context size the SVG while preserving caller dimensions and baseline calibration', () => {
  const html = renderToStaticMarkup(
    <SymbolImage name="tray" weight="regular" width={22} height={22} />,
  )
  expect(html).toContain('width="22"')
  expect(html).toContain('height="22"')
  expect(html).not.toMatch(/style="[^"]*(?:width|height):/)
  expect(coreSymbols.tray.normalization?.regular?.baseline).toBeGreaterThan(0)
})

it('uses the list leading aperture and list symbol point size for Button symbols', () => {
  const html = renderToStaticMarkup(
    <ScreenContext
      value={{
        key: 'symbols',
        params: {},
        lifecycle: { isCovered: false, phase: 'settled' },
        scrollRegistry: createScrollSurfaceRegistry(),
      }}
    >
      <List id="symbol-buttons">
        <Button symbol="star" onPress={() => {}}>
          Favorite
        </Button>
      </List>
    </ScreenContext>,
  )
  expect(html).toContain('font-size:21.7px')
  expect(html).toContain('data-satin-row-leading="true"')
  expect(html.match(/Favorite/g)).toHaveLength(1)
})
