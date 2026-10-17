// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IgnoresSafeArea } from './modifiers.tsx'

it('keeps a primary scroll frame bounded when responsive ignored edges become empty', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
  document.head.append(style)
  const host = document.createElement('div')
  document.body.append(host)
  try {
    for (const edges of ['top', [], 'top'] as const) {
      host.innerHTML = renderToStaticMarkup(
        <IgnoresSafeArea edges={edges}>
          <div data-satin-primary="true" />
        </IgnoresSafeArea>,
      )
      expect(getComputedStyle(host.firstElementChild!).height).toBe('100%')
      expect(getComputedStyle(host.firstElementChild!).minHeight).toBe('0')
    }
  } finally {
    host.remove()
    style.remove()
  }
})
