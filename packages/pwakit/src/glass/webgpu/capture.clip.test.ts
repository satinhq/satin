import { describe, expect, it, vi } from 'vitest'
import type { MirrorNode } from '../lens/Scene.tsx'

vi.mock('./decodedImage.ts', () => ({
  decodedGlassImage: async () => ({ naturalWidth: 100, naturalHeight: 100 }),
}))
const { rasterProductionSource, sameClipChain } = await import('./capture.ts')

type Clip = NonNullable<MirrorNode['clips']>[number]
const listClip: Clip = { x: 20, y: 180, width: 400, height: 4640, radii: [20, 20, 20, 20] }
const cardClip: Clip = { x: 20, y: 40, width: 400, height: 100, radii: [12, 12, 12, 12] }

/** A Canvas2D stand-in that tracks the save/restore stack and records, for every draw, the clip
 * paths in force when it happened. */
function recordingContext() {
  const stack: string[][] = [[]]
  let path = ''
  const draws: { kind: string; clips: string[] }[] = []
  let clipCalls = 0
  const record = (kind: string) => draws.push({ kind, clips: [...stack.at(-1)!] })
  const context = {
    setTransform() {},
    translate() {},
    scale() {},
    save() {
      stack.push([...stack.at(-1)!])
    },
    restore() {
      stack.pop()
    },
    beginPath() {
      path = ''
    },
    rect(x: number, y: number, width: number, height: number) {
      path = `rect ${x} ${y} ${width} ${height}`
    },
    roundRect(x: number, y: number, width: number, height: number, radii: number | number[]) {
      path = `round ${x} ${y} ${width} ${height} ${String(radii)}`
    },
    clip() {
      clipCalls++
      stack.at(-1)!.push(path)
    },
    fill() {
      record('rect')
    },
    fillRect() {},
    fillText(text: string) {
      record(`text ${text}`)
    },
    measureText: () => ({ width: 0 }),
    set fillStyle(_value: string) {},
    set font(_value: string) {},
    set textBaseline(_value: string) {},
    set letterSpacing(_value: string) {},
    set globalAlpha(_value: number) {},
    set globalCompositeOperation(_value: string) {},
  }
  return {
    context,
    draws,
    clipCalls: () => clipCalls,
    /** Depth of the save stack: 1 when every save was restored. */
    depth: () => stack.length,
  }
}
const clipPath = (clip: Clip) =>
  `round ${clip.x} ${clip.y} ${clip.width} ${clip.height} ${String(clip.radii)}`
const measured = (nodes: MirrorNode[]) =>
  ({ top: 0, left: 0, layout: { width: 440, height: 5000, contentHeight: 5000, nodes } }) as never

async function draw(nodes: MirrorNode[]) {
  const recording = recordingContext()
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => recording.context,
  } as unknown as HTMLCanvasElement
  await rasterProductionSource(canvas, measured(nodes), 440, 5000, 1, false)
  return recording
}

describe('capture clipping: one clip per run of nodes under the same ancestor clips', () => {
  it('draws every node under exactly its own clips, whatever the grouping', async () => {
    const row = (index: number): MirrorNode[] => [
      {
        kind: 'rect',
        id: `row-${index}`,
        color: '#fff',
        x: 20,
        y: 180 + index * 58,
        width: 400,
        height: 58,
        // Each element reads its chain separately: equal clips, different arrays.
        clips: [{ ...listClip, radii: [...listClip.radii] }],
      },
      {
        kind: 'text',
        id: `label-${index}`,
        color: '#000',
        text: `Row ${index}`,
        x: 36,
        y: 198 + index * 58,
        width: 100,
        height: 22,
        clips: [{ ...listClip, radii: [...listClip.radii] }],
      },
    ]
    const nodes: MirrorNode[] = [
      { kind: 'rect', id: 'page', color: '#f2f2f7', x: 0, y: 0, width: 440, height: 5000 },
      {
        kind: 'rect',
        id: 'card',
        color: '#fff',
        x: 20,
        y: 40,
        width: 400,
        height: 100,
        clips: [cardClip],
      },
      ...Array.from({ length: 80 }, (_, index) => row(index)).flat(),
      { kind: 'rect', id: 'footer', color: '#eee', x: 0, y: 4900, width: 440, height: 100 },
      // The same chain again after an unclipped node: a new run with the same clip.
      ...row(80),
    ]
    const recording = await draw(nodes)
    const expected = nodes.map(node => ({
      kind: node.kind === 'text' ? `text ${node.text}` : 'rect',
      clips: (node.clips ?? []).map(clipPath),
    }))
    expect(recording.draws).toEqual(expected)
    expect(recording.depth()).toBe(1)
    // 163 clipped nodes, three runs: the card, the 80 rows, the row after the footer.
    expect(recording.clipCalls()).toBe(3)
  })

  it('nested clips and a changed clip start a new run', async () => {
    const inner: Clip = { x: 30, y: 190, width: 100, height: 40, radii: [0, 0, 0, 0] }
    const nodes: MirrorNode[] = [
      {
        kind: 'rect',
        id: 'a',
        color: '#fff',
        x: 20,
        y: 180,
        width: 400,
        height: 58,
        clips: [listClip],
      },
      {
        kind: 'rect',
        id: 'b',
        color: '#fff',
        x: 30,
        y: 190,
        width: 100,
        height: 40,
        clips: [inner, listClip],
      },
      {
        kind: 'rect',
        id: 'c',
        color: '#fff',
        x: 30,
        y: 190,
        width: 100,
        height: 40,
        clips: [inner, listClip],
      },
      {
        kind: 'rect',
        id: 'd',
        color: '#fff',
        x: 20,
        y: 238,
        width: 400,
        height: 58,
        clips: [listClip],
      },
    ]
    const recording = await draw(nodes)
    expect(recording.draws.map(entry => entry.clips)).toEqual([
      [clipPath(listClip)],
      [clipPath(inner), clipPath(listClip)],
      [clipPath(inner), clipPath(listClip)],
      [clipPath(listClip)],
    ])
    expect(recording.clipCalls()).toBe(4)
    expect(recording.depth()).toBe(1)
  })

  it('region foreground is skipped without ending or starting a run', async () => {
    const nodes: MirrorNode[] = [
      {
        kind: 'rect',
        id: 'a',
        color: '#fff',
        x: 20,
        y: 180,
        width: 400,
        height: 58,
        clips: [listClip],
      },
      {
        kind: 'rect',
        id: 'ink',
        color: '#000',
        x: 20,
        y: 180,
        width: 10,
        height: 10,
        regionId: 'r',
      },
      {
        kind: 'rect',
        id: 'b',
        color: '#fff',
        x: 20,
        y: 238,
        width: 400,
        height: 58,
        clips: [listClip],
      },
    ]
    const recording = await draw(nodes)
    expect(recording.draws).toHaveLength(2)
    expect(recording.clipCalls()).toBe(1)
  })

  it('compares clip chains by value', () => {
    expect(sameClipChain([listClip], [{ ...listClip, radii: [20, 20, 20, 20] }])).toBe(true)
    expect(sameClipChain([listClip], [{ ...listClip, height: 4641 }])).toBe(false)
    expect(sameClipChain([listClip], [{ ...listClip, radii: [20, 20, 20, 0] }])).toBe(false)
    expect(sameClipChain([listClip], [listClip, cardClip])).toBe(false)
    expect(sameClipChain([], [])).toBe(true)
  })
})
