export type FidelityInvariant =
  | 'document-scroll'
  | 'history-growth'
  | 'input-font-size'
  | 'navigator-history-change'
  | 'popstate'
  | 'undeclared-scroll-surface'

export type FidelityViolation = {
  invariant: FidelityInvariant
  message: string
  offender: Element
}

type StyleReader = (element: Element) => CSSStyleDeclaration

const TEXT_INPUT_TYPES = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

function hasScrollableOverflow(value: string) {
  return value === 'auto' || value === 'scroll'
}

export function describeElement(element: Element) {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const classes = Array.from(element.classList)
    .slice(0, 2)
    .map(name => `.${name}`)
    .join('')
  const role = element.getAttribute('data-satin-role')
  const roleLabel = role ? `[data-satin-role="${role}"]` : ''

  return `<${tag}${id}${classes}${roleLabel}>`
}

function likelyDocumentOverflowOffender(
  documentObject: Document,
  viewportWidth: number,
  viewportHeight: number,
) {
  let likely: Element = documentObject.scrollingElement ?? documentObject.documentElement
  let largestOverflow = 0

  for (const element of documentObject.body?.querySelectorAll('*') ?? []) {
    const bounds = element.getBoundingClientRect()
    const overflow = Math.max(
      0,
      bounds.right - viewportWidth,
      bounds.bottom - viewportHeight,
      -bounds.left,
      -bounds.top,
    )

    if (overflow > largestOverflow) {
      likely = element
      largestOverflow = overflow
    }
  }

  return likely
}

export function findDocumentScrollViolation(
  documentObject: Document,
  viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  },
): FidelityViolation | undefined {
  const scrollingElement = documentObject.scrollingElement ?? documentObject.documentElement
  const verticalOverflow = scrollingElement.scrollHeight - viewport.height
  const horizontalOverflow = scrollingElement.scrollWidth - viewport.width

  if (verticalOverflow <= 1 && horizontalOverflow <= 1) return

  return {
    invariant: 'document-scroll',
    message:
      `The document is scrollable (${scrollingElement.scrollWidth}x${scrollingElement.scrollHeight}) ` +
      `outside the ${viewport.width}x${viewport.height} layout viewport. ` +
      'Keep the document fixed and move intentional scrolling into data-satin-scroll.',
    offender: likelyDocumentOverflowOffender(documentObject, viewport.width, viewport.height),
  }
}

export function findHistoryGrowthViolation(
  initialLength: number,
  currentLength: number,
  documentElement: Element,
): FidelityViolation | undefined {
  if (currentLength <= initialLength) return

  return {
    invariant: 'history-growth',
    message:
      `Browser history grew from ${initialLength} to ${currentLength} after SatinRoot mounted. ` +
      "Internal navigation must use Satin's in-memory stack, never a browser-history router.",
    offender: documentElement,
  }
}

export function findPopstateViolation(documentElement: Element): FidelityViolation {
  return {
    invariant: 'popstate',
    message:
      'A popstate event fired. Browser session history must not drive Satin navigation. ' +
      'Inspect the logged event state and the current history length.',
    offender: documentElement,
  }
}

export function reportNavigatorHistoryChange(
  operation: string,
  initialLength: number,
  currentLength: number,
  navigatorState: unknown,
) {
  if (currentLength === initialLength) return false

  console.error(
    '[Satin fidelity: navigator-history-change] ' +
      `Browser history changed from ${initialLength} to ${currentLength} during ${operation}. ` +
      'Satin navigator operations must only update the in-memory screen stack.',
    { navigatorState, operation },
  )
  return true
}

export function isTextControl(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type)
  return element instanceof HTMLElement && element.isContentEditable
}

export function findInputFontSizeViolation(
  element: Element,
  readStyle: StyleReader = target => getComputedStyle(target),
): FidelityViolation | undefined {
  if (!isTextControl(element)) return

  const fontSize = Number.parseFloat(readStyle(element).fontSize)
  if (!Number.isFinite(fontSize) || fontSize >= 16) return

  return {
    invariant: 'input-font-size',
    message:
      `Focused text control computes to ${fontSize}px. iOS may zoom the page below 16px. ` +
      'Set the control itself to at least 16 CSS pixels and adjust visual density through layout.',
    offender: element,
  }
}

export function findUndeclaredScrollViolations(
  root: ParentNode,
  readStyle: StyleReader = target => getComputedStyle(target),
): FidelityViolation[] {
  const violations: FidelityViolation[] = []

  for (const element of root.querySelectorAll('*')) {
    if (element.hasAttribute('data-satin-scroll')) continue
    if (
      element.tagName === 'TEXTAREA' &&
      element.hasAttribute('data-satin-text-editor') &&
      element.closest('[data-satin-scroll-axis="vertical"]')
    )
      continue

    const style = readStyle(element)
    const overflowX = style.overflowX || style.overflow
    const overflowY = style.overflowY || style.overflow
    const scrollsHorizontally =
      hasScrollableOverflow(overflowX) && element.scrollWidth > element.clientWidth + 1
    const scrollsVertically =
      hasScrollableOverflow(overflowY) && element.scrollHeight > element.clientHeight + 1

    if (!scrollsHorizontally && !scrollsVertically) continue

    violations.push({
      invariant: 'undeclared-scroll-surface',
      message:
        `An undeclared element scrolls with overflow-x:${overflowX} and overflow-y:${overflowY}. ` +
        'Render scrolling content through Satin ScrollSurface; raw overflow containers are not declared runtime surfaces.',
      offender: element,
    })
  }

  return violations
}

function violationKey(violation: FidelityViolation) {
  return `${violation.invariant}:${describeElement(violation.offender)}`
}

export function formatFidelityViolation(violation: FidelityViolation) {
  return (
    `[Satin fidelity: ${violation.invariant}] ${violation.message} ` +
    `Likely offender: ${describeElement(violation.offender)}`
  )
}

function reportViolation(violation: FidelityViolation, reported: Set<string>) {
  const key = violationKey(violation)
  if (reported.has(key)) return

  reported.add(key)
  console.error(formatFidelityViolation(violation), violation.offender)
}

export function startDevFidelityAssertions(initialHistoryLength = window.history.length) {
  const reported = new Set<string>()

  const report = (violation: FidelityViolation | undefined) => {
    if (violation) reportViolation(violation, reported)
  }
  const scan = () => {
    report(findDocumentScrollViolation(document))
    report(
      findHistoryGrowthViolation(
        initialHistoryLength,
        window.history.length,
        document.documentElement,
      ),
    )

    for (const violation of findUndeclaredScrollViolations(document.body)) {
      report(violation)
    }
  }
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Element) {
      report(findInputFontSizeViolation(event.target))
    }
  }
  const onDocumentScroll = (event: Event) => {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    if (
      event.target !== document &&
      event.target !== document.documentElement &&
      event.target !== document.body &&
      event.target !== scrollingElement
    ) {
      return
    }

    report({
      invariant: 'document-scroll',
      message:
        'A document-level scroll event fired. The Satin document must stay inert; inspect layout overflow and undeclared scroll containers.',
      offender: scrollingElement,
    })
  }
  const onPopstate = (event: PopStateEvent) => {
    const violation = findPopstateViolation(document.documentElement)
    console.error(formatFidelityViolation(violation), {
      eventState: event.state,
      historyLength: window.history.length,
    })
    scan()
  }

  const initialScan = window.setTimeout(scan, 0)
  const periodicScan = window.setInterval(scan, 1_000)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('scroll', onDocumentScroll, true)
  window.addEventListener('scroll', onDocumentScroll, { passive: true })
  window.addEventListener('popstate', onPopstate)

  return () => {
    window.clearTimeout(initialScan)
    window.clearInterval(periodicScan)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('scroll', onDocumentScroll, true)
    window.removeEventListener('scroll', onDocumentScroll)
    window.removeEventListener('popstate', onPopstate)
  }
}
