/** Menu settlement/removal releases deferred backdrop damage. A presentation's last moving frame can reveal a new source plane, and a presentation held for
 * its first glass needs its content measured before it can show. */
export function watchPresentationBackdrop(root: Element, prepare: () => void) {
  const observer = new MutationObserver(records => {
    if (
      records.some(record =>
        record.type === 'childList'
          ? [...record.addedNodes, ...record.removedNodes].some(
              node =>
                node instanceof Element &&
                (node.matches('[data-satin-context-backdrop-active],[data-satin-menu-panel]') ||
                  node.querySelector(
                    '[data-satin-context-backdrop-active],[data-satin-menu-panel]',
                  )),
            )
          : record.target instanceof Element &&
            (record.attributeName === 'open' ||
              record.attributeName === 'data-satin-menu-phase' ||
              record.attributeName === 'data-satin-menu-rows' ||
              record.attributeName === 'data-satin-context-backdrop-active' ||
              (record.attributeName === 'data-satin-glass-hold'
                ? record.target.hasAttribute('data-satin-glass-hold')
                : !record.target.hasAttribute('data-satin-presentation-moving'))),
      )
    )
      prepare()
  })
  observer.observe(root, {
    subtree: true,
    attributes: true,
    childList: true,
    attributeFilter: [
      'data-satin-presentation-moving',
      'open',
      'data-satin-menu-phase',
      'data-satin-menu-rows',
      'data-satin-context-backdrop-active',
      'data-satin-glass-hold',
    ],
  })
  return () => observer.disconnect()
}
