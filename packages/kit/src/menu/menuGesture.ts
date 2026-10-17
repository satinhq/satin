import { ownPhysicalContact, MENU_CONTACT_CLICK_WINDOW_MS } from '../press/contactReceipt.ts'
import {
  menuPull,
  menuReturn,
  MENU_STRAIN,
  MENU_STRAIN_RESPONSE_MS,
  MENU_TRIGGER_FOLLOW,
} from '../glass/contactPhysics.ts'

export {
  menuPull,
  menuReturn,
  MENU_RELEASE_SPRING,
  MENU_STRAIN_RESPONSE_MS,
} from '../glass/contactPhysics.ts'
export type MenuGestureFrame = Readonly<{
  x: number
  y: number
  scaleX: number
  scaleY: number
  highlightY: number
  highlightOpacity: number
  contact: number
  fingerX: number
  fingerY: number
  trigger: boolean
  tapFeedback: boolean
}>

export const MENU_GESTURE_REST: MenuGestureFrame = Object.freeze({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  highlightY: 0,
  highlightOpacity: 0,
  contact: 0,
  fingerX: 0,
  fingerY: 0,
  trigger: false,
  tapFeedback: false,
})

// Fresh reference fit native tap frames retain the peak for 18 ms (light) / 20 ms
// (dark) after the visible UP marker. Keep this feedback interval separate
// from the unchanged collapse and mechanical spring curves.
export const MENU_TAP_FEEDBACK_MS = 20

export type MenuPanelBounds = Readonly<{ left: number; top: number; width: number; height: number }>

/** Fit to axis controls plus the held diagonal, with its origin in the panel's
 * resting coordinate space. Over-pull begins outside the panel; the anchored
 * right edge couples vertical stretch to horizontal displacement. */
export function menuPanelPull(
  x: number,
  y: number,
  startX: number,
  startY: number,
  bounds: MenuPanelBounds,
) {
  const dx = x - startX,
    dy = y - startY
  const horizontal =
    dx < 0
      ? 0.008 * Math.max(dx, bounds.left - startX) +
        menuPull(Math.min(0, x - bounds.left), 0.075, 1000)
      : 0.004 * dx
  const vertical =
    dy >= 0
      ? Math.min(2, 0.02 * dy) +
        menuPull(Math.max(0, y - bounds.top - bounds.height - 27), 0.06, 2500)
      : -Math.min(1, 0.02 * -dy)
  const widthFromY = dy >= 0 ? -0.83 * vertical : -Math.min(3, 0.04 * -dy)
  const width = widthFromY - Math.min(0, horizontal) * 0.667
  const height =
    0.635 * Math.max(0, vertical) +
    Math.min(0, horizontal) * 0.44 +
    (dy < 0 ? Math.min(2, 0.02 * -dy) : 0)
  return {
    x: horizontal - widthFromY / 2,
    y: vertical + Math.min(0, horizontal) * 0.22,
    scaleX: 1 + width / bounds.width,
    scaleY: 1 + height / bounds.height,
  }
}

/** Shared strain projection for presentation and backing-envelope allocation. */
export function applyMenuStrain(
  pull: ReturnType<typeof menuPanelPull>,
  velocity: number,
  bounds: MenuPanelBounds,
) {
  pull.x += velocity * MENU_STRAIN.leadXSeconds
  pull.y += velocity * MENU_STRAIN.leadYSeconds
  pull.scaleX += (velocity * -MENU_STRAIN.narrowSeconds) / bounds.width
  pull.scaleY += (velocity * MENU_STRAIN.stretchSeconds) / bounds.height
  return pull
}

const MENU_HIGHLIGHT_DELAY_MS = 166.91512626763915

export function menuHighlightAttack(milliseconds: number) {
  const t = Math.max(0, Math.min(1, (milliseconds - MENU_HIGHLIGHT_DELAY_MS) / 316.04407368774224))
  return 1 - (1 - t) ** 3
}

// Unit-mass fit to 153 original native frames across long-down, left and
// diagonal releases. Contour RMSE .290 pt, maximum residual 1.049 pt.

// Independent fits to the closed native trigger: 105 press frames and 26
// release frames. Do not borrow the open panel's much softer return.
function springRemainder(milliseconds: number, stiffness: number, damping: number, delay: number) {
  const t = Math.max(0, milliseconds - delay) / 1000
  const a = damping / 2,
    w = Math.sqrt(stiffness - a * a)
  return Math.exp(-a * t) * (Math.cos(w * t) + (a / w) * Math.sin(w * t))
}

export function menuTriggerPress(milliseconds: number) {
  const scale =
    1 +
    (72 / 58 - 1) *
      (1 - springRemainder(milliseconds, 555.7639798282481, 30.18620920465069, 12.50856136753024))
  const t = Math.max(0, milliseconds / 1000 + 0.008672822546216112)
  const luminance =
    30 +
    53 * (1 - Math.exp(-t / 0.02509830487508512)) +
    37.78055039856789 * (t / 0.11744027949267473) * Math.exp(1 - t / 0.11744027949267473)
  return { scale, contact: Math.max(0, (luminance - 30) / 225) }
}

type MenuPointer = {
  id: number
  owner: HTMLElement
  x: number
  y: number
  startX: number
  startY: number
  started: number
  trigger: boolean
  moved: boolean
  opened: boolean
  selected: number
  highlightStarted: number
  samples: { at: number; y: number }[]
  velocityY: number
  paintedAt: number
  triggerX: number
  triggerY: number
}

export type MenuGestureMotion = Readonly<{
  startedAt: number
  stepMilliseconds: number
  frames: readonly MenuGestureFrame[]
}>

type ContactLayout = {
  rect: { left: number; top: number }
  bounds: MenuPanelBounds
  index: number
  row?: { top: number }
  reduced: boolean
}

function sampleContact(
  p: MenuPointer,
  frame: MenuGestureFrame,
  now: number,
  layout: ContactLayout,
): MenuGestureFrame {
  const triggerOnly = p.trigger && !p.opened
  const bounds = layout.bounds
  const dx = p.x - p.startX,
    dy = p.y - p.startY
  const triggerUnmoved = p.trigger && dx === 0 && dy === 0
  const index = triggerOnly || triggerUnmoved ? -1 : layout.index
  if (index !== p.selected) {
    if (p.selected < 0) p.highlightStarted = now
    p.selected = index
  }
  const pull = menuPanelPull(p.x, p.y, p.startX, p.startY, bounds)
  const last = p.samples[p.samples.length - 1]
  const first = p.samples.find(sample => sample.at >= last.at - 100) ?? last
  const velocity =
    last.at > first.at
      ? ((last.y - first.y) / (last.at - first.at)) *
        1000 *
        Math.exp(-Math.max(0, now - last.at) / 60)
      : 0
  // Native slow/flick/stop controls fit a 109.8 ms strain response. This
  // follows velocity while held and relaxes when the finger stops.
  const deltaMs = Math.max(0, now - p.paintedAt)
  p.velocityY += (velocity - p.velocityY) * (1 - Math.exp(-deltaMs / MENU_STRAIN_RESPONSE_MS))
  p.paintedAt = now
  applyMenuStrain(pull, p.velocityY, bounds)
  const row = index < 0 ? undefined : layout.row
  const desiredY = row ? row.top - layout.rect.top : frame.highlightY
  // Row transition is deliberately continuous; no React update per move.
  const highlightY =
    frame.highlightOpacity > 0
      ? frame.highlightY +
        (desiredY - frame.highlightY) * (1 - Math.pow(0.55, deltaMs / (1000 / 60)))
      : desiredY
  const reduced = layout.reduced
  const triggerPress = menuTriggerPress(now - p.started)
  const { gainX, gainY, rangePt, responseMs } = MENU_TRIGGER_FOLLOW
  const follow = 1 - Math.exp(-deltaMs / responseMs)
  p.triggerX += (menuPull(dx, gainX, rangePt) - p.triggerX) * follow
  p.triggerY += (menuPull(dy, gainY, rangePt) - p.triggerY) * follow
  return {
    x: reduced ? 0 : triggerOnly ? p.triggerX : pull.x,
    y: reduced ? 0 : triggerOnly ? p.triggerY : pull.y,
    scaleX: reduced ? 1 : triggerOnly ? triggerPress.scale : pull.scaleX,
    scaleY: reduced ? 1 : triggerOnly ? triggerPress.scale : pull.scaleY,
    highlightY,
    highlightOpacity:
      index < 0
        ? frame.highlightOpacity * Math.pow(0.65, deltaMs / (1000 / 60))
        : menuHighlightAttack(now - p.highlightStarted),
    contact: triggerOnly
      ? triggerPress.contact
      : triggerUnmoved
        ? 0
        : Math.min(1, (now - p.started) / 80),
    fingerX: p.x - layout.rect.left,
    fingerY: p.y - layout.rect.top,
    trigger: triggerOnly,
    tapFeedback: false,
  }
}

function sampleRelease(
  release: { at: number; frame: MenuGestureFrame },
  now: number,
  reduced: boolean,
): MenuGestureFrame {
  const age = now - release.at
  const amount =
    reduced || age >= 850
      ? 0
      : release.frame.trigger
        ? springRemainder(age, 234.35261545407428, 12.550596897040716, 3.717170427566056)
        : menuReturn(age)
  const f = release.frame
  return amount === 0
    ? MENU_GESTURE_REST
    : {
        ...f,
        x: f.x * amount,
        y: f.y * amount,
        scaleX: 1 + (f.scaleX - 1) * amount,
        scaleY: 1 + (f.scaleY - 1) * amount,
        contact:
          f.contact *
          (f.trigger
            ? Math.exp(-age / 252.7362335100826)
            : Math.max(
                0,
                f.tapFeedback ? menuReturn(Math.max(0, age - MENU_TAP_FEEDBACK_MS)) : amount,
              )),
        highlightOpacity: 0,
      }
}

export type MenuGestureDecision = Readonly<{
  pointerId: number
  at: number
  reason:
    | 'accepted'
    | 'pointer-busy'
    | 'non-primary'
    | 'non-primary-button'
    | 'menu-closed'
    | 'pointercancel'
    | 'lostpointercapture'
    | 'host-cancel'
    | 'visibility-hidden'
    | 'window-blur'
    | 'disposed'
    | 'trigger-opened'
    | 'trigger-held-open'
    | 'trigger-drag-before-open'
    | 'release-outside-enabled-row'
    | 'selection-dispatched'
    | 'compatibility-click-suppressed'
    | 'capture-failed'
  row?: number
}>

type Options = {
  trigger: HTMLButtonElement
  panel: HTMLElement
  surface?: HTMLElement
  bounds?: () => MenuPanelBounds
  /** Stable resting aperture when the visual trigger itself is transformed. */
  triggerBounds?: () => MenuPanelBounds
  /** A retained renderer can sample with tick() before painting its frame. */
  autoSchedule?: boolean
  requestFrame?: () => void
  items: readonly HTMLButtonElement[]
  isOpen: () => boolean
  open: () => void
  select: (index: number) => void
  frame: (frame: MenuGestureFrame) => void
  /** Input-driven timeline for autonomous DOM presentation; tick remains GL-only. */
  motion?: (motion: MenuGestureMotion) => void
  reducedMotion: () => boolean
  decision?: (decision: MenuGestureDecision) => void
  observe?: (phase: 'down' | 'move' | 'up' | 'cancel', event: PointerEvent) => void
}

/** One pointer owns a menu session, including the trigger-to-panel handoff.
 * Native buttons retain their click/keyboard/assistive activation path. Hosts
 * must declare touch-action:none on these gesture owners, never the document.
 */
export function bindMenuGestures(options: Options) {
  const { trigger, panel, items } = options
  const surface = options.surface ?? panel
  let pointer: MenuPointer | undefined
  let frame = MENU_GESTURE_REST
  let release: { at: number; frame: MenuGestureFrame } | undefined
  let request = 0
  const contactOwner = {}
  let disposed = false
  const decide = (pointerId: number, reason: MenuGestureDecision['reason'], row?: number) =>
    options.decision?.({ pointerId, reason, row, at: performance.now() })
  const schedule = () => {
    if (disposed) return
    if (options.autoSchedule === false) options.requestFrame?.()
    else if (!request) request = requestAnimationFrame(paint)
  }
  const hit = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)
    // During presentation the retained trigger can still win DOM hit testing,
    // although native has already replaced that position with the first row.
    // Resolve only that overlap using the semantic row bounds, never an
    // unrelated element outside the menu.
    const triggerOverlap =
      options.isOpen() && (element === trigger || (element !== null && trigger.contains(element)))
    return items.findIndex(item => {
      if (item.disabled || item.getAttribute?.('aria-disabled') === 'true') return false
      if (item === element || (element && item.contains(element))) return true
      if (!triggerOverlap) return false
      const rect = item.getBoundingClientRect()
      return (
        x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
      )
    })
  }
  const readLayout = (p: MenuPointer): ContactLayout => {
    const rect = panel.getBoundingClientRect()
    const index = hit(p.x, p.y)
    return {
      rect,
      index,
      row: index < 0 ? undefined : items[index].getBoundingClientRect(),
      bounds: options.bounds?.() ?? {
        left: rect.left,
        top: rect.top - 10,
        width: rect.width,
        height: rect.height + 20,
      },
      reduced: options.reducedMotion(),
    }
  }
  // Bake the same measured laws into keyframes on input, never on the display
  // callback. Future input retargets the timeline; it is not predicted here.
  const publishMotion = (now: number) => {
    if (!options.motion || disposed) return
    const p = pointer ? { ...pointer, samples: [...pointer.samples] } : undefined
    const layout = p ? readLayout(p) : undefined
    const reduced = layout?.reduced ?? options.reducedMotion()
    const frames: MenuGestureFrame[] = [frame]
    let f = frame
    const stepMilliseconds = 1000 / 240
    for (let i = 1; i <= 240; i++) {
      const at = now + i * stepMilliseconds
      f =
        p && layout
          ? sampleContact(p, f, at, layout)
          : release
            ? sampleRelease(release, at, reduced)
            : MENU_GESTURE_REST
      frames.push(f)
    }
    options.motion({ startedAt: now, stepMilliseconds, frames })
  }
  function paint(now: number) {
    if (request) cancelAnimationFrame(request)
    request = 0
    if (pointer) {
      const p = pointer
      // Recognition starts the preserved host curve at 320 ms; the native
      // wide contour appears at 438-456 ms after held DOWN. Keep
      // this onset separate from the host's unchanged open/close sampler.
      if (p.trigger && !p.opened && !p.moved && now - p.started >= 320) {
        p.opened = true
        options.open()
        frame = sampleContact(p, frame, now, readLayout(p))
        publishMotion(now)
      }
      const previousIndex = p.selected
      frame = sampleContact(p, frame, now, readLayout(p))
      if (previousIndex !== p.selected) publishMotion(now)
      options.frame(frame)
      schedule()
    } else if (release) {
      frame = sampleRelease(release, now, options.reducedMotion())
      options.frame(frame)
      if (frame === MENU_GESTURE_REST) release = undefined
      else schedule()
    }
  }
  const rejectedContacts = new Set<number>()
  const down = (event: PointerEvent) => {
    if (pointer || !event.isPrimary || event.button !== 0) {
      if (options.isOpen() && event.button === 0) {
        rejectedContacts.add(event.pointerId)
        ownPhysicalContact(document, contactOwner, Infinity, { pointerId: event.pointerId })
      }
      decide(
        event.pointerId,
        pointer ? 'pointer-busy' : !event.isPrimary ? 'non-primary' : 'non-primary-button',
      )
      return
    }
    const rect = options.triggerBounds?.() ?? trigger.getBoundingClientRect()
    // The fading row can still cover the trigger in DOM hit testing on close.
    const overTrigger =
      event.clientX >= rect.left &&
      event.clientX < rect.left + rect.width &&
      event.clientY >= rect.top &&
      event.clientY < rect.top + rect.height
    const fromTrigger = !options.isOpen() && (event.currentTarget === trigger || overTrigger)
    if (!fromTrigger && !options.isOpen()) {
      decide(event.pointerId, 'menu-closed')
      return
    }
    const owner = event.currentTarget as HTMLElement
    options.observe?.('down', event)
    event.preventDefault()
    ownPhysicalContact(document, contactOwner, Infinity, {
      pointerId: event.pointerId,
      consumed: () => decide(event.pointerId, 'compatibility-click-suppressed'),
    })
    release = undefined
    pointer = {
      id: event.pointerId,
      owner,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      started: performance.now(),
      trigger: fromTrigger,
      moved: false,
      opened: !fromTrigger || options.isOpen(),
      selected: -1,
      highlightStarted: performance.now(),
      samples: [{ at: event.timeStamp, y: event.clientY }],
      velocityY: 0,
      paintedAt: performance.now(),
      triggerX: 0,
      triggerY: 0,
    }
    panel.dataset.input = 'pointer'
    trigger.dataset.input = 'pointer'
    decide(event.pointerId, 'accepted')
    try {
      owner.setPointerCapture(event.pointerId)
    } catch {
      decide(event.pointerId, 'capture-failed')
      finish(undefined, true, 'capture-failed')
      return
    }
    paint(performance.now())
    publishMotion(performance.now())
    schedule()
  }
  const move = (event: PointerEvent) => {
    if (pointer?.id !== event.pointerId) return
    if (event.type === 'pointermove') options.observe?.('move', event)
    pointer.x = event.clientX
    pointer.y = event.clientY
    if (
      event.type === 'pointermove' &&
      event.timeStamp > pointer.samples[pointer.samples.length - 1].at
    ) {
      pointer.samples.push({ at: event.timeStamp, y: event.clientY })
      if (pointer.samples.length > 32) pointer.samples.shift()
    }
    pointer.moved ||= Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 10
    if (event.type === 'pointermove') {
      paint(performance.now())
      publishMotion(performance.now())
    }
  }
  const finish = (
    event?: PointerEvent,
    cancel = true,
    reason: MenuGestureDecision['reason'] = 'host-cancel',
  ) => {
    if (!event) {
      for (const pointerId of rejectedContacts)
        ownPhysicalContact(document, contactOwner, MENU_CONTACT_CLICK_WINDOW_MS, { pointerId })
      rejectedContacts.clear()
    }
    if (event && rejectedContacts.delete(event.pointerId)) {
      ownPhysicalContact(document, contactOwner, MENU_CONTACT_CLICK_WINDOW_MS, {
        pointerId: event.pointerId,
      })
      return
    }
    if (!pointer || (event && pointer.id !== event.pointerId)) return
    if (event) options.observe?.(cancel ? 'cancel' : 'up', event)
    if (event) move(event)
    const p = pointer
    // Sample at UP even when the entire tap fell between two display callbacks.
    // Contact feedback must not depend on rAF having observed the finger down.
    if (event && !cancel) frame = sampleContact(p, frame, performance.now(), readLayout(p))
    pointer = undefined
    ownPhysicalContact(document, contactOwner, MENU_CONTACT_CLICK_WINDOW_MS, {
      pointerId: p.id,
      consumed: () => decide(p.id, 'compatibility-click-suppressed'),
    })
    release = { at: performance.now(), frame }
    if (p.owner.hasPointerCapture(p.id)) p.owner.releasePointerCapture(p.id)
    if (cancel)
      decide(
        p.id,
        event?.type === 'pointercancel'
          ? 'pointercancel'
          : event?.type === 'lostpointercapture'
            ? 'lostpointercapture'
            : reason,
      )
    if (!cancel) {
      if (p.trigger && !p.opened && !p.moved) {
        // Ordinary tap follows the host's existing open curve, unchanged.
        release = undefined
        frame = MENU_GESTURE_REST
        options.frame(frame)
        decide(p.id, 'trigger-opened')
        options.open()
      } else if (p.opened && (!p.trigger || p.x !== p.startX || p.y !== p.startY)) {
        const index = hit(p.x, p.y)
        if (index >= 0) {
          // Native short taps reach the contact-brightness peak at release,
          // before the held row pill can develop. The close curve then owns
          // the fade. Sample UP first so sub-frame taps retain the hit point.
          frame = {
            ...frame,
            contact: 1,
            highlightOpacity: 0,
            tapFeedback: performance.now() - p.started < MENU_HIGHLIGHT_DELAY_MS,
          }
          release = { at: performance.now(), frame }
          options.frame(frame)
          decide(p.id, 'selection-dispatched', index)
          // The host may synchronously bake a close timeline during selection.
          // Publish release state before crossing that callback boundary.
          publishMotion(performance.now())
          options.select(index)
        } else decide(p.id, 'release-outside-enabled-row')
      } else decide(p.id, p.opened ? 'trigger-held-open' : 'trigger-drag-before-open')
    }
    publishMotion(performance.now())
    schedule()
  }
  const up = (event: PointerEvent) => finish(event, false)
  const cancel = (event: PointerEvent) => finish(event)
  const abort = () => finish()
  const blur = () => finish(undefined, true, 'window-blur')
  const visibility = () => {
    if (document.hidden) finish(undefined, true, 'visibility-hidden')
  }
  const click = (event: MouseEvent) => {
    // WebKit can adjust a contact outside a row into a semantic button click.
    // That contact never belonged to this pointer controller. Preserve the
    // button's activation and give it the same release feedback as owned UP.
    const index = items.findIndex(
      item =>
        !item.disabled &&
        item.getAttribute?.('aria-disabled') !== 'true' &&
        event.target !== null &&
        item.contains(event.target as Node),
    )
    if (event.detail !== 0 && !event.defaultPrevented && index >= 0) {
      const rect = panel.getBoundingClientRect()
      frame = {
        ...MENU_GESTURE_REST,
        contact: 1,
        tapFeedback: true,
        fingerX: event.clientX - rect.left,
        fingerY: event.clientY - rect.top,
      }
      release = { at: performance.now(), frame }
      options.frame(frame)
      publishMotion(performance.now())
      schedule()
    }
  }
  // Installed WebKit still cancelled a padding-origin drag despite none on
  // the clipped owner. Claim contacts only on this semantic menu, including
  // the compatibility mouse click WebKit synthesizes after a two-finger lift.
  const touchStart = (event: TouchEvent) => {
    if (event.touches.length > 0 && event.cancelable) event.preventDefault()
  }
  const contextMenu = (event: Event) => event.preventDefault()
  for (const element of [trigger, surface]) {
    element.addEventListener('pointerdown', down)
    element.addEventListener('click', click, true)
    element.addEventListener('lostpointercapture', cancel)
    element.addEventListener('touchstart', touchStart, { passive: false })
    element.addEventListener('contextmenu', contextMenu)
  }
  document.addEventListener('pointermove', move)
  document.addEventListener('pointerup', up)
  document.addEventListener('pointercancel', cancel)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('blur', blur)
  return {
    tick(now: number) {
      if (!disposed) paint(now)
    },
    cancel: abort,
    dispose() {
      disposed = true
      finish(undefined, true, 'disposed')
      cancelAnimationFrame(request)
      for (const element of [trigger, surface]) {
        element.removeEventListener('pointerdown', down)
        element.removeEventListener('click', click, true)
        element.removeEventListener('lostpointercapture', cancel)
        element.removeEventListener('touchstart', touchStart)
        element.removeEventListener('contextmenu', contextMenu)
      }
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', cancel)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('blur', blur)
      options.frame(MENU_GESTURE_REST)
    },
  }
}
