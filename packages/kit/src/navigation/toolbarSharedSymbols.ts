import { linearSampleIndices } from '../motion/linearSamples.ts'
import type { ShapeFrame } from '../glass/shapeTrack.ts'
import type { ToolbarInk } from './toolbarGlassMotion.ts'

type SymbolInk = { element: SVGElement; frame: ShapeFrame; color: string }

function symbols(members: ToolbarInk[], resting: ShapeFrame) {
  const found = new Map<string, SymbolInk[]>()
  for (const member of members) {
    const box = member.element.getBoundingClientRect()
    if (!box.width || !box.height) continue
    const scale = parseFloat(getComputedStyle(member.element).scale) || 1
    for (const element of member.element.querySelectorAll<SVGElement>('svg[data-satin-symbol]')) {
      const rect = element.getBoundingClientRect()
      const width = (rect.width * member.frame.width) / box.width / scale
      const height = (rect.height * member.frame.height) / box.height / scale
      const centerX =
        member.frame.x + ((rect.left + rect.width / 2 - box.left) * member.frame.width) / box.width
      const centerY =
        member.frame.y + ((rect.top + rect.height / 2 - box.top) * member.frame.height) / box.height
      const frame = {
        x:
          resting.x +
          resting.width / 2 +
          (centerX - resting.x - resting.width / 2) / scale -
          width / 2,
        y:
          resting.y +
          resting.height / 2 +
          (centerY - resting.y - resting.height / 2) / scale -
          height / 2,
        width,
        height,
      }
      const name = element.dataset.satinSymbol!
      found.set(name, [
        ...(found.get(name) ?? []),
        { element, frame, color: getComputedStyle(element).color },
      ])
    }
  }
  return found
}

/** A uniquely shared glyph remains sharp while its siblings cross-blur. The
 * retained SVG is passive ink inside the material owner; live buttons continue
 * to own semantics and input. Ambiguous repeated symbols use the normal dissolve. */
export function retainToolbarSymbols(
  owner: HTMLElement,
  members: ToolbarInk[],
  from: ShapeFrame,
  to: ShapeFrame,
  envelope: ShapeFrame,
  mix: readonly number[],
  source: Animation,
  duration: number,
) {
  const outgoing = symbols(
    members.filter(member => !member.incoming),
    from,
  )
  const incoming = symbols(
    members.filter(member => member.incoming),
    to,
  )
  const restore: (() => void)[] = []
  for (const [name, starts] of outgoing) {
    const ends = incoming.get(name)
    if (starts.length !== 1 || ends?.length !== 1) continue
    const start = starts[0]!
    const end = ends[0]!
    if (start.color !== end.color) continue
    const clone = start.element.cloneNode(true) as SVGElement
    clone.setAttribute('aria-hidden', 'true')
    Object.assign(clone.style, {
      position: 'absolute',
      left: '0px',
      top: '0px',
      margin: '0px',
      color: start.color,
      visibility: 'visible',
      opacity: '1',
      filter: 'none',
      pointerEvents: 'none',
      zIndex: '1',
    })
    owner.append(clone)
    const animation = clone.animate(
      linearSampleIndices(mix.map(value => [value])).map(index => ({
        offset: index / (mix.length - 1),
        translate: `${start.frame.x + (end.frame.x - start.frame.x) * mix[index]! - envelope.x}px ${start.frame.y + (end.frame.y - start.frame.y) * mix[index]! - envelope.y}px`,
        width: `${start.frame.width + (end.frame.width - start.frame.width) * mix[index]!}px`,
        height: `${start.frame.height + (end.frame.height - start.frame.height) * mix[index]!}px`,
      })),
      { duration, easing: 'linear', fill: 'both' },
    )
    void animation.finished.catch(() => {})
    if (source.startTime === null || source.playState === 'paused') {
      animation.pause()
      animation.currentTime = Number(source.currentTime ?? 0)
    } else animation.startTime = source.startTime
    for (const { element } of [start, end]) {
      const visibility = element.style.visibility
      element.style.visibility = 'hidden'
      restore.push(() => {
        element.style.visibility = visibility
      })
    }
    restore.push(() => {
      animation.cancel()
      clone.remove()
    })
  }
  return () => {
    for (const release of restore) release()
  }
}
