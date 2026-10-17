/** The divider begins at the label, including arbitrary leading accessories. */
export function separatorInset(
  item: Pick<DOMRect, 'left' | 'right'>,
  label: Pick<DOMRect, 'left' | 'right'>,
  direction: string,
  resolution: number,
  editInset = 0,
): number {
  const distance =
    (direction === 'rtl' ? item.right - label.right : label.left - item.left) - editInset
  const pixelRatio = Number.isFinite(resolution) && resolution > 0 ? resolution : 1
  return Math.max(0, Math.round(distance * pixelRatio) / pixelRatio)
}

/** Resize notifications own geometry changes; scrolling does not remeasure rows. */
export function observeSeparatorInsets(container: HTMLElement): () => void {
  const selector = '[data-satin-row-label], [data-satin-text-field], [data-satin-button-content]'
  let labels: HTMLElement[] = []
  const observed = new Set<Element>()
  const discover = () => {
    labels = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
      label => label.closest('[data-satin-section-item]')?.querySelector(selector) === label,
    )
    const next = new Set<Element>([container])
    for (const label of labels) {
      next.add(label)
      const item = label.closest('[data-satin-section-item]')
      if (item) next.add(item)
    }
    for (const element of observed) {
      if (!next.has(element)) observer.unobserve(element)
    }
    for (const element of next) {
      if (!observed.has(element)) observer.observe(element)
    }
    observed.clear()
    for (const element of next) observed.add(element)
  }
  const update = () => {
    for (const label of labels) {
      // Pending growth and the lifted top-layer row both leave the section's layout space.
      // Those rectangles no longer share a layout coordinate space. Keep the last
      // in-flow inset instead of feeding the preview's scale back into the list.
      if (label.closest('[data-satin-context-lift], [data-satin-context-pending="true"]')) continue
      const item = label.closest<HTMLElement>('[data-satin-section-item]')
      if (!item || item.dataset.satinEditAnimating) continue
      // Edit mode's controls add their own inset in CSS; the measured one excludes it, so the
      // separator follows the label through the edit-mode shift without re-measuring mid-motion.
      const editInset = Number.parseFloat(item.style.getPropertyValue('--satin-edit-leading-inset'))
      const inset = separatorInset(
        item.getBoundingClientRect(),
        label.getBoundingClientRect(),
        getComputedStyle(item).direction,
        window.devicePixelRatio || 1,
        Number.isFinite(editInset) ? editInset : 0,
      )
      const value = `${inset}px`
      if (item.style.getPropertyValue('--satin-row-separator-inset') !== value) {
        item.style.setProperty('--satin-row-separator-inset', value)
      }
    }
  }
  const observer = new ResizeObserver(update)
  discover()
  update()
  // Text/value updates keep the same leading label. Only element replacement needs
  // discovery; size changes are delivered by the retained ResizeObserver.
  const contentObserver = new MutationObserver(records => {
    if (
      records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element),
      )
    ) {
      discover()
      update()
    } else if (
      records.some(
        record =>
          record.type === 'attributes' &&
          record.target instanceof Element &&
          labels.some(label => record.target.contains(label) || label.contains(record.target)),
      )
    ) {
      // A leading accessory or margin can move a label without resizing it.
      update()
    }
  })
  contentObserver.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'hidden'],
  })
  const directionObserver = new MutationObserver(update)
  directionObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['dir'],
    subtree: true,
  })
  return () => {
    observer.disconnect()
    directionObserver.disconnect()
    contentObserver.disconnect()
  }
}
