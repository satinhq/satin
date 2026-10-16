import { focusFromFramework, isFrameworkFocus } from '../focus/programmaticFocus.ts'
import { SCROLL_PRESS_SLOP_PX } from '../scroll/pressOwnership.ts'
import { caretOffsetAt } from './caretMirror.ts'

type Editor = HTMLInputElement | HTMLTextAreaElement

/** The text control a label activates. */
function labelledEditor(label: HTMLLabelElement): Element | null {
  if (label.control) return label.control
  const named = label.htmlFor ? label.ownerDocument.getElementById(label.htmlFor) : null
  return named ?? label.querySelector('input, textarea')
}

/** A press on an editor this soon before its focus started that editor's editing. */
const PRESS_FOCUS_MS = 1500
/** A focus this soon after a Tab key belongs to the Tab traversal, not the next/previous keys. */
const TAB_FOCUS_MS = 300

/**
 * Own every focus of an editor, so that each one carries `preventScroll`.
 *
 * Measured on the iPad (1366 x 1024, the alert's field): a focus WebKit makes itself pans the
 * visual viewport by 238.5 pt in one step when the keyboard arrives, and the page is drawn there
 * until the next script frame puts it back. On a phone WebKit always centres a field it focused
 * (WKContentView forces the scroll where the form accessory bar is shown). A focus made with
 * `preventScroll` is never revealed by WebKit; the keyboard adapter reveals it. The ways a finger
 * focuses an editor:
 * - a short tap: focused at pointer-up, inside the activation the keyboard needs;
 * - a tap held longer than that, or one that moved: its mouse press is prevented and focused here
 *   (a 450 ms tap panned the page before this; repeating the focus afterwards did not help);
 * - a label: its click is prevented and its editor focused here;
 * - focus moving from an owned editor to another one in the same scope while the keyboard is up
 *   and no Tab key was pressed (the keyboard's next/previous keys; an app's focus call between two
 *   fields is indistinguishable and ends on the same field): the new editor is focused with
 *   `preventScroll` from the old one's focusout, so WebKit abandons the call that would have
 *   panned (it pans at once while the keyboard is up). Never for an inert field, across a dialog
 *   boundary, or while a presentation is still moving;
 * - anything else (a long press, an app's focus call with no editor focused, an assistive
 *   technology or keyboard activation of a label): the focus is repeated with `preventScroll` in
 *   its focusin, which WebKit accepts while its keyboard is not up yet.
 * A mouse or trackpad press stays native from pointer-down to click: its drag selects text.
 *
 * Every gesture in an editor that is already focused stays native (caret taps, double-tap word
 * selection, selection and caret drags), whether or not a keyboard shrinks the viewport (a hardware
 * keyboard, an undocked keyboard, the ~100 ms before WebKit reports a software keyboard) and
 * however it was focused. An editor focused without a press (by the app, Tab, or the next key)
 * while no keyboard shows gets one more framework focus with `preventScroll` at the pointer-down
 * of its first tap, so the editing session that tap starts is not revealed with a pan; the tap
 * itself stays WebKit's.
 */
export function installModalTapFocus(
  root: HTMLElement,
  isEditable: (target: EventTarget | null) => target is Editor,
  /** Called once this tap has focused the editor (its keyboard is on the way). */
  onTapFocus?: (editor: Editor) => void,
  /** False while no keyboard is shown: a tap on the focused editor must then bring it back. */
  keyboardShowing: () => boolean = () => true,
  /** Which editors are owned. The keyboard adapter owns every editor in its root (pages too). */
  owns: (editor: Element) => boolean = editor => editor.closest('dialog[open]') !== null,
) {
  let press: { editor: Editor; x: number; y: number; at: number } | null = null
  let synthetic: { editor: Editor; until: number } | null = null
  let pointerType = ''
  // The last pointer-down, and the editor a press has started editing.
  let lastDown: { target: EventTarget | null; at: number } | null = null
  let editing: Editor | null = null
  let tabAt = -Infinity
  /** Not focused yet: the framework makes this focus. A focused editor's gestures are WebKit's. */
  const needsFocus = (editor: Editor) =>
    owns(editor) && editor.ownerDocument.activeElement !== editor
  const focusEditor = (editor: Editor, point: { x: number; y: number } | null) => {
    const offset = point ? caretOffsetAt(editor, point.x, point.y) : null
    focusFromFramework(editor, { preventScroll: true })
    if (editor.ownerDocument.activeElement === editor) editing = editor
    onTapFocus?.(editor)
    if (offset === null) return
    try {
      editor.setSelectionRange(offset, offset)
    } catch {
      /* Non-selection input kinds. */
    }
    synthetic = { editor, until: performance.now() + 800 }
  }
  const down = (event: PointerEvent) => {
    synthetic = null
    pointerType = event.pointerType
    const target = event.target
    lastDown = { target, at: performance.now() }
    // Focused without a press and no keyboard yet: this tap starts the editing session. Give
    // WebKit preventScroll for it (it takes the latest focus options while no keyboard is up)
    // and leave the tap itself native.
    if (
      event.pointerType !== 'mouse' &&
      isEditable(target) &&
      owns(target) &&
      target.ownerDocument.activeElement === target &&
      editing !== target &&
      !keyboardShowing()
    ) {
      focusFromFramework(target, { preventScroll: true })
      editing = target
      onTapFocus?.(target)
    }
    // A mouse or trackpad keeps its whole press native, pointer-up included.
    const owned = event.pointerType !== 'mouse' && isEditable(target) && needsFocus(target)
    press = owned
      ? { editor: target, x: event.clientX, y: event.clientY, at: performance.now() }
      : null
  }
  const up = (event: PointerEvent) => {
    const started = press
    press = null
    if (
      !started ||
      event.target !== started.editor ||
      performance.now() - started.at > 350 ||
      Math.hypot(event.clientX - started.x, event.clientY - started.y) >= SCROLL_PRESS_SLOP_PX
    )
      return
    focusEditor(started.editor, { x: event.clientX, y: event.clientY })
  }
  const cancel = () => {
    press = null
  }
  const mouse = (event: MouseEvent) => {
    const target = event.target
    if (
      synthetic &&
      target === synthetic.editor &&
      performance.now() <= synthetic.until &&
      event.detail > 0
    ) {
      event.preventDefault()
      if (event.type === 'click') synthetic = null
      return
    }
    // A mouse or trackpad keeps its native press: its drag selects text.
    if (event.type !== 'mousedown' || event.detail === 0 || pointerType === 'mouse') return
    if (!isEditable(target) || !needsFocus(target)) return
    event.preventDefault()
    focusEditor(target, { x: event.clientX, y: event.clientY })
  }
  const labelClick = (event: MouseEvent) => {
    // An activation with no pointer (VoiceOver, Full Keyboard Access) stays native: the
    // assistive technology starts editing itself, and focusin repeats that focus with preventScroll.
    if (event.detail === 0 || pointerType === 'mouse') return
    const label = event.target instanceof Element ? event.target.closest('label') : null
    if (!label || event.defaultPrevented) return
    const editor = labelledEditor(label)
    if (!isEditable(editor) || editor.contains(event.target as Node) || !needsFocus(editor)) return
    event.preventDefault()
    focusEditor(editor, null)
  }
  const startedByPress = (editor: Editor) => {
    if (!lastDown || performance.now() - lastDown.at > PRESS_FOCUS_MS) return false
    const target = lastDown.target
    if (!(target instanceof Element)) return false
    if (target === editor || editor.contains(target)) return true
    const label = target.closest('label')
    return label !== null && labelledEditor(label) === editor
  }
  const focusIn = (event: FocusEvent) => {
    const editor = event.target
    if (!isEditable(editor) || !owns(editor)) return
    // A long press, a label or a mouse press focused it: that press started editing.
    if (startedByPress(editor)) editing = editor
    if (isFrameworkFocus(editor)) return
    // Focusing the focused element again changes no DOM state and sends no event; WebKit takes
    // the options of this call for the editing session it is about to start.
    focusFromFramework(editor, { preventScroll: true })
  }
  const focusOut = (event: FocusEvent) => {
    if (event.target === editing) editing = null
    // Focus is moving from one owned editor to another with the keyboard up and no tap: the
    // keyboard's next/previous keys (or an app's focus call between two fields, which ends on the
    // same field). Measured on the iPhone Simulator: WebKit pans the page at once from that call's
    // options, before any focusin repeat. WebKit abandons a focus change that a blur handler has
    // already made, so focusing it here, with preventScroll, makes this the focus that counts.
    const previous = event.target
    const next = event.relatedTarget
    if (!isEditable(previous) || !owns(previous)) return
    if (!isEditable(next) || !owns(next) || isFrameworkFocus(next)) return
    if (!keyboardShowing() || performance.now() - tabAt < TAB_FOCUS_MS) return
    if (next.closest('[inert]')) return
    const scope = previous.closest('dialog[open]')
    if (next.closest('dialog[open]') !== scope) return
    if (scope?.hasAttribute('data-satin-presentation-moving')) return
    focusFromFramework(next, { preventScroll: true })
  }
  // A Tab key moves focus with its owner's own rules (the dialog's traversal reveals overflow).
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') tabAt = performance.now()
  }
  // Capture reaches editors even when modal bubble handlers contain pointers.
  root.addEventListener('pointerdown', down, { capture: true, passive: true })
  root.addEventListener('pointerup', up, { capture: true, passive: true })
  root.addEventListener('pointercancel', cancel, { capture: true, passive: true })
  root.addEventListener('mousedown', mouse, true)
  root.addEventListener('click', mouse, true)
  root.addEventListener('click', labelClick, true)
  root.addEventListener('focusin', focusIn, true)
  root.addEventListener('focusout', focusOut, true)
  root.addEventListener('keydown', keyDown, true)
  return () => {
    root.removeEventListener('keydown', keyDown, true)
    root.removeEventListener('pointerdown', down, true)
    root.removeEventListener('pointerup', up, true)
    root.removeEventListener('pointercancel', cancel, true)
    root.removeEventListener('mousedown', mouse, true)
    root.removeEventListener('click', mouse, true)
    root.removeEventListener('click', labelClick, true)
    root.removeEventListener('focusin', focusIn, true)
    root.removeEventListener('focusout', focusOut, true)
  }
}
