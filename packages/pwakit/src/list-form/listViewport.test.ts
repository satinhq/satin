import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
it('bounds primary lists to their screen instead of growing beyond the scroll viewport', () => {
  expect(css).toMatch(/\[data-satin-list\]\[data-satin-primary='true'\]\s*\{[^}]*height: 100%/)
})

it('gives explicit bordered buttons a native row allocation rather than browser button layout', () => {
  expect(css).toMatch(
    /\[data-satin-section-item\]:has\(> \[data-satin-button-style='borderedProminent'\]\)[^{]*\{[^}]*padding: 15px 20px/,
  )
  expect(css).toMatch(/\[data-satin-button-style='borderedProminent'\]\s*\{[^}]*font:/)
})
