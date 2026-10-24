import { toolbarMaterialRuns } from '../glass/toolbarMaterialContext.ts'

type Run = HTMLElement[]
export type ToolbarPair = {
  start?: Run
  startIndex?: number
  end?: Run
  index: number
  partition?: number
  splitFrom?: Run
  mergeInto?: Run
  splitting?: boolean
}
type Frame = { x: number; y: number; width: number; height: number }

/** Visual identity is used only for correspondence, never for action dispatch. */
function symbols(run: Run) {
  return run.flatMap(member =>
    [...member.querySelectorAll('[data-satin-symbol]')].map(symbol =>
      symbol.getAttribute('data-satin-symbol'),
    ),
  )
}

/** Reserve shared content first, then the closest capsule edge. Inserting a new
 * leading run must not steal the material belonging to a trailing action.
 * Array indices identify the settled owners, but do not establish correspondence. */
export function toolbarCorrespondence(
  starts: ReturnType<typeof toolbarMaterialRuns>,
  ends: ReturnType<typeof toolbarMaterialRuns>,
  frameOf: (run: Run) => Frame,
) {
  const candidates = starts.flatMap((start, startIndex) => {
    const from = frameOf(start)
    const identity = symbols(start)
    return ends.map((end, endIndex) => {
      const to = frameOf(end)
      const shared = symbols(end).filter(symbol => identity.includes(symbol)).length
      const edge = Math.min(
        Math.abs(from.x - to.x),
        Math.abs(from.x + from.width - to.x - to.width),
      )
      const centre = Math.abs(from.x + from.width / 2 - to.x - to.width / 2)
      const overlaps = from.x < to.x + to.width && to.x < from.x + from.width
      return { startIndex, endIndex, shared, edge, centre, overlaps }
    })
  })
  candidates.sort((a, b) => b.shared - a.shared || a.edge - b.edge || a.centre - b.centre)
  const used = new Set<number>()
  const pairs = new Map<number, number>()
  for (const candidate of candidates) {
    if (used.has(candidate.startIndex) || pairs.has(candidate.endIndex)) continue
    used.add(candidate.startIndex)
    pairs.set(candidate.endIndex, candidate.startIndex)
  }
  const result: ToolbarPair[] = [
    ...ends.map((end, endIndex) => ({
      start: pairs.has(endIndex) ? starts[pairs.get(endIndex)!] : undefined,
      startIndex: pairs.get(endIndex),
      end,
      index: endIndex,
    })),
    ...starts.flatMap((start, startIndex) =>
      used.has(startIndex)
        ? []
        : [{ start, startIndex, end: undefined, index: ends.length + startIndex }],
    ),
  ]
  // Unmatched runs join the partition containing their shared ink, falling back
  // to the nearest edge. The primary one-to-one owners stay reserved above.
  for (const pair of result) {
    if (pair.start && pair.end) continue
    const candidate = candidates.find(
      candidate =>
        (candidate.shared > 0 || candidate.overlaps) &&
        (pair.end
          ? candidate.endIndex === pair.index && used.has(candidate.startIndex)
          : candidate.startIndex === pair.startIndex && pairs.has(candidate.endIndex)),
    )
    if (!candidate) continue
    const primary = result.find(item => item.index === candidate.endIndex && item.start && item.end)
    // A split's destination is unmatched, so find the source's reserved owner.
    const owner = pair.end
      ? result.find(item => item.startIndex === candidate.startIndex && item.end)
      : primary
    if (!owner) continue
    pair.partition = owner.index
    owner.partition = owner.index
    if (pair.end) {
      pair.splitFrom = starts[candidate.startIndex]
      owner.splitting = true
    } else pair.mergeInto = ends[candidate.endIndex]
  }
  return result
}
