import { glassApertureInFrame, glassShapeTrack } from './shapeTrackRegistry.ts'
import { shapeTrackClock } from './shapeTrack.ts'
import { toolbarMaterialContent, toolbarMenuContents } from './toolbarMaterialContext.ts'
import { foregroundGeometry } from './webgpu/foreground.ts'

/** A menu owns one source pose through asynchronous atlas preparation. DOM geometry must not
 * be read again after font/image decoding has allowed the toolbar to advance. */
let generation = 0
const snapshots = new WeakMap<HTMLElement, ReturnType<typeof createSnapshot>>()

function createSnapshot(element: HTMLElement) {
  const at = shapeTrackClock()
  const envelope = element.getBoundingClientRect()
  const aperture = glassApertureInFrame(element, envelope, at)
  const layout = localBox(element)
  const members = toolbarMenuContents(toolbarMaterialContent(element)).map(member => ({
    element: member,
    geometry: foregroundGeometry(member),
  }))
  return { id: ++generation, at, element, layout, envelope, aperture, members }
}

function localBox(element: HTMLElement) {
  const style = getComputedStyle(element)
  return {
    x: parseFloat(style.left) || 0,
    y: parseFloat(style.top) || 0,
    width: parseFloat(style.width) || element.offsetWidth,
    height: parseFloat(style.height) || element.offsetHeight,
  }
}

export function snapshotMenuTrigger(element: HTMLElement) {
  if (!glassShapeTrack(element)) return undefined
  const snapshot = createSnapshot(element)
  snapshots.set(element, snapshot)
  return snapshot
}

export function menuTriggerSnapshot(element: HTMLElement, id: number | undefined) {
  const snapshot = snapshots.get(element)
  return snapshot?.id === id ? snapshot : undefined
}

/** Move a captured viewport pose into the renderer's resting plane without resampling it. */
export function mapTriggerSnapshot(
  snapshot: NonNullable<ReturnType<typeof menuTriggerSnapshot>>,
  envelope: { x: number; y: number; width: number; height: number },
) {
  // The toolbar may retire its envelope during decoding. Only its ancestor transform belongs
  // to this mapping; a new endpoint width must not stretch the earlier aperture or glyphs.
  const current = localBox(snapshot.element)
  const scaleX = current.width ? envelope.width / current.width : 1
  const scaleY = current.height ? envelope.height / current.height : 1
  const origin = {
    x: envelope.x + (snapshot.layout.x - current.x) * scaleX,
    y: envelope.y + (snapshot.layout.y - current.y) * scaleY,
  }
  const sx = snapshot.envelope.width
    ? (snapshot.layout.width * scaleX) / snapshot.envelope.width
    : 1
  const sy = snapshot.envelope.height
    ? (snapshot.layout.height * scaleY) / snapshot.envelope.height
    : 1
  const map = (rect: { x: number; y: number; width: number; height: number }) =>
    new DOMRect(
      origin.x + (rect.x - snapshot.envelope.x) * sx,
      origin.y + (rect.y - snapshot.envelope.y) * sy,
      rect.width * sx,
      rect.height * sy,
    )
  return {
    aperture: map(snapshot.aperture),
    members: snapshot.members.map(({ geometry }) => ({
      bounds: map(geometry.bounds),
      rects: new Map([...geometry.rects].map(([element, rect]) => [element, map(rect)])),
      lines: new Map(
        [...geometry.lines].map(([node, lines]) => [
          node,
          lines.map(line => ({ ...line, rect: map(line.rect) })),
        ]),
      ),
    })),
  }
}
