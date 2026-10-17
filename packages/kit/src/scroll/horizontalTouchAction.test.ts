import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

// Owner, Oct 8 (Music Home): dragging vertically on the empty part of a horizontal shelf did not
// scroll the page. A horizontal scroller must leave vertical panning to the scroller around it.
it('a horizontal ScrollView allows vertical panning', () => {
  const rule = css.match(/\[data-satin-scroll-axis='horizontal'\]\s*\{([^}]*)\}/)?.[1] ?? ''
  const touchAction = rule.match(/touch-action:\s*([^;]+);/)?.[1].split(/\s+/) ?? []
  expect(touchAction).toContain('pan-x')
  expect(touchAction).toContain('pan-y')
})
