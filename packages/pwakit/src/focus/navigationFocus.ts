import type { FocusReason } from './focusIntentMachine.ts'
import type { NavigatorState } from '../navigation/types.ts'
import { focusFromFramework, trackInputModality } from './programmaticFocus.ts'

export type FocusScope = {
  element: HTMLElement
  title: string
  heading?: HTMLElement
  chromeExpected?: boolean
  contentFirst?: boolean
}
type ChromeScope = { element: HTMLElement; heading: HTMLElement | null; back: HTMLElement | null }
type NavigationFocusReason = FocusReason | 'select-detail' | 'replace'

/** Eligibility is shared by route and modal restoration. Geometry is checked
 * separately at the point of focus; DOM membership alone is not visibility. */
export function canReceiveFocus(
  element: HTMLElement | null | undefined,
  scope?: HTMLElement,
): element is HTMLElement {
  if (
    !element?.isConnected ||
    (scope && !scope.contains(element)) ||
    element.closest('[inert], [hidden], [aria-hidden="true"], :disabled') ||
    !element.matches(
      'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
    )
  )
    return false
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = current.ownerDocument.defaultView?.getComputedStyle(current)
    if (style?.display === 'none' || style?.visibility === 'hidden') return false
  }
  return true
}

/** Reject clipped, transparent, offscreen and empty accessibility cursor frames.
 * Intersect overflow clips as well as the viewport (retained scroll positions). */
export function hasVisibleFocusFrame(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView
  if (!view) return false
  const rect = element.getBoundingClientRect()
  let left = Math.max(0, rect.left),
    top = Math.max(0, rect.top)
  let right = Math.min(view.innerWidth, rect.right),
    bottom = Math.min(view.innerHeight, rect.bottom)
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = view.getComputedStyle(current)
    if (
      style.opacity === '0' ||
      style.clipPath === 'inset(50%)' ||
      style.clip === 'rect(0px, 0px, 0px, 0px)'
    )
      return false
    if (current !== element) {
      const bounds = current.getBoundingClientRect()
      if (/(hidden|clip|scroll|auto)/.test(style.overflowX || style.overflow)) {
        left = Math.max(left, bounds.left)
        right = Math.min(right, bounds.right)
      }
      if (/(hidden|clip|scroll|auto)/.test(style.overflowY || style.overflow)) {
        top = Math.max(top, bounds.top)
        bottom = Math.min(bottom, bounds.bottom)
      }
    }
  }
  return right - left > 1 && bottom - top > 1
}
export function visibleFocusTarget(
  element: HTMLElement | null | undefined,
): element is HTMLElement {
  // Restoring a pinned search field would start a new search and summon its keyboard.
  // It remains in the user's Tab order; only automatic framework focus skips it.
  return (
    canReceiveFocus(element) &&
    !element.closest('[data-satin-search]:not([data-satin-search-presented])') &&
    hasVisibleFocusFrame(element)
  )
}

export function visibleHeading(scope: HTMLElement) {
  return [
    ...scope.querySelectorAll<HTMLElement>('h1, h2, [role="heading"], [data-satin-modal-heading]'),
  ].find(element => {
    // Static headings become programmatic targets, never extra Tab stops.
    if (!element.hasAttribute('tabindex')) element.tabIndex = -1
    return visibleFocusTarget(element)
  })
}
export function firstVisibleControl(scope: HTMLElement) {
  return [
    ...scope.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'),
  ].find(element => element.tabIndex >= 0 && visibleFocusTarget(element))
}

/** Conservative content eligibility, not a replacement for the browser's name
 * computation. Never promote an empty/decorative node into the focus order. */
function hasMeaningfulContent(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden') return false
  if (
    element instanceof element.ownerDocument.defaultView!.HTMLImageElement &&
    (!element.alt.trim() || element.matches('[role="presentation"], [role="none"]'))
  )
    return false
  const labelled = element.getAttribute('aria-labelledby')?.trim()
  if (
    labelled &&
    labelled.split(/\s+/).some(id => element.ownerDocument.getElementById(id)?.textContent?.trim())
  )
    return true
  if (element.getAttribute('aria-label')?.trim() || element.getAttribute('title')?.trim())
    return true
  if (
    'labels' in element &&
    [...((element as HTMLInputElement).labels ?? [])].some(label => label.textContent?.trim())
  )
    return true
  if (element.matches('img[alt]') && element.getAttribute('alt')?.trim()) return true
  if (
    element.matches('input[type="button"], input[type="submit"], input[type="reset"]') &&
    (element as HTMLInputElement).value.trim()
  )
    return true
  return [...element.childNodes].some(child =>
    child.nodeType === 3
      ? Boolean(child.textContent?.trim())
      : child instanceof element.ownerDocument.defaultView!.HTMLElement &&
        !child.matches('script, style, [hidden], [aria-hidden="true"]') &&
        hasVisibleFocusFrame(child) &&
        hasMeaningfulContent(child),
  )
}

/** Native pushes start at readable screen content. Walk in reading order,
 * treating named controls and semantic text blocks as single elements. Plain
 * text also works without requiring app authors to add a heading or Tab stop. */
export function firstVisibleContent(scope: HTMLElement) {
  const document = scope.ownerDocument,
    view = document.defaultView
  if (!view) return
  const walker = document.createTreeWalker(scope, 1)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof view.HTMLElement)) continue
    if (
      node.closest('script, style, svg, canvas, [inert], [hidden], [aria-hidden="true"], :disabled')
    )
      continue
    if (node.matches('[role="presentation"], [role="none"]')) continue
    const control = node.matches(
      'button, input, select, textarea, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="slider"], img[alt]',
    )
    const textBlock =
      node.matches('p, h1, h2, h3, h4, h5, h6, [role="heading"]') && node.textContent?.trim()
    const directText = [...node.childNodes].some(
      child => child.nodeType === 3 && child.textContent?.trim(),
    )
    if (
      (!control && !textBlock && !directText) ||
      !hasVisibleFocusFrame(node) ||
      !hasMeaningfulContent(node)
    )
      continue
    if (!node.hasAttribute('tabindex') && !node.matches('button, input, select, textarea, a[href]'))
      node.tabIndex = -1
    if (visibleFocusTarget(node)) return node
  }
}

/** Activating a tab keeps its cursor on the tab. Programmatic switches whose
 * old content became inert still need a destination focus target. */
export function hasFocusedTab(document: Document) {
  const active = document.activeElement
  return (
    active instanceof document.defaultView!.HTMLElement &&
    active.matches('[data-satin-tab-item], [role="tab"][data-tab-index]') &&
    visibleFocusTarget(active)
  )
}

/** Store settlement is the transaction boundary. Chrome has explicit ownership
 * because it is a sibling of the retained screen, not a descendant. */
export function createNavigationFocusRuntime() {
  if (typeof document !== 'undefined') trackInputModality(document)
  const scopes = new Map<string, FocusScope>()
  const chrome = new Map<string, ChromeScope>()
  const saved = new Map<string, HTMLElement>()
  let pending: { key: string; reason: NavigationFocusReason } | undefined
  let revision = 0
  const owns = (key: string, target: HTMLElement) =>
    scopes.get(key)?.element.contains(target) || chrome.get(key)?.element.contains(target)
  return {
    bind(key: string, scope: FocusScope) {
      scopes.set(key, scope)
      return () => {
        if (scopes.get(key) === scope) scopes.delete(key)
      }
    },
    bindChrome(key: string, scope: ChromeScope) {
      chrome.set(key, scope)
      return () => {
        if (chrome.get(key) === scope) chrome.delete(key)
      }
    },
    capture(keys: readonly string[]) {
      for (const key of keys) {
        const scope = scopes.get(key)
        const active = scope?.element.ownerDocument.activeElement
        if (
          scope &&
          active instanceof scope.element.ownerDocument.defaultView!.HTMLElement &&
          owns(key, active) &&
          visibleFocusTarget(active)
        )
          saved.set(key, active)
      }
    },
    request(key: string | undefined, reason: NavigationFocusReason) {
      pending = key ? { key, reason } : undefined
      revision++
    },
    flush(state: NavigatorState, key: string, active: boolean) {
      if (
        !active ||
        !pending ||
        pending.key !== key ||
        state.entries.some(entry => entry.transition.phase !== 'settled')
      )
        return
      const scope = scopes.get(key)
      if (!scope || (scope.chromeExpected && !chrome.has(key))) return
      if (
        [...scope.element.ownerDocument.querySelectorAll('dialog[open]')].some(
          dialog => !dialog.contains(scope.element),
        )
      )
        return
      const restore =
        pending.reason === 'pop' ||
        pending.reason === 'transition-cancel' ||
        pending.reason === 'dismiss'
      const snapshot = saved.get(key),
        bar = chrome.get(key)
      // Physical iPadOS 27: split selection retains the sidebar invoker;
      // pushes land on the first content element. A button pop can retain the
      // still-visible Back control, while scrub restores the screen invoker.
      const activeElement = scope.element.ownerDocument.activeElement
      // An entering screen may focus an editor before its push settles. That editing intent
      // wins over the default heading/Back target; keyboard avoidance reveals it after motion.
      // Do not require an unclipped frame here: the keyboard may still cover this editor.
      const editingTarget =
        activeElement instanceof scope.element.ownerDocument.defaultView!.HTMLElement &&
        activeElement.matches('input, textarea, [contenteditable="true"]') &&
        canReceiveFocus(activeElement, scope.element)
          ? activeElement
          : undefined
      const selectedInvoker =
        pending.reason === 'select-detail' &&
        activeElement instanceof scope.element.ownerDocument.defaultView!.HTMLElement &&
        state.entries.some(entry => entry.key !== key && owns(entry.key, activeElement)) &&
        visibleFocusTarget(activeElement)
          ? activeElement
          : undefined
      const retainedBack =
        pending.reason === 'pop' && activeElement === bar?.back && visibleFocusTarget(bar?.back)
          ? bar.back
          : undefined
      const restored =
        restore && snapshot && owns(key, snapshot) && visibleFocusTarget(snapshot)
          ? snapshot
          : undefined
      const contentPush = scope.contentFirst && pending.reason === 'push'
      const target =
        editingTarget ??
        selectedInvoker ??
        retainedBack ??
        restored ??
        (contentPush
          ? ((visibleFocusTarget(scope.heading) ? scope.heading : undefined) ??
            firstVisibleContent(scope.element))
          : undefined) ??
        // Unmeasured scopes/reasons retain the pre-12j2 fallback order.
        [bar?.back, scope.heading, bar?.heading].find(visibleFocusTarget) ??
        visibleHeading(scope.element) ??
        firstVisibleControl(scope.element)
      if (!target) return // Remain pending until an actual visible target is ready.
      const version = revision
      focusFromFramework(target, { preventScroll: true })
      scope.element.ownerDocument.title = scope.title
      if (version === revision) pending = undefined
      const retained = new Set(state.entries.map(entry => entry.key))
      for (const savedKey of saved.keys()) if (!retained.has(savedKey)) saved.delete(savedKey)
    },
  }
}
export const navigatorFocusRuntime = Symbol('satin.navigator.focus-runtime')
