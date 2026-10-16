// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { List, Row } from './ListForm.tsx'

afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  delete document.documentElement.dataset.satinAppearance
})
for (const appearance of ['light', 'dark']) {
  it.each(['plain', 'grouped', 'insetGrouped'] as const)(
    `preserves caller backgrounds in ${appearance} %s lists`,
    variant => {
      document.documentElement.dataset.satinAppearance = appearance
      const sheet = document.createElement('style')
      // Authored CSS loaded first must still override a hidden system fill.
      sheet.textContent =
        '.hearth { background-image: linear-gradient(red, blue); background-color: rgb(10, 20, 30); }' +
        readFileSync('src/styles.css', 'utf8').replaceAll('\n', ' ')
      document.head.append(sheet)
      document.body.innerHTML = renderToStaticMarkup(
        <List id="hearth" variant={variant} className="hearth" scrollContentBackground="hidden">
          <Row label="Lights" />
        </List>,
      )
      const list = document.querySelector<HTMLElement>('[data-satin-list]')!
      expect(getComputedStyle(list).backgroundImage).toBe('linear-gradient(red, blue)')
      expect(getComputedStyle(list).backgroundColor).toBe('rgb(10, 20, 30)')
      list.className = ''
      expect(getComputedStyle(list).backgroundColor).toBe('transparent')
    },
  )
}
