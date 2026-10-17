/** One document listener arbitrates retained/nested navigators before popping. */
type Target = { host: HTMLElement; enabled: () => boolean; canPop: () => boolean; pop: () => void }
const documents = new WeakMap<Document, Set<Target>>()
const visible = (element: HTMLElement) =>
  !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
  element.getClientRects().length > 0 &&
  element.ownerDocument.defaultView?.getComputedStyle(element).visibility !== 'hidden'

export function registerNavigationKeyboard(target: Target) {
  const document = target.host.ownerDocument
  let targets = documents.get(document)
  if (!targets) {
    targets = new Set()
    documents.set(document, targets)
    document.addEventListener('keydown', handleKey)
  }
  targets.add(target)
  return () => {
    targets.delete(target)
    if (!targets.size) {
      document.removeEventListener('keydown', handleKey)
      documents.delete(document)
    }
  }
}
function handleKey(event: KeyboardEvent) {
  const escape = event.key === 'Escape' && !event.metaKey
  const back = event.key === '[' && event.metaKey
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    (!escape && !back)
  )
    return
  const document = event.currentTarget as Document
  const focused = document.activeElement
  if (focused?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
    return
  if ([...document.querySelectorAll<HTMLElement>('[role="menu"]')].some(visible)) return
  const modal = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
    .filter(visible)
    .at(-1)
  // VoiceOver's two-finger scrub sends Escape. Let the top dialog consume it
  // through the native cancel event, even if it contains a navigator.
  if (escape && modal) return
  const candidates = [...(documents.get(document) ?? [])].filter(
    target => target.enabled() && visible(target.host) && (!modal || modal.contains(target.host)),
  )
  // Focus selects a branch. With no focus, only an unambiguous visible leaf owns it.
  const focusedBranch = candidates.filter(target => focused && target.host.contains(focused))
  const branch = focusedBranch.length ? focusedBranch : candidates
  const leaves = branch.filter(
    target => !branch.some(other => other !== target && target.host.contains(other.host)),
  )
  if (leaves.length !== 1 || !leaves[0]!.canPop()) return
  event.preventDefault()
  leaves[0]!.pop()
}
