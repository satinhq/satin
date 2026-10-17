import { changesMirrorSource } from '../glass/lens/mirrorInvalidation.ts'

const revisions = new WeakMap<Element, number>()
const observers = new Set<MutationObserver>()
function invalidate(records: readonly MutationRecord[]) {
  for (const record of records) {
    if (!changesMirrorSource(record)) continue
    const element = record.target instanceof Element ? record.target : record.target.parentElement
    const panel = element?.closest('[data-satin-tab-panel]')
    if (!panel) continue
    // Visibility is a compositor policy, not a change to the prepared source.
    if (
      element === panel &&
      record.type === 'attributes' &&
      ['data-satin-tab-active', 'data-satin-tab-presented', 'aria-hidden', 'inert'].includes(
        record.attributeName ?? '',
      )
    )
      continue
    revisions.set(panel, (revisions.get(panel) ?? 0) + 1)
  }
}

/** One app-scene observer, shared with source discovery; no observer per hidden tab. */
export function observeTabSources(root: Element) {
  const observer = new MutationObserver(invalidate)
  observer.observe(root, { attributes: true, childList: true, characterData: true, subtree: true })
  observers.add(observer)
  return () => {
    observer.disconnect()
    observers.delete(observer)
  }
}

export function tabSourceRevision(source: Element) {
  // A tab activation can occur in React's layout commit before observer delivery.
  for (const observer of observers) invalidate(observer.takeRecords())
  const panel = source.closest('[data-satin-tab-panel]')
  return panel ? (revisions.get(panel) ?? 0) : undefined
}
