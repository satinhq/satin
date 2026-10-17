import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { SensoryButton } from '../haptics/SensoryButton.tsx'
import { ControlLens, trackThumbContact, type ControlLensHandle } from '../glass/ControlLens.tsx'
import { CONTROL_LIFT, controlLensSize } from '../glass/lens/controlLift.ts'
import { requestGlassSourceDamage } from '../glass/sourceDamage.ts'
import {
  ownPhysicalContact,
  retirePhysicalContact,
  TOGGLE_CONTACT_CLICK_WINDOW_MS,
} from '../press/contactReceipt.ts'
import { TOGGLE_TRAVEL_PT, ToggleContact, type ToggleFrame } from './toggleContact.ts'
import { RowLabelBody } from './RowLabel.tsx'

export type ToggleProps = {
  style?: CSSProperties
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
  /** A secondary line under the label in a row; the switch's accessible description. */
  subtitle?: string
  tint?: string
}

/** The lens element overhangs the 63 × 44 pt switch so the held lens (and its press overshoot)
 * fits at either end of the travel, with room below for its exterior shadow. */
const LENS_OVERHANG_PT = 11
const LENS_OVERHANG_Y_PT = 8
const SWITCH_HEIGHT_PT = 44
/** Thumb centre at the off end: 2 pt inset plus half the 37 pt resting thumb. */
const THUMB_OFF_CENTER_PT = 2 + CONTROL_LIFT.rest.width / 2

const now = () => performance.timeOrigin + performance.now()

export function Toggle(props: ToggleProps) {
  return <ToggleControl {...props} />
}

export function ToggleRow({
  label,
  subtitle,
  checked,
  onChange,
  disabled = false,
  leading,
  style,
}: ToggleProps & { label: string; leading?: ReactNode }) {
  return (
    <ToggleControl
      row
      style={style}
      label={label}
      subtitle={subtitle}
      leading={leading}
      disabled={disabled}
      checked={checked}
      onChange={onChange}
    />
  )
}

function ToggleControl({
  checked,
  onChange,
  disabled = false,
  label,
  subtitle,
  row = false,
  leading,
  tint,
  style,
}: ToggleProps & { row?: boolean; leading?: ReactNode }) {
  const labelId = useId()
  const subtitleId = useId()
  const contactOwner = useRef({}).current
  const lens = useRef<ControlLensHandle | null>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  const latest = useRef({ checked, onChange })
  latest.current = { checked, onChange }
  const [contact] = useState(() => new ToggleContact(checked, now()))
  const [lensActive, setLensActive] = useState(false)
  const frame = useRef(0)
  /** What the renderer was last told. A shown lens (lifted or restoring) follows the thumb. */
  const lensPhase = useRef<'hidden' | 'lifted' | 'restoring'>('hidden')
  const lensCenter = useRef(0)
  const endListeners = useRef<(() => void) | undefined>(undefined)

  function paint(state: ToggleFrame) {
    const element = thumb.current
    if (!element) return
    const size = controlLensSize('toggle', state.lift)
    const center = LENS_OVERHANG_PT + THUMB_OFF_CENTER_PT + state.position * TOGGLE_TRAVEL_PT
    element.style.left = `${center - size.width / 2}px`
    element.style.top = `${LENS_OVERHANG_Y_PT + (SWITCH_HEIGHT_PT - size.height) / 2}px`
    element.style.width = `${size.width}px`
    element.style.height = `${size.height}px`
    element.style.borderRadius = `${size.height / 2}px`
    // The white thumb gives way to the lens as it grows (the same spring drives both).
    element.style.opacity = `${1 - Math.min(1, Math.max(0, state.lift))}`
    const moved = lensCenter.current !== center
    lensCenter.current = center
    if (moved && lensPhase.current !== 'hidden') lens.current?.interact('dragging', center, now())
  }
  function tick() {
    frame.current = 0
    const at = now()
    // Lift only once the renderer has the lens: glass shows in the lift's first frame.
    const lifting = contact.liftDue(at) && !!lens.current?.ready
    if (lifting) contact.lift(at)
    paint(contact.sample(at))
    // Sent after this frame's paint, so no later-stamped centre update precedes it.
    if (lifting) {
      lensPhase.current = 'lifted'
      lens.current?.interact('pressed', lensCenter.current, at)
    }
    if (contact.needsFrame) {
      frame.current = requestAnimationFrame(tick)
      return
    }
    // A settled hold keeps its lens. Input wakes this same transaction when the finger moves.
    if (contact.active) return
    if (lensPhase.current !== 'hidden') lens.current?.interact('rest', lensCenter.current, now())
    lensPhase.current = 'hidden'
    setLensActive(false)
  }
  /** The contact ended: the lens restores with the control's release spring from `at`. */
  function releaseLens(at: number) {
    if (lensPhase.current !== 'lifted' || contact.isLifted) return
    lensPhase.current = 'restoring'
    lens.current?.interact('releasing', lensCenter.current, at)
  }
  function schedule() {
    if (!frame.current) frame.current = requestAnimationFrame(tick)
  }
  /** Input paints in its own event, so the thumb never trails the finger by a frame. */
  function paintNow() {
    cancelAnimationFrame(frame.current)
    tick()
  }
  // The thumb's geometry is written here, never by React, so a re-render cannot jump it.
  const mounted = useRef(false)
  useLayoutEffect(() => {
    contact.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    contact.setChecked(checked, now(), mounted.current)
    // Without a track transition there is no transitionend to recapture on.
    const visual = thumb.current?.closest('[data-satin-toggle]')
    if (mounted.current && contact.reducedMotion && visual) requestGlassSourceDamage(visual)
    mounted.current = true
    paint(contact.sample(now()))
    if (contact.needsFrame) schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked])
  useEffect(() => {
    const visual = thumb.current?.closest('[data-satin-toggle]')
    if (!visual) return
    // The lens and other glass sample the track: recapture it once its colour has settled.
    const settled = (event: Event) => {
      const transition = event as TransitionEvent
      if (transition.pseudoElement === '::before' && transition.propertyName === 'background-color')
        requestGlassSourceDamage(visual)
    }
    visual.addEventListener('transitionend', settled)
    return () => visual.removeEventListener('transitionend', settled)
  }, [])
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      endListeners.current?.()
      retirePhysicalContact(document, contactOwner)
    },
    [contactOwner],
  )

  function begin(event: ReactPointerEvent<HTMLLabelElement>) {
    if (disabled || event.button !== 0 || contact.active) return
    // In a row only the switch itself drags; the label keeps its tap.
    if (row && !(event.target instanceof Element && event.target.closest('[data-satin-toggle]')))
      return
    // Ancestor row actions must not press with the switch. WebKit still owns native pan-y.
    event.stopPropagation()
    // A sheet switch owns its whole contact, including vertical travel.
    const ownsVertical = !!event.currentTarget.closest('[data-satin-presentation="sheet"]')
    const labelElement = event.currentTarget
    const pointerId = event.pointerId
    let ended = false
    // The finger arrives through the one contact path of interactive glass. A scroll that claims
    // the touch before the thumb drags cancels it; a dragging thumb (or a sheet's) keeps it.
    const finger = trackThumbContact(event.nativeEvent, {
      move(x, y) {
        if (contact.move(pointerId, x, y, now()) === 'vertical') finish()
        paintNow()
      },
      up(x, y) {
        const at = now()
        // The release position is the contact's last sample.
        contact.move(pointerId, x, y, at)
        const result = contact.up(pointerId, at)
        releaseLens(at)
        finish()
        if (!result) return
        // Every physical release commits here, whether or not WebKit later generates a click.
        ownPhysicalContact(document, contactOwner, TOGGLE_CONTACT_CLICK_WINDOW_MS, {
          pointerId,
          nativeLabel: result.dragged ? undefined : labelElement,
        })
        if (result.value !== latest.current.checked) latest.current.onChange(result.value)
      },
      cancel(end) {
        finish()
        if (end === 'cancel') retirePhysicalContact(document, contactOwner)
      },
      yields: () => !ownsVertical && !contact.dragging,
    })
    if (!finger) return
    contact.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    contact.down(
      pointerId,
      event.clientX,
      event.clientY,
      latest.current.checked,
      now(),
      ownsVertical,
    )
    setLensActive(true)
    function finish() {
      if (ended) return
      ended = true
      const at = now()
      contact.cancel(at)
      releaseLens(at)
      endListeners.current?.()
      paintNow()
    }
    endListeners.current = () => {
      endListeners.current = undefined
      finger.end('rest')
    }
    schedule()
  }

  const switchVisual = (
    <ControlLens kind="toggle" active={lensActive} handle={lens}>
      <span ref={thumb} data-satin-toggle-thumb="true" />
    </ControlLens>
  )
  return (
    <SensoryButton
      style={
        {
          ...(tint ? { '--satin-list-accent': tint, '--satin-list-toggle-on': tint } : {}),
          ...style,
        } as CSSProperties
      }
      role="switch"
      aria-checked={checked}
      aria-label={row ? undefined : label}
      aria-labelledby={row ? labelId : undefined}
      aria-describedby={row && subtitle !== undefined ? subtitleId : undefined}
      disabled={disabled}
      data-satin-row={row ? 'true' : undefined}
      data-satin-row-disabled={row && disabled ? 'true' : undefined}
      data-satin-toggle-row={row ? 'true' : undefined}
      data-satin-row-intrinsic={row ? undefined : 'true'}
      data-satin-toggle={row ? undefined : 'true'}
      data-satin-horizontal-drag={!row && !disabled ? 'both' : undefined}
      data-checked={checked}
      onPointerDown={begin}
      onPress={() => {
        onChange(!checked)
      }}
    >
      {row ? (
        <>
          <span data-satin-row-leading="true">{leading}</span>
          {subtitle === undefined ? (
            <span id={labelId} data-satin-row-label="true">
              <span data-satin-row-text="true">{label}</span>
            </span>
          ) : (
            <span data-satin-row-label="true">
              <RowLabelBody titleId={labelId} detailId={subtitleId} detail={subtitle}>
                {label}
              </RowLabelBody>
            </span>
          )}
          <span data-satin-row-trailing="true">
            <span
              data-satin-toggle="true"
              data-checked={checked}
              data-satin-horizontal-drag={!disabled ? 'both' : undefined}
            >
              {switchVisual}
            </span>
          </span>
        </>
      ) : (
        switchVisual
      )}
    </SensoryButton>
  )
}
