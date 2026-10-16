import { sampleMenuMotion } from '../lens/menuMotion.ts'
import { TabMotion } from '../lens/tabMotion.ts'
import { stableTabSelection, tabSelectionCapsule } from '../lens/tabSelectionMaterial.ts'
import type { Appearance } from '../lens/theme.ts'
import type { RasterSetup } from './protocol.ts'

export const WORKER_BACKDROPS = [
  'abstract-1',
  'abstract-2',
  'abstract-3',
  'abstract-4',
  'app-list',
  'app-settings',
  'article-light',
  'article-dark',
  'photo-architecture',
  'photo-foliage',
  'photo-food',
  'photo-landscape',
  'photo-night',
  'photo-portrait',
] as const
export type FixtureKind = 'dock' | 'lens' | 'menu'
export function rasterSetup(
  appearance: Appearance,
  kind: FixtureKind,
  resolution = 3,
): RasterSetup {
  const menu = kind === 'menu',
    width = 440,
    height = 318
  const frameWidth = menu ? 280 : 398,
    frameHeight = menu ? 230 : 62
  return {
    appearance,
    width,
    height,
    resolution,
    spec: {
      id: menu ? 'right' : 'dock',
      frameX: menu ? 80 : 21,
      frameY: menu ? 44 : 128,
      frameWidth,
      frameHeight,
      radius: menu ? 32 : 30.8,
      sampleHeight: height,
      sampleWidth: menu ? 408 : 526,
      sampleInsetX: 64,
      sampleInsetY: menu ? 44 : 128,
      shaderAperture: true,
      materialMix: 1,
      materialProfile: menu ? 'menu' : 'chrome',
      shape: {
        blendRadius: 0,
        rimAlpha: 1,
        whiteMix: 0,
        first: {
          centerX: frameWidth / 2,
          centerY: frameHeight / 2,
          halfWidth: frameWidth / 2,
          halfHeight: frameHeight / 2,
          radius: menu ? 32 : 30.8,
        },
      },
      tabSelection: menu
        ? undefined
        : {
            ...stableTabSelection(appearance),
            capsule: tabSelectionCapsule(1, [69, 199, 329], 107.5, 54),
            glyphCount: 3,
            lensMix: kind === 'lens' ? 1 : 0,
          },
    },
  }
}

/** Captures only the bounded source needed by this experiment. Real app DOM
 * capture, source-generation invalidation and glyph masking remain main-owned. */
export async function captureFixture(backdrop: string, setup: RasterSetup) {
  if (!WORKER_BACKDROPS.some(value => value === backdrop)) throw new Error('Unknown 11f backdrop')
  const image = new Image()
  image.src = `/comparisons/measured-reference/backdrops/${backdrop}.png`
  await image.decode()
  const started = performance.now(),
    { width, height, resolution } = setup
  const capture = (rear: boolean) => {
    const canvas = document.createElement('canvas')
    canvas.width = width * resolution
    canvas.height = height * resolution
    const ctx = canvas.getContext('2d')!
    // Same physical crop on both paths, with a distinct rear-page strip.
    ctx.drawImage(
      image,
      0,
      rear ? Math.max(0, image.height - canvas.height) : 0,
      image.width,
      Math.min(image.height, canvas.height),
      0,
      0,
      canvas.width,
      canvas.height,
    )
    return canvas
  }
  const frontCanvas = capture(false),
    rearCanvas = capture(true),
    glyphCanvas = document.createElement('canvas')
  glyphCanvas.width = setup.spec.sampleWidth * resolution
  glyphCanvas.height = height * resolution
  const ctx = glyphCanvas.getContext('2d')!
  ctx.scale(resolution, resolution)
  ctx.fillStyle = setup.appearance === 'light' ? '#007aff' : '#0a84ff'
  ctx.font = '600 12px system-ui'
  ctx.textAlign = 'center'
  for (const [index, label] of ['Home', 'Saved', 'Settings'].entries()) {
    const x = setup.spec.sampleInsetX + [69, 199, 329][index]
    ctx.fillText(label, x, setup.spec.sampleInsetY + 48)
    ctx.beginPath()
    ctx.arc(x, setup.spec.sampleInsetY + 21, 9, 0, 2 * Math.PI)
    ctx.fill()
  }
  const capturedMs = performance.now() - started,
    bitmapStart = performance.now()
  const options: ImageBitmapOptions = {
    premultiplyAlpha: 'premultiply',
    colorSpaceConversion: 'none',
  }
  const [front, rear, glyphs] = await Promise.all([
    createImageBitmap(frontCanvas, options),
    createImageBitmap(rearCanvas, options),
    createImageBitmap(glyphCanvas, options),
  ])
  return {
    front,
    rear,
    glyphs,
    captureMs: capturedMs,
    bitmapMs: performance.now() - bitmapStart,
    mainCanvasBytes:
      (frontCanvas.width * frontCanvas.height +
        rearCanvas.width * rearCanvas.height +
        glyphCanvas.width * glyphCanvas.height) *
      4,
  }
}

export type FixtureMotion = { kind: 'menu-open' | 'menu-close' | 'pill'; milliseconds: number }
/** Freeze both backends at the same model time, independent of rendering cadence. */
export function fixtureMotion(setup: RasterSetup, motion?: FixtureMotion): RasterSetup {
  if (!motion) return setup
  if (motion.kind === 'pill') {
    const tab = new TabMotion()
    tab.configure([69, 199, 329], 107.5, 54, 398)
    tab.reset(0)
    tab.select(2, 0)
    for (let at = 0; at < motion.milliseconds; at += 1000 / 120) tab.sample(at, false)
    tab.sample(motion.milliseconds, false)
    return {
      ...setup,
      spec: {
        ...setup.spec,
        tabSelection: { ...setup.spec.tabSelection!, capsule: tab.capsule(), lensMix: tab.lensMix },
      },
    }
  }
  const frame = sampleMenuMotion(
    motion.kind === 'menu-open' ? 'open' : 'close',
    motion.milliseconds / 1000,
    setup.appearance,
    false,
  )
  return {
    ...setup,
    spec: {
      ...setup.spec,
      shape: frame.shape,
      radius: frame.shape.first.radius,
      materialMix: frame.materialMix,
      menuTintMix: frame.menuTintMix,
      returningTrigger: frame.returningTrigger,
    },
  }
}
