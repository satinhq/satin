import {
  canReceiveFocus,
  visibleFocusTarget,
  visibleHeading,
  firstVisibleControl,
} from '../focus/navigationFocus.ts'
import { focusFromFramework, quietUserAgentFocus } from '../focus/programmaticFocus.ts'
import { editable } from '../keyboard/adapter.ts'

type ModalState = { sessions: Map<HTMLDialogElement, () => void>; isolation?: Isolation }
const documents = new WeakMap<Document, ModalState>()
function stateFor(document: Document): ModalState {
  const state = documents.get(document) ?? { sessions: new Map() }
  documents.set(document, state)
  return state
}

export function topModal(document: Document) {
  const dialogs = [...stateFor(document).sessions.keys()]
  return dialogs.findLast(dialog => dialog.isConnected && dialog.open)
}

/** Foreign dialogs retain the previous DOM-order fallback. Framework dialogs share focus order. */
export function orderedTopLayerDialogs(document: Document) {
  const managed = [...stateFor(document).sessions.keys()]
  const open = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(dialog =>
    dialog.matches(':modal'),
  )
  return open.sort((left, right) => managed.indexOf(left) - managed.indexOf(right))
}

type Isolation = { elements: Set<HTMLElement>; observer: MutationObserver }

/* Isolate sibling branches for VoiceOver; never inert the active dialog's ancestors. */
function updateModalIsolation(document: Document) {
  let isolation = stateFor(document).isolation
  const dialog = topModal(document)
  if (!dialog) {
    if (isolation) for (const element of isolation.elements) element.inert = false
    isolation?.observer.disconnect()
    stateFor(document).isolation = undefined
    return
  }
  if (!isolation) {
    isolation = {
      elements: new Set(),
      observer: new MutationObserver(() => {
        for (const [dialog, close] of stateFor(document).sessions) {
          if (!dialog.isConnected || !dialog.open) close()
        }
        updateModalIsolation(document)
      }),
    }
    stateFor(document).isolation = isolation
    isolation.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    })
  }
  const next = new Set<HTMLElement>()
  let branch: HTMLElement = dialog
  while (branch.parentElement && branch !== document.body) {
    for (const sibling of branch.parentElement.children) {
      if (
        !(sibling instanceof HTMLElement) ||
        sibling === branch ||
        sibling.matches('script, style, link')
      )
        continue
      // Already-inert branches belong to their owner, including screens uncovered during a sheet.
      if (sibling.inert && !isolation.elements.has(sibling)) continue
      next.add(sibling)
    }
    branch = branch.parentElement
  }
  // Subtree updates do not change most branches. Keep them continuously inert:
  // toggling a populated background also invalidates inherited symbol weights
  // and schedules React work even though its modal ownership did not change.
  for (const element of isolation.elements) if (!next.has(element)) element.inert = false
  for (const element of next) if (!isolation.elements.has(element)) element.inert = true
  isolation.elements = next
}

/** Top-layer focus must not reveal an editor by scrolling its inert presenter. */
function retainPresentingScroll(presenter: HTMLElement): () => void {
  const retention = new AbortController()
  for (let surface = presenter.parentElement; surface; surface = surface.parentElement) {
    if (!surface.hasAttribute('data-satin-scroll-axis')) continue
    const target = surface
    const { scrollTop, scrollLeft } = target
    const restore = (event: Event) => {
      // Editors and scroll surfaces inside the dialog keep their own scrolling.
      if (event.target !== target) return
      if (target.scrollTop !== scrollTop) target.scrollTop = scrollTop
      if (target.scrollLeft !== scrollLeft) target.scrollLeft = scrollLeft
    }
    target.addEventListener('scroll', restore, { signal: retention.signal })
  }
  return () => retention.abort()
}

function restoreModalFocus(document: Document, trigger: HTMLElement | null) {
  const parent = topModal(document)
  if (visibleFocusTarget(trigger) && (!parent || parent.contains(trigger)))
    return focusFromFramework(trigger, { preventScroll: true })
  const scope = parent ?? trigger?.closest<HTMLElement>('[data-satin-screen-container]')
  const uncovered = '[data-satin-screen-container][data-satin-covered="false"]'
  const scopes = scope ? [scope] : [...document.querySelectorAll<HTMLElement>(uncovered)]
  const fallback = scopes
    .map(scope => visibleHeading(scope) ?? firstVisibleControl(scope))
    .find(visibleFocusTarget)
  if (fallback) focusFromFramework(fallback, { preventScroll: true })
}

type ModalOptions = {
  initialFocus?: HTMLElement | null
  restoreFocus?: HTMLElement | null
  focusBeforeReveal?: boolean
}
export function openModal(dialog: HTMLDialogElement, options: ModalOptions = {}) {
  const { initialFocus: initial, restoreFocus: fallback, focusBeforeReveal } = options
  const document = dialog.ownerDocument
  if (dialog.open) throw new DOMException('A modal session is already open.', 'InvalidStateError')
  const state = stateFor(document)
  const trigger =
    document.activeElement instanceof HTMLElement ? document.activeElement : (fallback ?? null)
  const headingSelector = '[data-satin-modal-heading]'
  const title = dialog.querySelector<HTMLElement>(headingSelector) ?? visibleHeading(dialog)
  const autofocus = initial instanceof HTMLInputElement ? dialog : (initial ?? title)
  const hadAutofocus = autofocus?.hasAttribute('autofocus')
  autofocus?.setAttribute('autofocus', '')
  const releaseScroll = retainPresentingScroll(fallback ?? dialog)
  try {
    dialog.showModal()
  } catch (error) {
    releaseScroll()
    if (!hadAutofocus) autofocus?.removeAttribute('autofocus')
    throw error
  }
  let closed = false
  const close = (beforeClose?: () => void) => {
    const previouslyClosed = closed
    closed = true
    const editor = document.activeElement
    if (!previouslyClosed && editable(editor) && dialog.contains(editor)) editor.blur()
    beforeClose?.()
    if (previouslyClosed) return
    dialog.removeEventListener('keydown', keydown)
    dialog.removeEventListener('close', nativeClose)
    document.removeEventListener('focusin', focusin)
    state.sessions.delete(dialog)
    updateModalIsolation(document)
    releaseScroll()
    if (dialog.open) dialog.close()
    if (!hadAutofocus) autofocus?.removeAttribute('autofocus')
    restoreModalFocus(document, trigger)
  }
  const nativeClose = () => !dialog.open && close()
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || topModal(document) !== dialog) return
    const selector = 'button, input, select, textarea, a[href], [tabindex]'
    const targets = [...dialog.querySelectorAll<HTMLElement>(selector)]
      .filter(element => element.tabIndex >= 0 && canReceiveFocus(element))
      .sort((left, right) => (left.tabIndex || Infinity) - (right.tabIndex || Infinity))
    const index = targets.indexOf(document.activeElement as HTMLElement)
    const direction = event.shiftKey ? -1 : 1
    const start = index < 0 ? (event.shiftKey ? 0 : -1) : index
    const next = (start + direction + targets.length) % targets.length
    event.preventDefault()
    ;(targets[next] ?? visibleHeading(dialog) ?? firstVisibleControl(dialog))?.focus()
  }
  const focusin = (event: FocusEvent) => {
    if (topModal(document) !== dialog || dialog.contains(event.target as Node)) return
    const target = visibleHeading(dialog) ?? firstVisibleControl(dialog)
    if (target) focusFromFramework(target, { preventScroll: true })
  }
  state.sessions.set(dialog, close)
  updateModalIsolation(document)
  dialog.addEventListener('keydown', keydown)
  dialog.addEventListener('close', nativeClose)
  document.addEventListener('focusin', focusin)
  const focus =
    focusBeforeReveal && initial
      ? initial
      : ([initial, title].find(visibleFocusTarget) ?? firstVisibleControl(dialog))
  if (focus) focusFromFramework(focus, { preventScroll: true })
  quietUserAgentFocus(dialog)
  return close
}
