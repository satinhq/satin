import { describe, expect, it } from 'vitest'
import { glassBlendRadius, type GlassFieldMember } from './morphField.ts'
import { glassUnionOutline } from './unionOutline.ts'

const circle = (x: number): GlassFieldMember => ({
  centerX: x,
  centerY: 0,
  halfWidth: 36,
  halfHeight: 36,
  radius: 36,
})
// Independent float32 evaluation of the shader's uniform operations (not the
// CPU distance helper). Actual GPU readback is a separate Catalyst acceptance.
const shaderField = (x: number, y: number, members: readonly GlassFieldMember[], k: number) => {
  const f = Math.fround
  let d = f(1e10)
  let normal = [0, 0]
  for (const s of members) {
    const qx = f(f(Math.abs(f(x - s.centerX)) - s.halfWidth) + s.radius)
    const qy = f(f(Math.abs(f(y - s.centerY)) - s.halfHeight) + s.radius)
    const next = f(
      f(Math.min(Math.max(qx, qy), 0) + f(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)))) - s.radius,
    )
    let nx = f(Math.max(qx, 0) * Math.sign(x - s.centerX)),
      ny = f(Math.max(qy, 0) * Math.sign(y - s.centerY))
    if (Math.max(qx, qy) <= 0) {
      nx = qx >= qy ? Math.sign(x - s.centerX) : 0
      ny = qx >= qy ? 0 : Math.sign(y - s.centerY)
    }
    const length = Math.max(f(Math.hypot(nx, ny)), 1e-8)
    const nb = [f(nx / length), f(ny / length)]
    if (d > 1e9) {
      d = next
      normal = nb
      continue
    }
    const dot = f(f(normal[0]! * nb[0]!) + f(normal[1]! * nb[1]!))
    // The blend radius itself scales with the normals' opposition (C1 across the bisector).
    const blend = f(k * f(Math.pow(Math.max(0, Math.min(1, f(f(1 - dot) * 0.5))), 1)))
    if (blend <= 1e-4) {
      if (next < d) {
        d = next
        normal = nb
      }
      continue
    }
    const h = f(Math.max(f(blend - Math.abs(f(d - next))), 0) / blend)
    const w = Math.max(0, Math.min(1, f(0.5 + f(f(d - next) / f(2 * blend)))))
    d = f(Math.min(d, next) - f(f(f(h * h) * blend) * 0.25))
    const mix = normal.map((n, i) => f(f(n * f(1 - w)) + f(nb[i]! * w)))
    const mixLength = Math.max(f(Math.hypot(...mix)), 1e-8)
    normal = mix.map(n => f(n / mixLength))
  }
  return d
}

describe('renderer-neutral union outline', () => {
  it.each([0, 10, 20, 40, 80])(
    'matches the float32 shader boundary within one pixel at spacing %s',
    spacing => {
      for (const gap of [2, spacing * 0.5 - 1, spacing * 0.5 + 1].filter(g => g > 0)) {
        const members = [circle(-36 - gap / 2), circle(36 + gap / 2)]
        const k = glassBlendRadius(spacing),
          contours = glassUnionOutline({ members, blendRadius: k })
        expect(contours.length).toBe(gap < spacing * 0.5 ? 1 : 2)
        for (const contour of contours) {
          expect(contour.at(-1)).toEqual(contour[0])
          for (const p of contour)
            expect(Math.abs(shaderField(p.x, p.y, members, k))).toBeLessThan(0.01)
          // Verify segments too, including diagonal triangle edges, not only roots.
          for (let i = 1; i < contour.length; i++) {
            const a = contour[i - 1]!,
              b = contour[i]!
            expect(
              Math.abs(shaderField((a.x + b.x) / 2, (a.y + b.y) / 2, members, k)),
            ).toBeLessThan(1)
          }
        }
      }
    },
  )
  it('keeps disjoint rounded rectangles and handles more than two members', () => {
    const members = [
      { ...circle(-90), halfWidth: 30, halfHeight: 20, radius: 8 },
      circle(0),
      circle(70),
    ]
    expect(glassUnionOutline({ members, blendRadius: 20 }).length).toBe(2)
  })
  it('bounds invalid or excessive diagnostic work', () => {
    expect(glassUnionOutline({ members: [], blendRadius: 0 })).toEqual([])
    expect(() => glassUnionOutline({ members: [circle(0)], blendRadius: -1 })).toThrow()
    expect(() => glassUnionOutline({ members: [circle(0)], blendRadius: 0 }, 2)).toThrow()
    expect(() =>
      glassUnionOutline({ members: Array(17).fill(circle(0)), blendRadius: 1 }),
    ).toThrow()
  })
})
