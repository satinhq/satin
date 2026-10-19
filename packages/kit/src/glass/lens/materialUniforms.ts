import recipes from './materialGlassRecipes.json'
import sdfRecipes from './shapeParameters.json'
import type { Appearance } from './theme.ts'

export function materialBlurDifferences(
  distances: readonly number[],
  opacities: readonly number[],
) {
  if (
    distances.length !== 4 ||
    opacities.length !== 4 ||
    ![...distances, ...opacities].every(Number.isFinite) ||
    distances.some((d, i) => i > 0 && d < distances[i - 1]) ||
    opacities.some(a => a < 0 || a > 1)
  ) {
    throw new Error(
      'Material diffusion requires four nondecreasing distances and four bounded opacities',
    )
  }
  return [opacities[0], ...opacities.slice(0, 3).map((v, i) => v - opacities[i + 1])]
}

/** Menu shadow response [radius, opacity, contribution, face opacity], fitted 2026-09-25 to the
 * native menu (ParityReference `--bar-glass`, iOS 27.0 Simulator, settled open vs closed):
 * light darkens a white row 4% at the edge, 1% at 14 pt, none by 24 pt; dark darkens the
 * row under it 8% at the edge, none by 16 pt. The material recipe's response (radius 24,
 * opacity 0.4 / 0.6) darkened 25% at the edge and spread past the drawable top. */
export const MENU_SHADOW_RESPONSE: Readonly<
  Record<Appearance, readonly [number, number, number, number]>
> = {
  light: [12.8, 0.053, 0, 1],
  dark: [12.8, 0.1, 0, 1],
}

/* Light search uses a separate default-setting native fit. Its constant mixture
 * with regular transmission preserves stripe contrast without adding transverse
 * bands. Dark retains the shipped recipe until a measured fill-boundary model
 * can preserve its sharp rim. Face, tint and specular stay shared.
 */
export const SEARCH_FIELD_RECIPE: Readonly<
  Record<Appearance, Readonly<{ diffusion: number; blurFill: readonly number[] }>>
> = {
  light: { diffusion: 0.075, blurFill: [8, 1, 0, 0.6117782350589273] },
  dark: { diffusion: 0.075, blurFill: [8, 0, 0.576, 0.32] },
}

/** Constant light-search transmission mixture; default-setting native stripe/photo fit. */
export const SEARCH_LIGHT_MIXTURE = 1
export const SEARCH_LIGHT_OUTER_KERNEL = 0.98

type MaterialSurface = 'bar' | 'searchField' | 'menu'

/** The recipe row a surface reads: the search field is the bar row with SEARCH_FIELD_RECIPE. */
function recipeRow(surface: MaterialSurface, a: Appearance) {
  if (surface !== 'searchField') return recipes[`${a}-${surface}`]
  const bar = recipes[`${a}-bar`]
  const { diffusion, blurFill } = SEARCH_FIELD_RECIPE[a]
  return {
    ...bar,
    blurOpacities: [diffusion, diffusion, bar.blurOpacities[2]!, bar.blurOpacities[3]!],
    blurFill: [...blurFill],
  }
}

export function materialUniformValues(surface: MaterialSurface, a: Appearance) {
  const r = recipeRow(surface, a)
  const fields: Record<string, number[]> = {
    Units: r.units,
    Inner: r.inner,
    Outer: r.outer,
    Blend: r.blend,
    BlurFill: r.blurFill,
    BlurDistances: r.blurDistances,
    BlurDifferences: materialBlurDifferences(r.blurDistances, r.blurOpacities),
    Aberration: r.aberration,
    AberrationDirection: r.aberrationDirection,
    Colour: r.colour,
    Bleed: r.bleed,
    BleedField: r.bleedField,
    BackgroundKey: r.backgroundKey,
    BackgroundLight: r.backgroundLight,
    Key: r.key,
    Fill: r.fill,
    Light: r.light,
    Rim: r.rim,
    ContourAngular: r.contourAngular,
    ShadowField: r.shadowField,
    ShadowResponse: surface === 'menu' ? [...MENU_SHADOW_RESPONSE[a]] : r.shadowResponse,
    ShadowOffset: r.shadowOffset,
  }
  const layer = sdfRecipes[`${a}-${surface === 'menu' ? 'menu' : 'bar'}`]
  const { key, fill, projection } = layer
  Object.assign(fields, {
    SdfProjection: projection.slice(0, 4),
    SdfDiffuse: [
      layer.diffuseHeightScale,
      layer.diffuseSpreadScale,
      layer.diffuseAmountScale,
      projection[4],
    ],
    SdfKey: [key.height, Math.cos(key.spread), layer.curvature, key.amount],
    SdfFill: [fill.height, Math.cos(fill.spread), layer.curvature, fill.amount],
    SdfAngles: [key.angle, fill.angle, key.heightOffset, fill.heightOffset],
  })
  layer.matrix.forEach((row, i) => {
    fields[`Sdf${i}`] = row
  })
  for (const [name, matrix] of [
    ['Face', r.face],
    ['Bleed', r.bleedMatrix],
    ['Shadow', r.shadowMatrix],
  ] as const)
    matrix.forEach((row, i) => {
      fields[`${name}${i}`] = row
    })
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [`uMaterial${k}`, v]))
}

/** One material continuously between the bar recipe (0) and the menu recipe (1): the menu
 * morph starts and ends on the same bar glass as every toolbar button, with no swap. */
export function materialUniformMix(a: Appearance, mix: number) {
  const t = Math.max(0, Math.min(1, mix))
  const bar = materialUniformValues('bar', a)
  if (t === 0) return bar
  const menu = materialUniformValues('menu', a)
  if (t === 1) return menu
  return Object.fromEntries(
    Object.entries(bar).map(([k, v]) => [
      k,
      v.map((x, i) => x + ((menu[k] as number[])[i] - x) * t),
    ]),
  )
}
