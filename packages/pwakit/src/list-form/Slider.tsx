import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ControlLens, trackThumbContact, type ControlLensHandle } from '../glass/ControlLens.tsx'
import { requestGlassSourceDamage } from '../glass/sourceDamage.ts'
import { CONTROL_LIFT, controlLensSize } from '../glass/lens/controlLift.ts'
import { SliderContact, type SliderFrame } from './sliderContact.ts'

export type SliderProps = {
  value: number
  onChange: (value: number) => void
  /** `in: min...max`; defaults to 0...1. */
  min?: number
  max?: number
  /** Snap to multiples of `step` from `min`; omit for a continuous Slider. */
  step?: number
  /** Show a tick mark at each step, centred under the thumb's stops. */
  ticks?: boolean
  /** Accessibility label; a Slider shows no visible label, as on iOS. */
  label: string
  disabled?: boolean
  tint?: string
  onEditingChange?: (editing: boolean) => void
}

/**
 * Native geometry (stock SwiftUI Slider in a Form, iPhone 17 Pro Max Simulator, iOS 27.0, 3×
 * stills, native control measurements `continuous.mov`): a 6 pt capsule track spans the row's content
 * width, the 37 × 24 pt white thumb stays inside it (its centre travels from 18.5 pt to width −
 * 18.5 pt), and the accent fill runs from the track start to the thumb centre with a round end.
 * Tick marks are 3 pt rounded squares centred 8.3 pt below the track at each stop.
 */
const SLIDER_HEIGHT_PT = 44
const THUMB_HALF_WIDTH_PT = CONTROL_LIFT.rest.width / 2
/** The thumb's touch target: 44 pt wide around its centre. */
const THUMB_HIT_HALF_WIDTH_PT = 22
/** The lens element overhangs the Slider so the held lens (58 × 37.3 pt, press peak ≈ 59.7 × 39)
 * fits at either end with room below for its exterior shadow. */
const LENS_OVERHANG_PT = 12
const LENS_OVERHANG_Y_PT = 8
/** Native's rim refracts the fill's start up and down; below this much fill before the rim there
 * is nothing to flare. */
const RIM_FLARE_MIN_PT = 0.5

const now = () => performance.timeOrigin + performance.now()

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value))
}

export function Slider(props: SliderProps) {
  return <SliderControl {...props} />
}

export function SliderRow(props: SliderProps) {
  return (
    <div data-satin-row="true" data-satin-slider-row="true">
      <SliderControl {...props} />
    </div>
  )
}

/**
 * The thumb is drawn the way the Toggle's is: a white thumb that, after the native stationary hold
 * or once a drag starts, becomes the shared control lens (`ControlLens kind="slider"`, the
 * `control` lens profile) and follows the finger; release restores it with the Slider's measured
 * spring. The accent fill is region content beside the thumb: while the lens is shown the fill is
 * drawn above it (the captured glass source cannot follow a fill that changes every frame), up to
 * the thumb centre as native shows through its lens, with native's rim line, shade and edge flare
 * drawn on it in CSS.
 */
function SliderControl({
  value,
  onChange,
  min = 0,
  max = 1,
  step,
  ticks = false,
  label,
  disabled = false,
  tint,
  onEditingChange,
}: SliderProps) {
  if (!(max > min)) throw new Error('Slider bounds must be ordered numbers (min < max).')
  if (step !== undefined && !(step > 0)) throw new Error('Slider step must be greater than zero.')
  const root = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const thumbHit = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const lens = useRef<ControlLensHandle | null>(null)
  const latest = useRef({ value, onChange, onEditingChange })
  latest.current = { value, onChange, onEditingChange }
  const range = { min, max, step }
  const rangeRef = useRef(range)
  rangeRef.current = range
  const [contact] = useState(() => new SliderContact(positionOf(value, range)))
  const [lensActive, setLensActive] = useState(false)
  const frame = useRef(0)
  const lensPhase = useRef<'hidden' | 'lifted' | 'restoring'>('hidden')
  const lensCenter = useRef(0)
  const endListeners = useRef<(() => void) | undefined>(undefined)

  function travel() {
    return Math.max(0, (root.current?.clientWidth ?? 0) - 2 * THUMB_HALF_WIDTH_PT)
  }
  function paint(state: SliderFrame) {
    const element = thumb.current
    if (!element) return
    const size = controlLensSize('slider', state.lift)
    const trackCenter = THUMB_HALF_WIDTH_PT + state.position * travel()
    const center = LENS_OVERHANG_PT + trackCenter
    element.style.left = `${center - size.width / 2}px`
    element.style.top = `${LENS_OVERHANG_Y_PT + (SLIDER_HEIGHT_PT - size.height) / 2}px`
    element.style.width = `${size.width}px`
    element.style.height = `${size.height}px`
    element.style.borderRadius = `${size.height / 2}px`
    element.style.opacity = `${1 - clamp(state.lift, 0, 1)}`
    const fillElement = fill.current
    if (fillElement) {
      fillElement.style.width = `${trackCenter}px`
      // The fill keeps running under the lens rim (styles.css draws the rim line, the shade
      // under the glass and the refraction flare from these two values).
      const rim = trackCenter - size.width / 2
      const lift = clamp(state.lift, 0, 1)
      fillElement.style.setProperty('--satin-slider-rim', `${rim}px`)
      fillElement.style.setProperty('--satin-slider-lift', `${lift}`)
      fillElement.style.setProperty('--satin-slider-flare', `${rim > RIM_FLARE_MIN_PT ? lift : 0}`)
      // Only while lifted: at rest the fill is glass source content, drawn plain.
      fillElement.toggleAttribute('data-satin-slider-lifted', lift > 0)
    }
    if (thumbHit.current)
      thumbHit.current.style.left = `${center - LENS_OVERHANG_PT - THUMB_HIT_HALF_WIDTH_PT}px`
    lensCenter.current = center
    if (lensPhase.current !== 'hidden') lens.current?.interact('dragging', center, now())
  }
  function tick() {
    frame.current = 0
    const at = now()
    // Lift only once the renderer has the lens: glass shows in the lift's first frame.
    const lifting = contact.liftDue(at) && !!lens.current?.ready
    if (lifting) contact.lift(at)
    paint(contact.sample(at))
    if (lifting) {
      lensPhase.current = 'lifted'
      lens.current?.interact('pressed', lensCenter.current, at)
    }
    if (contact.needsFrame) {
      frame.current = requestAnimationFrame(tick)
      return
    }
    if (lensPhase.current !== 'hidden') lens.current?.interact('rest', lensCenter.current, now())
    lensPhase.current = 'hidden'
    setLensActive(false)
  }
  function schedule() {
    if (!frame.current) frame.current = requestAnimationFrame(tick)
  }
  function paintNow() {
    cancelAnimationFrame(frame.current)
    tick()
  }
  // The thumb's geometry is written here, never by React, so a re-render cannot jump it.
  useLayoutEffect(() => {
    contact.setPosition(positionOf(value, range))
    paint(contact.sample(now()))
    if (contact.needsFrame) schedule()
    // Like a Toggle, the control owns its presentation writes. During a contact
    // its fill/thumb are region content, so they cannot change the captured source.
    // Keyboard and application updates at rest still invalidate sampled content;
    // contact registration/retirement own the two interaction source boundaries.
    if (!contact.active && lensPhase.current === 'hidden' && root.current)
      requestGlassSourceDamage(root.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, step])
  useEffect(() => {
    const element = root.current
    if (!element) return
    const resized = new ResizeObserver(() => paint(contact.sample(now())))
    resized.observe(element)
    return () => resized.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      endListeners.current?.()
    },
    [],
  )

  function begin(event: ReactPointerEvent<HTMLDivElement>) {
    const element = root.current
    if (disabled || event.button !== 0 || contact.active || !element) return
    const box = element.getBoundingClientRect()
    const thumbCenter = box.left + THUMB_HALF_WIDTH_PT + contact.sample(now()).position * travel()
    // As UISlider, only the thumb takes a drag; the rest of the row stays scrollable.
    if (Math.abs(event.clientX - thumbCenter) > THUMB_HIT_HALF_WIDTH_PT) return
    // Only the thumb owns a sheet contact; track taps still belong to the sheet/scroll.
    const ownsVertical = !!element.closest('[data-satin-presentation="sheet"]')
    const pointerId = event.pointerId
    let ended = false
    // The finger arrives through the one contact path of interactive glass. A scroll that claims
    // the touch before the thumb drags cancels it; a dragging thumb (or a sheet's) keeps it.
    function move(x: number, y: number) {
      const snap = (position: number) =>
        positionOf(valueOf(position, rangeRef.current), rangeRef.current)
      const result = contact.move(pointerId, x, y, travel(), snap)
      if (result === 'vertical') finish()
      if (result === 'drag') commit()
      paintNow()
    }
    const finger = trackThumbContact(event.nativeEvent, {
      move,
      up(x, y) {
        // WebKit can coalesce the last move into release. It is still a valid finger sample;
        // cancellation coordinates are not and continue through finish alone.
        move(x, y)
        finish()
      },
      cancel: () => finish(),
      yields: () => !ownsVertical && !contact.dragging,
    })
    if (!finger) return
    contact.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    contact.down(pointerId, event.clientX, event.clientY, now(), ownsVertical)
    latest.current.onEditingChange?.(true)
    setLensActive(true)
    function commit() {
      const next = valueOf(contact.sample(now()).position, rangeRef.current)
      if (next !== latest.current.value) latest.current.onChange(next)
    }
    function finish() {
      if (ended) return
      ended = true
      const at = now()
      contact.end(at)
      if (lensPhase.current === 'lifted') {
        lensPhase.current = 'restoring'
        lens.current?.interact('releasing', lensCenter.current, at)
      }
      endListeners.current?.()
      latest.current.onEditingChange?.(false)
      paintNow()
    }
    endListeners.current = () => {
      endListeners.current = undefined
      finger.end('rest')
    }
    schedule()
  }

  const stops = ticks && step !== undefined ? Math.floor((max - min) / step + 1e-9) : 0
  return (
    <div
      ref={root}
      data-satin-slider="true"
      data-satin-role="chrome"
      data-satin-slider-ticks={stops > 0 ? 'true' : undefined}
      data-satin-horizontal-drag={disabled ? undefined : 'both'}
      aria-disabled={disabled || undefined}
      style={tint ? ({ '--satin-list-accent': tint } as CSSProperties) : undefined}
      onPointerDown={begin}
    >
      {/* The native range input carries keyboard and VoiceOver adjustment; it takes no touches. */}
      <input
        type="range"
        data-satin-slider-input="true"
        aria-label={label}
        min={min}
        max={max}
        step={step ?? 'any'}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.currentTarget.value))}
      />
      <span data-satin-slider-track="true" />
      {stops > 0 ? (
        <span data-satin-slider-tick-row="true" aria-hidden="true">
          {Array.from({ length: stops + 1 }, (_, index) => (
            <span
              key={index}
              data-satin-slider-tick="true"
              style={{
                left: `calc(${THUMB_HALF_WIDTH_PT}px + (100% - ${2 * THUMB_HALF_WIDTH_PT}px) * ${index / stops})`,
              }}
            />
          ))}
        </span>
      ) : null}
      <span ref={thumbHit} data-satin-slider-thumb-hit="true" aria-hidden="true" />
      <ControlLens kind="slider" active={lensActive} handle={lens}>
        <span ref={fill} data-satin-slider-fill="true" />
        <span ref={thumb} data-satin-slider-thumb="true" />
      </ControlLens>
    </div>
  )
}

type Range = { min: number; max: number; step?: number }

function valueOf(position: number, { min, max, step }: Range) {
  const raw = min + clamp(position, 0, 1) * (max - min)
  if (step === undefined) return raw
  return clamp(min + Math.round((raw - min) / step) * step, min, max)
}

function positionOf(value: number, { min, max }: Range) {
  return clamp((value - min) / (max - min), 0, 1)
}
