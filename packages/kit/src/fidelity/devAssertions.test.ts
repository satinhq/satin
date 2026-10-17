import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  describeElement,
  findDocumentScrollViolation,
  findHistoryGrowthViolation,
  findInputFontSizeViolation,
  findPopstateViolation,
  findUndeclaredScrollViolations,
  formatFidelityViolation,
  reportNavigatorHistoryChange,
} from './devAssertions.ts'

class TestClassList extends Array<string> {}

class TestElement {
  readonly attributes = new Map<string, string>()
  readonly children: TestElement[] = []
  readonly classList = new TestClassList()
  clientHeight = 0
  clientWidth = 0
  id = ''
  parent: TestElement | undefined
  scrollHeight = 0
  scrollWidth = 0
  readonly tagName: string

  constructor(tagName: string) {
    this.tagName = tagName
  }

  append(...children: TestElement[]) {
    for (const child of children) {
      child.parent = this
      this.children.push(child)
    }
  }

  closest(selector: string): TestElement | null {
    if (selector !== '[data-satin-scroll]') return null
    if (this.attributes.has('data-satin-scroll')) return this
    return this.parent?.closest(selector) ?? null
  }

  hasAttribute(name: string) {
    return this.attributes.has(name)
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  getBoundingClientRect() {
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }
  }

  querySelectorAll() {
    const descendants: TestElement[] = []
    const visit = (element: TestElement) => {
      for (const child of element.children) {
        descendants.push(child)
        visit(child)
      }
    }
    visit(this)
    return descendants
  }
}

class TestHTMLElement extends TestElement {
  isContentEditable = false
}

class TestInputElement extends TestHTMLElement {
  type = 'text'

  constructor() {
    super('INPUT')
  }
}

class TestTextAreaElement extends TestHTMLElement {
  constructor() {
    super('TEXTAREA')
  }
}

function asElement(element: TestElement) {
  return element as unknown as Element
}

beforeEach(() => {
  vi.stubGlobal('Element', TestElement)
  vi.stubGlobal('HTMLElement', TestHTMLElement)
  vi.stubGlobal('HTMLInputElement', TestInputElement)
  vi.stubGlobal('HTMLTextAreaElement', TestTextAreaElement)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dev fidelity assertion logic', () => {
  it('names a scrollable document and its likely overflowing child', () => {
    const html = new TestHTMLElement('HTML')
    html.scrollHeight = 900
    html.scrollWidth = 390
    const body = new TestHTMLElement('BODY')
    const offender = new TestHTMLElement('SECTION')
    offender.id = 'too-tall'
    offender.getBoundingClientRect = () => ({
      bottom: 900,
      height: 900,
      left: 0,
      right: 390,
      top: 0,
      width: 390,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    })
    body.append(offender)
    const documentObject = {
      body,
      documentElement: html,
      scrollingElement: html,
    } as unknown as Document

    const violation = findDocumentScrollViolation(documentObject, {
      height: 800,
      width: 390,
    })

    expect(violation?.invariant).toBe('document-scroll')
    expect(violation?.offender).toBe(offender)
    expect(violation?.message).toContain('900')
  })

  it('reports only browser-history growth', () => {
    const html = asElement(new TestHTMLElement('HTML'))
    expect(findHistoryGrowthViolation(2, 2, html)).toBeUndefined()
    expect(findHistoryGrowthViolation(2, 1, html)).toBeUndefined()

    const violation = findHistoryGrowthViolation(2, 3, html)
    expect(violation?.invariant).toBe('history-growth')
    expect(violation?.message).toContain('grew from 2 to 3')
  })

  it('reports popstate and navigator-operation history changes', () => {
    const html = asElement(new TestHTMLElement('HTML'))
    const popstate = findPopstateViolation(html)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(popstate.invariant).toBe('popstate')
    expect(popstate.message).toContain('Browser session history')
    expect(reportNavigatorHistoryChange('push', 2, 2, { entries: [] })).toBe(false)
    expect(reportNavigatorHistoryChange('push', 2, 3, { entries: [] })).toBe(true)
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[Satin fidelity: navigator-history-change]'),
      expect.objectContaining({ operation: 'push' }),
    )
  })

  it('rejects a focused text control below 16px without flagging non-text inputs', () => {
    const input = new TestInputElement()
    input.id = 'unsafe-input'
    const violation = findInputFontSizeViolation(
      asElement(input),
      () => ({ fontSize: '15px' }) as CSSStyleDeclaration,
    )

    expect(violation?.invariant).toBe('input-font-size')
    expect(describeElement(violation!.offender)).toBe('<input#unsafe-input>')
    expect(
      findInputFontSizeViolation(
        asElement(input),
        () => ({ fontSize: '16px' }) as CSSStyleDeclaration,
      ),
    ).toBeUndefined()

    input.type = 'checkbox'
    expect(
      findInputFontSizeViolation(
        asElement(input),
        () => ({ fontSize: '12px' }) as CSSStyleDeclaration,
      ),
    ).toBeUndefined()
  })

  it('allows the declared surface itself but still inspects its descendants', () => {
    const root = new TestHTMLElement('BODY')
    const undeclared = new TestHTMLElement('DIV')
    const declared = new TestHTMLElement('DIV')
    const declaredChild = new TestHTMLElement('DIV')
    declared.attributes.set('data-satin-scroll', 'primary')
    declared.append(declaredChild)
    root.append(undeclared, declared)

    for (const element of [undeclared, declared, declaredChild]) {
      element.clientHeight = 100
      element.clientWidth = 100
      element.scrollHeight = 180
      element.scrollWidth = 100
    }

    const violations = findUndeclaredScrollViolations(
      root as unknown as ParentNode,
      () =>
        ({
          overflow: '',
          overflowX: 'hidden',
          overflowY: 'auto',
        }) as CSSStyleDeclaration,
    )

    expect(violations).toHaveLength(2)
    expect(violations[0]?.offender).toBe(undeclared)
    expect(violations[1]?.offender).toBe(declaredChild)
  })

  it('formats a loud invariant name and likely offender', () => {
    const offender = new TestInputElement()
    offender.classList.push('too-small')
    const violation = findInputFontSizeViolation(
      asElement(offender),
      () => ({ fontSize: '12px' }) as CSSStyleDeclaration,
    )

    expect(formatFidelityViolation(violation!)).toBe(
      '[Satin fidelity: input-font-size] Focused text control computes to 12px. ' +
        'iOS may zoom the page below 16px. Set the control itself to at least 16 CSS pixels ' +
        'and adjust visual density through layout. Likely offender: <input.too-small>',
    )
  })
})
