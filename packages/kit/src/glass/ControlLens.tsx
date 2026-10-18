import {
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { MaterialEffectContext } from './liquidContext.ts'
import { GlassContact, type GlassContactEnd } from './glassContact.ts'
import { Glass } from './regions.ts'
import { requestGlassSourceDamage } from './sourceDamage.ts'
import type { ControlLiftKind } from './lens/controlLift.ts'

export type ControlLensHandle = {
  /** The renderer has presented the (transparent) lens, so a lift shows glass in its first frame. */
  readonly ready: boolean
  /** `centerX`: the lens centre in the lens element's CSS px; `epoch` as performance.timeOrigin +
   * performance.now(), the clock of the page's own copy of the lift spring. */
  interact(
    phase: 'pressed' | 'dragging' | 'releasing' | 'rest',
    centerX: number,
    epoch: number,
  ): void
}

/**
 * The held glass lens of a Toggle or Slider thumb (CONTROL_LIFT). The region is registered only
 * while `active` (a contact is live), so a Form of switches does not hold one glass region each;
 * the stationary hold before the lift leaves time to prepare it. The renderer grows the lens with
 * the control's measured springs from the page's `pressed`/`releasing` and follows the centre it is
 * sent. The lens is drawn by the region's lift overlay with the tab selection lens's optics (rim,
 * refraction bands, exterior shadow). While the region is registered its children (the white thumb)
 * are region content, so they leave the glass source and the lens refracts the track, never a copy
 * of the thumb it replaces; at rest the thumb is ordinary content that bars over a list sample.
 */
export function ControlLens({
  kind,
  active,
  handle,
  style,
  children,
}: {
  kind: ControlLiftKind
  active: boolean
  handle: { current: ControlLensHandle | null }
  style?: CSSProperties
  children?: ReactNode
}) {
  const id = useId()
  const element = useRef<HTMLSpanElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const liquid = useContext(MaterialEffectContext)
  const regions = liquid?.backend ? liquid.regions : undefined
  useLayoutEffect(() => {
    const lens = element.current
    if (!active || !regions || !lens || !canvas.current) return
    const unregister = regions.register({
      id,
      element: lens,
      canvas: canvas.current,
      overlay: overlay.current ?? undefined,
      descriptor: {
        id,
        material: { ...Glass.clear.interactive().material, control: kind },
        shape: 'capsule',
      },
    })
    // The thumb joins (and later leaves) region content: the source under it changed.
    requestGlassSourceDamage(lens)
    return () => {
      unregister()
      requestGlassSourceDamage(lens)
    }
  }, [active, regions, id, kind])
  useLayoutEffect(() => {
    handle.current = {
      get ready() {
        return active && canvas.current?.dataset.satinGlassPresented === 'true'
      },
      interact(phase, centerX, epoch) {
        regions?.interact({
          regionId: id,
          phase,
          epoch,
          contact: { x: centerX, y: 0 },
        })
      },
    }
  })
  return (
    <span
      ref={element}
      data-satin-control-lens={kind}
      data-satin-glass-region-id={active && regions ? id : undefined}
      style={style}
    >
      <canvas
        ref={canvas}
        style={{ position: 'absolute' }}
        aria-hidden="true"
        data-satin-glass-region-canvas="true"
      />
      {regions ? (
        <canvas
          ref={overlay}
          style={{ position: 'absolute' }}
          aria-hidden="true"
          data-satin-glass-region-canvas="true"
          data-satin-glass-lift="region"
        />
      ) : null}
      {children}
    </span>
  )
}

/**
 * A Toggle or Slider thumb's finger, through the one contact path of interactive glass
 * (GlassContact): the same pointer tracking, innermost-glass claim, owned-gesture cancellation and
 * window-blur end as every glass button, field and surface. The thumb's response (it follows the
 * finger along its track and lifts into a lens; contactPhysics.ts, track thumbs) is the control's
 * own model; this only delivers the finger. Returns the contact, or undefined when the touch is not
 * the thumb's (a glass inside it took it, or it is not a primary press).
 */
export function trackThumbContact(
  event: PointerEvent,
  finger: {
    move(x: number, y: number): void
    up(x: number, y: number): void
    /** The contact ended without a release: `cancel` (the browser), `gesture` (a scroll or a
     * sheet claimed the touch) or `clear` (window blur, unmount). */
    cancel(end: GlassContactEnd): void
    /** Whether a gesture that claims the touch now takes it from the thumb. */
    yields(): boolean
  },
) {
  const contact = new GlassContact({
    send: (phase, point, _epoch, end) => {
      if (phase === 'dragging') {
        if (point) finger.move(point.x, point.y)
      } else if (phase === 'releasing' && end === 'up' && point) finger.up(point.x, point.y)
      else if (phase !== 'pressed') finger.cancel(end ?? 'clear')
    },
    yieldsTo: () => finger.yields(),
    ownsNativePan: () => !finger.yields(),
  })
  const target = event.target instanceof Node ? event.target.ownerDocument : null
  return target && contact.down(event, target) ? contact : undefined
}
