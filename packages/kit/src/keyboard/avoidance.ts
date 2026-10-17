import { caretLineAt, type CaretLine } from './caretMirror.ts'
import { revealDelta } from './geometry.ts'

type Editor = HTMLInputElement | HTMLTextAreaElement
const SURFACE = '[data-satin-scroll-axis="vertical"]'
const SCREEN_LAYER = '[data-satin-navigation-motion-layer="true"]'
const NAVIGATION_CHROME = '[data-satin-navigation-chrome="true"]'
/** Space kept between a revealed field (or caret line) and the keyboard or the bar above it. */
const REVEAL_GAP = 12

/** Where the keyboard leaves room, in visual-viewport coordinates. */
export type KeyboardClearance = Readonly<{
  /** The visual viewport's pan: layout coordinates minus this are on-screen coordinates. */
  offsetTop: number
  /** The bottom of the room above the keyboard (the tallest one measured at this size). */
  bottom: number
}>
type Avoiding = {
  restorePadding: string
  originalPadding: number
  /** The inline padding this module last wrote; anything else was written by the app. */
  written: string
  /** A screen's content layer lifted by its own scroll offset: restored at release. */
  lift: { scrollTop: number; spacer: HTMLElement | null } | null
}

/**
 * A caret-line reveal can stop at any offset that keeps the caret line in the room; prefer one
 * that keeps the whole editor inside the surface's box. Measured on the iPhone Simulator (Tall
 * lab, a TextEditor capped to the room): ~20 ms after the keyboard arrives WebKit centres a focused
 * editor that a scroll ancestor cuts off, in that ancestor's full box with the keyboard ignored,
 * which put the caret line back under the keyboard. An editor wholly inside is left alone.
 */
function keepEditorInBox(
  delta: number,
  editor: { top: number; bottom: number },
  box: DOMRect,
  offsetTop: number,
  room: { targetTop: number; targetBottom: number; top: number; bottom: number },
) {
  // Keeping the whole card in its box is never a reason to move an already visible caret.
  if (delta === 0) return 0
  // Every offset in [lowest, highest] keeps the caret line in the room.
  const lowest = room.targetBottom - (room.bottom - REVEAL_GAP)
  const highest = room.targetTop - (room.top + REVEAL_GAP)
  // Every offset in [inside, outside] keeps the editor inside the box.
  const inside = editor.bottom - (box.bottom - offsetTop)
  const outside = editor.top - (box.top - offsetTop)
  const low = Math.max(lowest, inside)
  const high = Math.min(highest, outside)
  if (low > high) return delta
  return Math.min(high, Math.max(low, delta))
}

/**
 * Keyboard avoidance for the focused editor, through the keyboard safe area: every
 * scroll surface around the editor gets room below its content for the keyboard and scrolls the
 * editor (a tall editor: its caret line) above the keyboard, innermost first. An editor on a page
 * whose surfaces cannot bring it up (a screen without a scroll surface, or a nested scroller pinned
 * under the keyboard) lifts the screen's content layer by scrolling that layer, which clips its
 * content and is never touch-scrollable; the navigation bar stays where it is. The document and
 * the visual viewport never move. Everything is restored when editing ends, and whenever no
 * keyboard shows while the field stays focused (rotation, the app in the background, a hardware
 * keyboard attached, the keyboard hidden by its own key); it is applied again when one returns.
 */
export function createKeyboardAvoidance() {
  const avoiding = new Map<HTMLElement, Avoiding>()
  // An app render can rewrite a surface's inline style (ScrollSurface spreads `style`): put the
  // keyboard room back on top of the app's new padding.
  const styleObserver =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(records => {
          for (const record of records) {
            const surface = record.target as HTMLElement
            const state = avoiding.get(surface)
            if (!state || state.lift || surface.style.paddingBottom === state.written) continue
            const room = parseFloat(state.written) - state.originalPadding
            state.restorePadding = surface.style.paddingBottom
            state.originalPadding = parseFloat(getComputedStyle(surface).paddingBottom) || 0
            state.written = `${state.originalPadding + room}px`
            surface.style.paddingBottom = state.written
          }
        })
  const release = (surface: HTMLElement) => {
    const state = avoiding.get(surface)
    if (!state) return
    avoiding.delete(surface)
    if (avoiding.size === 0) styleObserver?.disconnect()
    // A node React has already removed (a new screen key) has nothing to put back.
    if (!surface.isConnected) return
    if (state.lift) {
      state.lift.spacer?.remove()
      surface.scrollTop = state.lift.scrollTop
    } else surface.style.paddingBottom = state.restorePadding
    surface.removeAttribute('data-satin-keyboard-avoiding')
  }
  const releaseAll = () => {
    for (const surface of [...avoiding.keys()]) release(surface)
  }
  /** Room below a surface's content for the part of it the keyboard covers. */
  const makeRoom = (surface: HTMLElement, clearance: KeyboardClearance) => {
    let state = avoiding.get(surface)
    if (!state) {
      state = {
        restorePadding: surface.style.paddingBottom,
        originalPadding: parseFloat(getComputedStyle(surface).paddingBottom) || 0,
        written: '',
        lift: null,
      }
      avoiding.set(surface, state)
      styleObserver?.observe(surface, { attributes: true, attributeFilter: ['style'] })
    }
    const overlap = Math.max(
      0,
      surface.getBoundingClientRect().bottom - clearance.offsetTop - clearance.bottom,
    )
    state.written = `${state.originalPadding + overlap}px`
    surface.style.paddingBottom = state.written
    surface.dataset.satinKeyboardAvoiding = 'true'
  }
  /** Room to lift a screen layer: a spacer under its box (its own padding may not count as overflow). */
  const makeLiftRoom = (layer: HTMLElement, clearance: KeyboardClearance, requiredLift: number) => {
    let state = avoiding.get(layer)
    if (!state) {
      state = {
        restorePadding: '',
        originalPadding: 0,
        written: '',
        lift: { scrollTop: layer.scrollTop, spacer: null },
      }
      avoiding.set(layer, state)
    }
    const lift = state.lift!
    // React may have replaced the layer's children (a remount): the spacer went with them.
    if (lift.spacer && lift.spacer.parentElement !== layer) lift.spacer = null
    if (!lift.spacer) {
      // Its own element name, every declaration important: page rules cannot change its box.
      const spacer = layer.ownerDocument.createElement('satin-keyboard-spacer')
      spacer.setAttribute('aria-hidden', 'true')
      const box: Record<string, string> = {
        display: 'block',
        position: 'absolute',
        top: '100%',
        left: '0',
        width: '1px',
        margin: '0',
        padding: '0',
        visibility: 'hidden',
        'pointer-events': 'none',
      }
      for (const [property, value] of Object.entries(box))
        spacer.style.setProperty(property, value, 'important')
      layer.append(spacer)
      lift.spacer = spacer
    }
    const overlap = Math.max(
      0,
      layer.getBoundingClientRect().bottom - clearance.offsetTop - clearance.bottom,
    )
    // Rotation can leave app content taller than the new layer. Keyboard overlap alone
    // cannot provide enough scroll range to reveal a field beyond that layer's bottom.
    const room = Math.max(overlap, requiredLift)
    lift.spacer.style.setProperty('height', `${room}px`, 'important')
    layer.dataset.satinKeyboardAvoiding = 'true'
  }

  /** The bottom of the navigation bar drawn over this editor's screen (none in a presentation). */
  const barBottom = (editor: Editor, offsetTop: number) => {
    const field = editor.getBoundingClientRect()
    let bottom = 0
    const bars = document.querySelectorAll?.<HTMLElement>(NAVIGATION_CHROME) ?? []
    for (const bar of bars) {
      const rect = bar.getBoundingClientRect()
      if (rect.height <= 0 || rect.right <= field.left || rect.left >= field.right) continue
      bottom = Math.max(bottom, rect.bottom - offsetTop)
    }
    return bottom
  }

  /**
   * Bring the editor (a tall one: its caret line) into the room above the keyboard.
   * `withCaret` measures the caret line; it is set after a focus or a keyboard change, not while
   * typing (WebKit keeps the caret in view as the text changes). With no keyboard on screen
   * (`keyboardShown` false) owned geometry is released and no surface is scrolled.
   */
  function reveal(
    editor: Editor,
    presentation: Element | null,
    clearance: KeyboardClearance,
    withCaret: boolean,
    keyboardShown = true,
  ) {
    for (const tracked of [...avoiding.keys()]) if (!tracked.isConnected) release(tracked)
    if (!keyboardShown) {
      releaseAll()
      return
    }
    // A safe-area accessory already participates in the keyboard's layout region.
    // Only its own nested scrollers may reveal a caret. Lifting the presenting
    // screen would apply avoidance twice and move the conversation with it.
    const accessory = editor.closest<HTMLElement>('[data-satin-inset-accessory="true"]')
    const surfaces: HTMLElement[] = []
    let surface = editor.closest<HTMLElement>(SURFACE)
    while (surface) {
      // A top-layer field is not part of the presenting page's scroll geometry.
      if (presentation && !presentation.contains(surface)) break
      if (accessory && !accessory.contains(surface)) break
      surfaces.push(surface)
      surface = surface.parentElement?.closest<HTMLElement>(SURFACE) ?? null
    }
    const screenLayer =
      presentation || accessory || !keyboardShown ? null : editor.closest<HTMLElement>(SCREEN_LAYER)
    // A layer that is itself a declared surface is revealed as a surface.
    const layer = screenLayer && !surfaces.includes(screenLayer) ? screenLayer : null
    for (const tracked of [...avoiding.keys()]) {
      if (!surfaces.includes(tracked) && tracked !== layer) release(tracked)
    }
    // A keyboard subscriber can move the field after our first reveal. Recompute a screen
    // lift from its resting position, otherwise a now-visible caret preserves the old lift
    // and applies avoidance twice. This is synchronous with the replacement reveal, so an
    // unchanged layout keeps the same painted position. Typing keeps WebKit's caret ownership.
    if (layer && (withCaret || !(editor instanceof HTMLTextAreaElement))) release(layer)
    if (keyboardShown) for (const declared of surfaces) makeRoom(declared, clearance)
    // Once editing is established, WebKit keeps the caret visible. A textarea's card
    // is not the reveal target: aligning its bottom on input moves readable content.
    // Focus and keyboard changes explicitly request a fresh caret-line reveal.
    if (editor instanceof HTMLTextAreaElement && !withCaret) return

    const offsetTop = clearance.offsetTop
    const clearTop = presentation ? 0 : barBottom(editor, offsetTop)
    const room = clearance.bottom - clearTop - 2 * REVEAL_GAP
    const fieldRect = () => {
      const rect = editor.getBoundingClientRect()
      return { top: rect.top - offsetTop, bottom: rect.bottom - offsetTop }
    }
    const fits = fieldRect().bottom - fieldRect().top <= room
    const scrollsInside = editor.scrollHeight > editor.clientHeight + 1
    // A field that does not fit, or text scrolled inside its editor: the caret line is the target.
    let caret: CaretLine | null = null
    if (withCaret && (editor instanceof HTMLTextAreaElement || !fits || scrollsInside)) {
      const end =
        editor.selectionDirection === 'backward' ? editor.selectionStart : editor.selectionEnd
      const line = caretLineAt(editor, end ?? 0)
      caret = line && { top: line.top - offsetTop, bottom: line.bottom - offsetTop }
    }
    // While typing in a field taller than the room, WebKit keeps its caret in view.
    if (!fits && !caret) return

    const scrollBy = (scroller: HTMLElement, delta: number) => {
      const before = scroller.scrollTop
      scroller.scrollTop = before + delta
      const moved = scroller.scrollTop - before
      if (caret) caret = { top: caret.top - moved, bottom: caret.bottom - moved }
      return moved
    }
    // The caret line inside the editor's own scrolled text first.
    if (caret && scrollsInside) {
      const box = editor.getBoundingClientRect()
      const style = getComputedStyle(editor)
      const top = box.top - offsetTop + (parseFloat(style.paddingTop) || 0)
      const bottom = box.bottom - offsetTop - (parseFloat(style.paddingBottom) || 0)
      const delta = revealDelta(caret.top, caret.bottom, top, bottom, Infinity, 0)
      if (delta) scrollBy(editor, delta)
    }
    const target = () => caret ?? fieldRect()
    // Innermost first; a second pass reveals within an inner surface that an outer one brought up.
    for (let pass = 0; pass < 2; pass++) {
      for (const scroller of [...surfaces, ...(layer ? [layer] : [])]) {
        const box = scroller.getBoundingClientRect()
        const top = Math.max(box.top - offsetTop, clearTop)
        const bottom = Math.min(box.bottom - offsetTop, clearance.bottom)
        const { top: targetTop, bottom: targetBottom } = target()
        // This surface's visible part cannot hold the target (it is under the keyboard): an outer
        // surface or the screen layer moves it first.
        if (scroller !== layer && bottom - top - 2 * REVEAL_GAP < targetBottom - targetTop) continue
        // A visible caret already satisfies the reveal contract. Do not align the rest of its
        // card or add a preferred gap by scrolling content that the user can already read.
        if (caret && targetTop >= top && targetBottom <= bottom) continue
        let delta = revealDelta(targetTop, targetBottom, top, bottom, clearance.bottom, REVEAL_GAP)
        if (!fits && scroller !== layer)
          delta = keepEditorInBox(delta, fieldRect(), box, offsetTop, {
            targetTop,
            targetBottom,
            top,
            bottom,
          })
        if (!delta) continue
        // The screen layer only lifts content that is under the keyboard; it never pushes it down
        // below where the app laid it out.
        if (scroller === layer) {
          if (delta > 0) makeLiftRoom(layer, clearance, layer.scrollTop + delta)
          else if (!avoiding.has(layer)) continue
        }
        scrollBy(scroller, delta)
      }
    }
  }
  return { reveal, releaseAll }
}
