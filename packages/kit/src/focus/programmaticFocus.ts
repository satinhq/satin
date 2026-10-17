/** Framework-initiated focus follows the user's last input modality. Native iOS
 * paints no focus indicator after touch, so a focus move that Satin makes after
 * a touch/pointer interaction must not match :focus-visible. A hardware keyboard
 * keeps the ring. VoiceOver's cursor is independent of the CSS indicator. */
type Modality = 'keyboard' | 'pointer'
const modalities = new WeakMap<Document, Modality>()
const tracked = new WeakSet<Document>()
const quietAttribute = 'data-satin-focus-quiet'
let optionSupport: boolean | undefined

function editable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    )
  )
}

/** Typing into a field on the software keyboard is not keyboard navigation;
 * navigation keys and shortcuts are. */
function isKeyboardNavigation(event: KeyboardEvent) {
  return (
    !editable(event.target) ||
    event.key === 'Tab' ||
    event.key === 'Escape' ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
}

export function trackInputModality(document: Document) {
  // Non-DOM hosts (server rendering, renderer test doubles) have nothing to track.
  if (tracked.has(document) || typeof document.addEventListener !== 'function') return
  tracked.add(document)
  const pointer = () => {
    modalities.set(document, 'pointer')
    quietRestoredFocus()
  }
  // WebKit can restore focus itself after an app switch, without calling our
  // focus helper. Only framework-owned elements participate in this policy.
  const quietRestoredFocus = () => {
    const active = document.activeElement
    const view = document.defaultView
    if (
      lastInputWasKeyboard(document) ||
      !view ||
      !(active instanceof view.HTMLElement) ||
      !active.closest('[data-satin-mount], [data-satin-role="chrome"]')
    )
      return
    quiet(active)
  }
  document.addEventListener('focusin', quietRestoredFocus, true)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') modalities.set(document, 'pointer')
    if (document.visibilityState === 'visible') quietRestoredFocus()
  })
  // Home/another app can receive a touch that this document never sees. A new
  // activation starts quiet; actual keyboard navigation reveals its indicator.
  document.defaultView?.addEventListener('blur', () => modalities.set(document, 'pointer'))
  document.defaultView?.addEventListener('focus', quietRestoredFocus)
  document.addEventListener(
    'keydown',
    event => {
      if (!isKeyboardNavigation(event)) return
      modalities.set(document, 'keyboard')
      // Keyboard use after a quiet programmatic focus reveals the ring again.
      const active = document.activeElement
      if (active instanceof Element) active.removeAttribute(quietAttribute)
    },
    true,
  )
  for (const type of ['pointerdown', 'mousedown', 'touchstart'] as const)
    document.addEventListener(type, pointer, { capture: true, passive: true })
}

/** WebIDL converts the options dictionary before focusability is checked, so a
 * detached element detects `focusVisible` support without moving focus. */
function supportsFocusVisibleOption(document: Document) {
  if (optionSupport !== undefined) return optionSupport
  let read = false
  try {
    document.createElement('div').focus({
      get focusVisible() {
        read = true
        return false
      },
    })
  } catch {
    read = false
  }
  return (optionSupport = read)
}

/** Test hook: force or re-detect `focusVisible` option support. */
export function setFocusVisibleOptionSupportForTesting(value: boolean | undefined) {
  optionSupport = value
}

export function lastInputWasKeyboard(document: Document) {
  return modalities.get(document) === 'keyboard'
}

let frameworkFocusTarget: Element | null = null
/** True while `focusFromFramework` is moving focus to this element (its focus events included). */
export function isFrameworkFocus(element: Element) {
  return frameworkFocusTarget === element
}

/** Use for every focus move Satin makes on the user's behalf (route, tab and
 * modal targets, restoration). Keyboard-driven traversal may call focus() directly. */
export function focusFromFramework(
  element: HTMLElement,
  options: { preventScroll?: boolean } = {},
) {
  const document = element.ownerDocument
  trackInputModality(document)
  const keyboard = lastInputWasKeyboard(document)
  if (keyboard) element.removeAttribute(quietAttribute)
  const previousTarget = frameworkFocusTarget
  frameworkFocusTarget = element
  try {
    if (!keyboard) quiet(element)
    if (supportsFocusVisibleOption(document)) {
      element.focus({ ...options, focusVisible: keyboard })
      // The option cannot clear a state set by an earlier UA focus (showModal()'s
      // focusing steps can already have focused this element as focus-visible).
      if (!keyboard && document.activeElement === element && matchesFocusVisible(element))
        quiet(element)
      return
    }
    // Fallback for engines without the option: a framework-owned attribute scoped
    // to this element suppresses its indicator until blur or keyboard use.
    element.focus(options)
  } finally {
    frameworkFocusTarget = previousTarget
  }
}

/** A modal's UA focusing steps (showModal) can focus a descendant before Satin
 * has a visible target (a sheet still entering). After touch, quiet that UA
 * focus the same way; keyboard users keep the ring. */
export function quietUserAgentFocus(scope: Element) {
  const document = scope.ownerDocument
  trackInputModality(document)
  const active = document.activeElement
  if (
    !active ||
    !scope.contains(active) ||
    lastInputWasKeyboard(document) ||
    !matchesFocusVisible(active)
  )
    return
  const view = document.defaultView
  if (view && active instanceof view.HTMLElement) quiet(active)
}

function matchesFocusVisible(element: Element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return false
  }
}

function quiet(element: HTMLElement) {
  if (element.hasAttribute(quietAttribute)) return
  element.setAttribute(quietAttribute, '')
  element.addEventListener('blur', () => element.removeAttribute(quietAttribute), { once: true })
}
