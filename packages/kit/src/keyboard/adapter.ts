import { lagMark, lagTraceEnabled } from '../glass/webgpu/lagTrace.ts'
import { SCROLL_PRESS_SLOP_PX } from '../scroll/pressOwnership.ts'
import { useSyncExternalStore } from 'react'
import {
  defaultSoftwareKeyboardHeight,
  isPlausibleKeyboardHeight,
  readMeasuredKeyboardHeight,
  rememberKeyboardHeight,
  SOFTWARE_KEYBOARD_MIN_HEIGHT,
} from './expectedKeyboard.ts'
import { createKeyboardAvoidance } from './avoidance.ts'
import { keyboardGeometry, type KeyboardGeometry } from './geometry.ts'
import { installModalTapFocus } from './modalTapFocus.ts'
import {
  KEYBOARD_DURATION_MS,
  KEYBOARD_HIDE_LEAD_MS,
  KEYBOARD_REPORT_HIDE_LEAD_MS,
  KEYBOARD_REPORT_SHOW_LEAD_MS,
  KEYBOARD_SHOW_LEAD_MS,
  keyboardEasing,
} from './motion.ts'

/** Live keyboard geometry and its owning presentation. Values are in points. */
export type KeyboardMetrics = Readonly<
  KeyboardGeometry & {
    presentation: Element | null
    /** The geometry is the last measured keyboard's, used while awaiting a usable WebKit report. */
    anticipated: boolean
    /**
     * The software keyboard height to plan for at this window size: the tallest one WebKit has
     * reported (in an earlier launch too), or the device default before any report.
     */
    expectedHeight: number
  }
>
/** A tap focus waits this long for its keyboard before the anticipated geometry is withdrawn. */
const KEYBOARD_ANTICIPATION_MS = 600
/** Wait for viewport and layout resize events to agree before revealing again. */
const VIEWPORT_SETTLE_MS = 120
/**
 * After a focus or a keyboard change the caret line is measured for this long, so that the reveal
 * in the next frame sees an editor that resized for the keyboard (TextEditor does).
 */
const CARET_REVEAL_MS = 400
/** Only a software keyboard is anticipated (the iPad hardware-keyboard bar is 55-70 pt). */
const ANTICIPATED_KEYBOARD_MIN_HEIGHT = SOFTWARE_KEYBOARD_MIN_HEIGHT
const empty: KeyboardMetrics = {
  presentation: null,
  anticipated: false,
  expectedHeight: 0,
  height: 0,
  visible: false,
  viewportHeight: 0,
  offsetTop: 0,
  layoutHeight: 0,
}
let snapshot = empty
let layoutWidth = 0
const listeners = new Set<() => void>()
/** A keyboard height change, and how far into the keyboard's own curve the page starts it. */
export type KeyboardMotion = Readonly<{ height: number; leadMs: number }>
const motionListeners = new Set<(motion: KeyboardMotion) => void>()
/**
 * Called synchronously whenever the keyboard height the page lays out for changes, in the same
 * task as the report, so a carrier can start its compositor motion in the one frame WebKit draws
 * before the keyboard travels. Returns the unsubscribe function.
 */
export function onKeyboardMotion(listener: (motion: KeyboardMotion) => void) {
  motionListeners.add(listener)
  return () => {
    motionListeners.delete(listener)
  }
}
/** The keyboard height the page currently lays out for (0 when hidden). */
export function currentKeyboardHeight() {
  return snapshot.height
}
/** Longest a keyboard reader waits for the carrier's frame before it reads the new geometry. */
const READERS_FRAME_DEADLINE_MS = 100
/** Keyboard readers (the hooks below). Internal: tests observe when readers are notified. */
export const subscribeKeyboardMetrics = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
/** Keep framework chrome on the pre-focus layout while WebKit pans/resizes its window. */
export function readKeyboardLayoutHeight(width: number, fallback: number) {
  return snapshot.visible && width === layoutWidth ? snapshot.layoutHeight : fallback
}
const subscribeWithoutKeyboard = () => () => {}
/** The software keyboard's live geometry. Most apps never need it: Satin keeps focused fields,
 * bottom insets and bars above the keyboard. */
export function useKeyboardMetrics() {
  return useObservedKeyboardMetrics(true)
}

/** Internal presentation readers can suspend observation while absent. */
export function useObservedKeyboardMetrics(enabled: boolean) {
  return useSyncExternalStore(
    enabled ? subscribeKeyboardMetrics : subscribeWithoutKeyboard,
    () => snapshot,
    () => empty,
  )
}
export function editable(
  target: EventTarget | null,
): target is HTMLInputElement | HTMLTextAreaElement {
  const textControl =
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      ['text', 'password', 'email', 'url', 'tel', 'search', 'number'].includes(target.type))
  return textControl && !target.disabled && !target.readOnly
}
/**
 * The elements that read the keyboard's geometry properties (styles.css). The properties are
 * registered and not inherited, so a write restyles only the element written. Inherited, a write on
 * the root restyled every element of a long chat (22,279 elements, 142-287 ms per write on iPad)
 * right after WebKit's keyboard report, and the keyboard then travelled over a frozen page.
 */
const KEYBOARD_PROPERTY_READERS = [
  "[data-satin-status-band-source='scene']",
  '.satin-presentation:is([data-satin-presentation="alert"], [data-satin-presentation="sheet"])',
  "[data-satin-bottom-boundary='root']",
  "[data-satin-navigation-toolbar-slot='bottom']",
  "[data-satin-search-placement='toolbar']",
].join(', ')
let keyboardProperties: Record<string, string> = {}
const keyboardReaders = new WeakMap<HTMLElement, Set<HTMLElement>>()

function collectKeyboardReaders(root: HTMLElement, records?: MutationRecord[]) {
  let readers = keyboardReaders.get(root)
  if (!readers) {
    readers = new Set(root.querySelectorAll?.<HTMLElement>(KEYBOARD_PROPERTY_READERS) ?? [])
    keyboardReaders.set(root, readers)
  }
  for (const record of records ?? []) {
    for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches(KEYBOARD_PROPERTY_READERS)) readers.add(node)
      for (const reader of node.querySelectorAll<HTMLElement>(KEYBOARD_PROPERTY_READERS))
        readers.add(reader)
    }
    if (record.type === 'attributes' && record.target instanceof HTMLElement) {
      if (record.target.matches(KEYBOARD_PROPERTY_READERS)) readers.add(record.target)
      else readers.delete(record.target)
    }
  }
  for (const reader of readers) if (!root.contains(reader)) readers.delete(reader)
  return readers
}

/** Write keyboard properties on the root and on each element that reads them. */
function writeKeyboardProperties(root: HTMLElement, values: Record<string, string>) {
  keyboardProperties = { ...keyboardProperties, ...values }
  copyKeyboardProperties(root, values)
}

/** Give readers mounted since the last write (a new screen, a sheet) the current values. */
function copyKeyboardProperties(root: HTMLElement, values = keyboardProperties) {
  const readers = collectKeyboardReaders(root)
  for (const element of [root, ...readers]) {
    // An unchanged inline value is not a style change.
    for (const [name, value] of Object.entries(values)) {
      if (element.style.getPropertyValue?.(name) !== value) element.style.setProperty(name, value)
    }
  }
}

/** The installed adapter's navigation hook (one adapter per SatinRoot; the last one installed). */
let beforeNavigation: (() => void) | null = null
/**
 * Called by the navigation store before a push, pop, replace or back swipe starts (before it
 * captures scroll state or publishes the transition): ends editing and puts any keyboard room and
 * screen-layer lift back now, so no transition frame, scroll snapshot or navigation-glass capture
 * sees a lifted offset, and nothing moves mid-slide.
 */
export function prepareKeyboardForNavigation() {
  beforeNavigation?.()
}
export function dismissKeyboard() {
  if (editable(document.activeElement)) document.activeElement.blur()
}

/** One adapter per SatinRoot. Owns viewport listeners, never cancels editing gestures. */
/**
 * Tapping a control keeps the editor's keyboard, so button presses preserve the first
 * responder: a hand-rolled composer's Send must not close the keyboard (iPad, October 12, 0/5 kept).
 * Controls that leave the editor end editing themselves: navigation and tab switches dismiss
 * explicitly, and a presented modal takes focus through showModal().
 */
const KEYBOARD_KEEPING_CONTROLS =
  'button, a[href], summary, [role="button"], [role="link"], [role="switch"], [role="checkbox"]'

export function installKeyboardAdapter(root: HTMLElement) {
  collectKeyboardReaders(root)
  const viewport = window.visualViewport
  let frame = 0
  let engaged = false
  let width = window.innerWidth
  let layoutHeight = window.innerHeight
  const avoidance = createKeyboardAvoidance()
  let revealFrame = 0
  // The editor and keyboard the last reveal was for; a change re-measures the caret line.
  let revealedFor = ''
  let caretRevealUntil = -Infinity
  let revealedEditor: Element | null = null
  let observedPresentation: Element | null = null
  let motionObserver: MutationObserver | undefined
  let pointer:
    { x: number; y: number; target: EventTarget | null; editor: Element | null } | undefined
  // The software keyboard's height as last measured at this window size, and the tap focus
  // that is waiting for that keyboard to be reported.
  let measured: { height: number; width: number; layoutHeight: number } | null = null
  let anticipation: { editor: Element; until: number } | null = null
  let anticipationTimer: ReturnType<typeof setTimeout> | undefined
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  let resizing = false
  // When WebKit last reported the visual viewport: the system keyboard starts moving then.
  let reportedAt = performance.now()
  // The last reported keyboard motion, while its curve can still be retimed.
  let lastMotion: { height: number; reportLead: number; reportedAt: number; at: number } | null =
    null
  let motionTimer: ReturnType<typeof setTimeout> | undefined
  // The visual viewport's width at the last report: a rotation changes it.
  let viewportWidth = viewport?.width ?? window.innerWidth
  let readersFrame = 0
  let readersTimer: ReturnType<typeof setTimeout> | undefined
  const notifyReaders = () => {
    cancelAnimationFrame(readersFrame)
    clearTimeout(readersTimer)
    readersFrame = 0
    readersTimer = undefined
    for (const listener of listeners) listener()
  }
  const notifyAfterNextFrame = () => {
    if (readersFrame || readersTimer) return
    readersFrame = requestAnimationFrame(() => {
      readersFrame = 0
      clearTimeout(readersTimer)
      readersTimer = setTimeout(notifyReaders, 0)
    })
    // A hidden page draws no frame.
    readersTimer = setTimeout(notifyReaders, READERS_FRAME_DEADLINE_MS)
  }
  // The tallest software keyboard reported at this window size, in this launch or an earlier one.
  let tallest = { width: 0, layoutHeight: 0, height: null as number | null }
  const tallestMeasured = () => {
    if (tallest.width !== width || tallest.layoutHeight !== layoutHeight) {
      const stored = readMeasuredKeyboardHeight(width, layoutHeight)
      tallest = { width, layoutHeight, height: stored }
    }
    return tallest.height
  }
  const releaseSurface = () => {
    cancelAnimationFrame(revealFrame)
    revealFrame = 0
    avoidance.releaseAll()
  }
  const navigationMoving = () =>
    root.querySelector('[data-satin-transition-active="true"]') !== null
  const suspended = () => document.visibilityState === 'hidden' || navigationMoving() || resizing
  const resetReveal = () => {
    releaseSurface()
    revealedFor = ''
    revealedEditor = null
  }
  const update = () => {
    const tracing = lagTraceEnabled()
    let phaseStarted = tracing ? performance.now() : 0
    const phase = (name: string) => {
      if (!tracing) return
      const now = performance.now()
      lagMark({
        stage: `keyboard-update-${name}`,
        at: performance.timeOrigin + phaseStarted,
        ms: now - phaseStarted,
      })
      phaseStarted = now
    }
    cancelAnimationFrame(frame)
    frame = 0
    if (suspended()) {
      resetReveal()
      return
    }
    const active =
      editable(document.activeElement) && root.contains(document.activeElement)
        ? document.activeElement
        : null
    const windowWidth = window.innerWidth
    const windowHeight = window.innerHeight
    const rotated = width !== windowWidth
    if (rotated || !engaged) {
      width = windowWidth
      layoutHeight = windowHeight
    }
    // A translucent standalone viewport can grow after focus/launch. Keep
    // keyboard shrinkage from moving chrome, but accept a larger layout frame.
    else layoutHeight = Math.max(layoutHeight, windowHeight)
    engaged ||= Boolean(active)
    // Normalize the document before sampling its visual pan. Writing the old
    // offset and then resetting scroll leaves fixed frames compensated for a
    // pan that WebKit has already removed, until its next viewport event.
    if (engaged && (window.scrollX || window.scrollY)) window.scrollTo(0, 0)
    const viewportHeight = viewport?.height ?? windowHeight
    const viewportOffset = viewport?.offsetTop ?? 0
    const viewportScale = viewport?.scale ?? 1
    let reported = keyboardGeometry(
      layoutHeight,
      viewportHeight,
      viewportOffset,
      viewportScale,
      engaged,
    )
    // WebKit can briefly report a viewport much smaller than the native keyboard
    // leaves available (iPad: 310 pt instead of 967 in a 1334 pt layout). Never
    // publish or remember that occlusion. Retain visible geometry; after a resume
    // from hidden, recover only a measured keyboard for this exact window size.
    let recoveringMeasuredGeometry = false
    if (!isPlausibleKeyboardHeight(width, layoutHeight, reported.height)) {
      if (snapshot.visible && layoutWidth === width && snapshot.layoutHeight === layoutHeight)
        return
      const rememberedHeight =
        measured?.width === width && measured.layoutHeight === layoutHeight
          ? measured.height
          : tallestMeasured()
      if (!active || rememberedHeight === null) return
      reported = keyboardGeometry(layoutHeight, layoutHeight - rememberedHeight, 0, 1, true)
      recoveringMeasuredGeometry = true
    }
    if (reported.visible) {
      anticipation = null
      if (reported.height >= ANTICIPATED_KEYBOARD_MIN_HEIGHT)
        measured = { height: reported.height, width, layoutHeight }
      if (
        reported.height >= SOFTWARE_KEYBOARD_MIN_HEIGHT &&
        reported.height > (tallestMeasured() ?? 0)
      ) {
        tallest.height = reported.height
        rememberKeyboardHeight(width, layoutHeight, reported.height)
      }
    } else if (
      anticipation &&
      (active !== anticipation.editor || performance.now() >= anticipation.until)
    ) {
      // Still editing and no keyboard came (a hardware keyboard): stop expecting one.
      if (active === anticipation.editor) measured = null
      anticipation = null
    }
    const anticipated =
      recoveringMeasuredGeometry ||
      (anticipation !== null &&
        measured !== null &&
        measured.width === width &&
        measured.layoutHeight === layoutHeight)
    const geometry: KeyboardGeometry =
      anticipated && measured
        ? {
            height: measured.height,
            visible: true,
            viewportHeight: layoutHeight - measured.height,
            offsetTop: 0,
            layoutHeight,
          }
        : reported
    const next: KeyboardMetrics = {
      ...geometry,
      anticipated,
      expectedHeight: tallestMeasured() ?? defaultSoftwareKeyboardHeight(width, layoutHeight),
      presentation: geometry.visible
        ? (active?.closest('dialog[open]') ?? snapshot.presentation)
        : null,
    }
    if (!active && next.height === 0) engaged = false
    layoutWidth = width
    phase('geometry')
    let motion: KeyboardMotion | undefined
    if (next.height !== snapshot.height) {
      // The bottom inset chain follows the keyboard on its own curve (styles.css). A reported
      // keyboard is already moving: start that far into the curve. An anticipated one is not.
      const rises = next.height > snapshot.height
      const reportLead = rises ? KEYBOARD_SHOW_LEAD_MS : KEYBOARD_HIDE_LEAD_MS
      const lead = anticipated ? 0 : reportLead + performance.now() - reportedAt
      // The carrier anchors to the report's stamp, not to the frame the page draws next.
      const stampLead = rises ? KEYBOARD_REPORT_SHOW_LEAD_MS : KEYBOARD_REPORT_HIDE_LEAD_MS
      motion = {
        height: next.height,
        leadMs: anticipated ? 0 : stampLead + performance.now() - reportedAt,
      }
      lastMotion = anticipated
        ? null
        : { height: next.height, reportLead: stampLead, reportedAt, at: performance.now() }
      writeKeyboardProperties(root, { '--satin-keyboard-phase': `${-Math.round(lead)}ms` })
      // The scene is in motion until the inset arrives: glass samples its installed planes
      // instead of capturing a moving page (glass/webgpu/production.ts).
      root.dataset.satinKeyboardMoving = 'true'
      clearTimeout(motionTimer)
      motionTimer = setTimeout(
        () => delete root.dataset.satinKeyboardMoving,
        Math.max(0, KEYBOARD_DURATION_MS - lead) + 34,
      )
    }
    writeKeyboardProperties(root, {
      '--satin-keyboard-height': `${next.height}px`,
      '--satin-keyboard-viewport-height': `${next.viewportHeight}px`,
      '--satin-keyboard-offset-top': `${next.offsetTop}px`,
      '--satin-keyboard-layout-height': `${next.layoutHeight}px`,
    })
    root.dataset.satinKeyboard = next.visible ? 'visible' : 'hidden'
    const carried = motion !== undefined && !anticipated && motionListeners.size > 0
    phase('properties')
    if (motion) for (const listener of motionListeners) listener(motion)
    phase('carrier')
    if (
      Object.keys(next).some(
        key => next[key as keyof KeyboardMetrics] !== snapshot[key as keyof KeyboardMetrics],
      )
    ) {
      snapshot = next
      // A reported keyboard is already moving, and the carrier's compositor motion starts only
      // when this page draws its next frame. Keyboard readers re-render a whole screen (a long
      // chat: ~110 ms on iPad); in this task they would hold that frame back while the keyboard
      // travels. They read the new geometry in the task after it, as the carrier moves.
      if (carried) notifyAfterNextFrame()
      else notifyReaders()
    }
    phase('readers')
    const presentation = active?.closest('dialog[open]') ?? null
    if (observedPresentation !== presentation) {
      motionObserver?.disconnect()
      observedPresentation = presentation
      motionObserver =
        presentation && typeof MutationObserver !== 'undefined'
          ? new MutationObserver(() => schedule())
          : undefined
      if (presentation)
        motionObserver?.observe(presentation, {
          attributes: true,
          attributeFilter: ['data-satin-presentation-moving'],
        })
    }
    if (!active) {
      releaseSurface()
      revealedFor = ''
      revealedEditor = null
      return
    }
    // Measured on the iPad: the keyboard arrives 460 pt tall and grows to 498 pt 13-15 ms later
    // (the predictive bar). A caret that is visible above the first and covered by the second
    // makes WebKit scroll the document, so the field is revealed above the tallest keyboard
    // measured at this window size, not only the one on screen.
    const softwareKeyboard = next.visible && next.height >= SOFTWARE_KEYBOARD_MIN_HEIGHT
    const clearance = {
      offsetTop: next.offsetTop,
      bottom: softwareKeyboard
        ? layoutHeight - Math.max(next.height, tallestMeasured() ?? 0)
        : next.viewportHeight,
    }
    const revealKey = `${next.visible}:${next.height}:${layoutHeight}`
    if (revealedFor !== revealKey || revealedEditor !== active) {
      revealedFor = revealKey
      revealedEditor = active
      caretRevealUntil = performance.now() + CARET_REVEAL_MS
    }
    const reveal = () => {
      revealFrame = 0
      if (suspended()) {
        resetReveal()
        return
      }
      if (!snapshot.visible) {
        resetReveal()
        return
      }
      if (
        document.activeElement !== active ||
        presentation?.hasAttribute('data-satin-presentation-moving')
      )
        return
      // No keyboard on screen (rotated, backgrounded, hardware keyboard, hidden by its key): the
      // room and the lift are put back while the field stays focused, and applied again on return.
      const keyboardShown = snapshot.visible && document.visibilityState !== 'hidden'
      avoidance.reveal(
        active,
        presentation,
        clearance,
        performance.now() < caretRevealUntil,
        keyboardShown,
      )
    }
    cancelAnimationFrame(revealFrame)
    // Keyboard subscribers can move both sheets and page fields in the next React layout
    // pass. Reveal after that owner commits: lifting from the old field rect first would
    // apply avoidance twice for one painted frame. Focus and transition guards are checked
    // again in reveal, without polling throughout the animation.
    if (presentation || performance.now() < caretRevealUntil)
      revealFrame = requestAnimationFrame(reveal)
  }
  const schedule = () => {
    cancelAnimationFrame(frame)
    if (document.visibilityState !== 'hidden') frame = requestAnimationFrame(update)
  }
  const settleResize = () => {
    resizing = true
    cancelAnimationFrame(frame)
    resetReveal()
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      resizing = false
      schedule()
    }, VIEWPORT_SETTLE_MS)
  }
  const viewportResize = (event: Event) => {
    // WebKit stamps the visual viewport's report when the keyboard starts to move, but a busy page
    // dispatches it after the window's resize, whose stamp is the late dispatch (~240 ms on an
    // iPad hide). The motion starts from the first report; a later visual viewport report of the
    // same change with an earlier stamp moves it back onto the keyboard's clock.
    const started = lastMotion
    const earlier =
      started !== null &&
      event.currentTarget === viewport &&
      event.timeStamp < started.reportedAt - 1 &&
      performance.now() - started.at < KEYBOARD_DURATION_MS
    reportedAt = event.timeStamp
    // Viewport growth can precede innerWidth during rotation, so growth while an editor is still
    // focused waits for the geometry to settle. One growth is not a rotation: the viewport back at
    // exactly the layout height at the same width is the keyboard leaving (its dismiss key keeps
    // the field focused). It applies now, so the composer leaves with the keyboard, not 120 ms
    // after it. Keyboard arrival, and the keyboard leaving after editing ended, apply now too.
    const editing = editable(document.activeElement) && root.contains(document.activeElement)
    const dismissed =
      editing &&
      snapshot.visible &&
      viewport !== null &&
      viewport.width === viewportWidth &&
      Math.abs(viewport.height - layoutHeight) <= 1
    viewportWidth = viewport?.width ?? viewportWidth
    if (
      resizing ||
      (!dismissed &&
        (window.innerWidth !== width ||
          (editing && viewport && viewport.height > snapshot.viewportHeight)))
    )
      settleResize()
    else update()
    if (earlier && lastMotion === started && !resizing && snapshot.height === started.height) {
      started.reportedAt = event.timeStamp
      const motion = {
        height: started.height,
        leadMs: started.reportLead + performance.now() - event.timeStamp,
      }
      for (const listener of motionListeners) listener(motion)
    }
  }
  // Measured on the iPad: WebKit reports the keyboard 100-120 ms after a tap focus, and scrolls
  // the document for 300 ms when the keyboard then covers the field (11-15 scroll events, the
  // page 2.5-3 pt off in 9-12 frames). An alert that leaves for its keyboard position at the tap
  // is clear of the keyboard when it arrives: no scroll event and no moved frame.
  const anticipate = (editor: Element) => {
    if (snapshot.visible || !measured || measured.width !== window.innerWidth) return
    if (editor.closest('dialog[open]')?.getAttribute('data-satin-presentation') !== 'alert') return
    anticipation = { editor, until: performance.now() + KEYBOARD_ANTICIPATION_MS }
    engaged = true
    clearTimeout(anticipationTimer)
    anticipationTimer = setTimeout(schedule, KEYBOARD_ANTICIPATION_MS)
    update()
  }
  // Every editor in the app, on a page as well as in an alert or a sheet (keyboard construction update).
  const navigationHook = () => {
    releaseSurface()
    revealedFor = ''
    revealedEditor = null
    // Navigation ends editing, when a screen is pushed or popped.
    if (editable(document.activeElement) && root.contains(document.activeElement))
      document.activeElement.blur()
  }
  beforeNavigation = navigationHook
  const releaseTapFocus = installModalTapFocus(
    root,
    editable,
    anticipate,
    () => snapshot.visible,
    editor => editor.isConnected && root.contains(editor),
  )
  const focus = (event: FocusEvent) => {
    if (editable(event.target)) engaged = true
    schedule()
  }
  const down = (event: PointerEvent) => {
    pointer = {
      x: event.clientX,
      y: event.clientY,
      target: event.target,
      editor: document.activeElement,
    }
  }
  const up = (event: PointerEvent) => {
    if (
      !pointer ||
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= SCROLL_PRESS_SLOP_PX
    ) {
      pointer = undefined
      return
    }
    const target = pointer.target instanceof Element ? pointer.target : null
    const editor = pointer.editor
    pointer = undefined
    if (
      !target ||
      document.activeElement !== editor ||
      target.closest(
        'input, textarea, label, [contenteditable], [data-satin-keep-keyboard], [data-satin-inset-accessory]',
      ) ||
      target.closest(KEYBOARD_KEEPING_CONTROLS)
    )
      return
    // A button may have mounted and focused another editor before this bubbling pointerup.
    // Tap-away dismissal belongs only to the editor that was active when the press began.
    // Native callouts/selection live outside this root; they never enter here.
    dismissKeyboard()
  }
  root.addEventListener('focusin', focus)
  root.addEventListener('focusout', schedule)
  root.addEventListener('input', schedule)
  const cancelPointer = () => {
    pointer = undefined
  }
  root.addEventListener('pointercancel', cancelPointer, { passive: true })
  root.addEventListener('pointerdown', down, { passive: true })
  root.addEventListener('pointerup', up, { passive: true })
  // Document focus scrolling can arrive after WebKit's final viewport event.
  // This listens only to the window; declared scroll surfaces retain ownership.
  window.addEventListener('scroll', update)
  window.addEventListener('resize', viewportResize)
  window.addEventListener('pageshow', schedule)
  root.style.setProperty('--satin-keyboard-easing', keyboardEasing())
  root.style.setProperty('--satin-keyboard-duration', `${KEYBOARD_DURATION_MS}ms`)
  const visibilityChanged = () => {
    // A hidden document can suspend animation frames before the scheduled update runs.
    // Restore owned geometry in this event, before the system snapshots the backgrounded app.
    if (document.visibilityState === 'hidden') {
      cancelAnimationFrame(frame)
      frame = 0
      resetReveal()
      return
    }
    schedule()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  viewport?.addEventListener('resize', viewportResize)
  viewport?.addEventListener('scroll', update)
  // Safe-area changes can precede innerHeight/visualViewport events on launch.
  const geometryObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
  for (const selector of ['[data-satin-safe-area-sensor]', '[data-satin-viewport-ruler="lvh"]']) {
    const element = document.querySelector?.(selector)
    if (element) geometryObserver?.observe(element)
  }
  // Observe the navigator's committed lifecycle, including held/cancelling back swipes.
  // Incoming layout-effect autofocus may precede this callback; every reveal checks the flag too.
  let wasMoving = navigationMoving()
  const navigationObserver = new MutationObserver(records => {
    collectKeyboardReaders(root, records)
    const mounted = records.some(record =>
      [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE),
    )
    if (mounted && snapshot.visible) copyKeyboardProperties(root)
    const moving = navigationMoving()
    if (moving === wasMoving) return
    wasMoving = moving
    if (moving) {
      cancelAnimationFrame(frame)
      resetReveal()
    } else schedule()
  })
  navigationObserver.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: [
      'data-satin-transition-active',
      'data-satin-bottom-boundary',
      'data-satin-status-band-source',
      'data-satin-presentation',
      'data-satin-navigation-toolbar-slot',
      'data-satin-search-placement',
    ],
    childList: true,
  })
  update()
  return () => {
    if (beforeNavigation === navigationHook) beforeNavigation = null
    releaseTapFocus()
    clearTimeout(anticipationTimer)
    clearTimeout(resizeTimer)
    clearTimeout(motionTimer)
    cancelAnimationFrame(readersFrame)
    clearTimeout(readersTimer)
    delete root.dataset.satinKeyboardMoving
    navigationObserver.disconnect()
    keyboardReaders.delete(root)
    geometryObserver?.disconnect()
    motionObserver?.disconnect()
    cancelAnimationFrame(frame)
    releaseSurface()
    root.removeEventListener('focusin', focus)
    root.removeEventListener('focusout', schedule)
    root.removeEventListener('input', schedule)
    root.removeEventListener('pointercancel', cancelPointer)
    root.removeEventListener('pointerdown', down)
    root.removeEventListener('pointerup', up)
    window.removeEventListener('scroll', update)
    window.removeEventListener('resize', viewportResize)
    window.removeEventListener('pageshow', schedule)
    document.removeEventListener('visibilitychange', visibilityChanged)
    viewport?.removeEventListener('resize', viewportResize)
    viewport?.removeEventListener('scroll', update)
    for (const name of [
      'height',
      'viewport-height',
      'offset-top',
      'layout-height',
      'phase',
      'easing',
      'duration',
    ])
      root.style.removeProperty(`--satin-keyboard-${name}`)
    delete root.dataset.satinKeyboard
    snapshot = empty
    for (const listener of listeners) listener()
  }
}

/**
 * - `immediately`: a drag on the surface ends editing.
 * - `interactively`: scrolling keeps the keyboard; a drag that reaches the keyboard ends editing.
 *   Native tracks the keyboard under the finger from there; WebKit's keyboard cannot follow a
 *   finger, so it leaves on its own curve (the bottom inset chain follows it).
 */
export type ScrollDismissesKeyboardMode = 'never' | 'immediately' | 'interactively'
export function installScrollKeyboardDismissal(
  surface: HTMLElement,
  mode: ScrollDismissesKeyboardMode,
) {
  let start: { x: number; y: number } | undefined
  // The editor in a bottom inset accessory edits with the scroll content its inset holds.
  const editsWith = (editor: Element) =>
    surface.contains(editor) ||
    editor.closest('[data-satin-safe-area-inset]')?.contains(surface) === true
  const down = (event: PointerEvent) => {
    start = { x: event.clientX, y: event.clientY }
  }
  const move = (event: PointerEvent) => {
    const editor = document.activeElement
    if (!start || mode === 'never' || !editable(editor) || !editsWith(editor)) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < SCROLL_PRESS_SLOP_PX) return
    // An inner editor keeps native caret/selection and internal scroll ownership.
    if (event.target instanceof Element && event.target.closest('[data-satin-role="text-input"]'))
      return
    if (mode === 'interactively') {
      const viewport = window.visualViewport
      const keyboardTop = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      if (event.clientY <= start.y || event.clientY < keyboardTop) return
    }
    dismissKeyboard()
    start = undefined
  }
  const touchStart = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (touch) start = { x: touch.clientX, y: touch.clientY }
  }
  const touchMove = (event: TouchEvent) => {
    const touch = event.touches[0]
    if (touch)
      move({ clientX: touch.clientX, clientY: touch.clientY, target: event.target } as PointerEvent)
  }
  const end = () => {
    start = undefined
  }
  surface.addEventListener('touchstart', touchStart, { passive: true })
  surface.addEventListener('touchmove', touchMove, { passive: true })
  surface.addEventListener('touchend', end, { passive: true })
  surface.addEventListener('touchcancel', end, { passive: true })
  surface.addEventListener('pointerdown', down, { passive: true })
  surface.addEventListener('pointermove', move, { passive: true })
  surface.addEventListener('pointerup', end, { passive: true })

  return () => {
    surface.removeEventListener('pointerdown', down)
    surface.removeEventListener('pointermove', move)
    surface.removeEventListener('pointerup', end)
    surface.removeEventListener('touchstart', touchStart)
    surface.removeEventListener('touchmove', touchMove)
    surface.removeEventListener('touchend', end)
    surface.removeEventListener('touchcancel', end)
  }
}
