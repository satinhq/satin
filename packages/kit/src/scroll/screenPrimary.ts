/** DOM consumers must observe the screen registry's primary, never a presented descendant's. */
export function screenPrimaryScroller(container: Element | null | undefined) {
  const page = container?.matches('[data-satin-navigation-motion-layer]')
    ? container
    : container?.querySelector(':scope > [data-satin-navigation-motion-layer]')
  if (!page) return null
  const presentation = page.closest('[data-satin-presentation-content]')
  return (
    [...page.querySelectorAll<HTMLElement>('[data-satin-primary="true"]')].find(
      candidate =>
        candidate.closest('[data-satin-navigation-motion-layer]') === page &&
        candidate.closest('[data-satin-presentation-content]') === presentation,
    ) ?? null
  )
}
