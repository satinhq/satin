import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// The general Menu is a portal outside the app root and its rows are captured into glass ink,
// so its colours, direction and type size must come from its own rules.
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
/** The declarations of the first rule whose selector is exactly `selector`. */
const rule = (selector: string) => {
  const start = css.indexOf('\n' + selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

it('gives a general menu its own label colour in both appearances and a destructive red', () => {
  expect(css).toContain(
    '\n[data-satin-general-menu] {\n  --satin-action-destructive: #ff383c;\n  color: #000;\n}',
  )
  expect(rule(":where(html[data-satin-appearance='dark']) [data-satin-general-menu]")).toMatch(
    /--satin-action-destructive: #ff4245;\s+color: #fff;/,
  )
  // Destructive rows take that red through the shared action-menu rule.
  expect(rule('[data-satin-action-menu] [data-destructive]')).toContain(
    'color: var(--satin-action-destructive)',
  )
  // The old direct-child rule never matched (ActionMenu wraps the rows).
  expect(css).not.toContain('[data-satin-menu-scroll] > button[data-destructive]')
})

it('lays out menu rows by writing direction, not physical left', () => {
  expect(
    rule(
      "[data-satin-general-menu]\n  [data-satin-action-menu]\n  :is([role='menuitem'], [role='menuitemradio']):has(> [data-satin-menu-symbol])",
    ),
  ).toContain('padding-inline-start: 56px')
  expect(rule("[data-satin-action-menu] :is([role='menuitem'], [role='menuitemradio'])")).toContain(
    'text-align: start',
  )
})

it('scales menu text with the system body size (Dynamic Type) from its own panel', () => {
  expect(rule("  [data-satin-menu-panel='true']")).toMatch(
    /font: -apple-system-body;\s+--satin-text-scale: calc\(1em \/ 17px\);/,
  )
  expect(rule('  [data-satin-general-menu]')).toContain(
    'font-size: calc(17px * var(--satin-text-scale))',
  )
})

// Owner, Oct 8: native menus draw separators only between sections, never above the first one.
it('starts the first action section without an extra separator or empty top band', () => {
  expect(css).not.toContain('\n[data-satin-action-section] {')
  const boundary = rule('[data-satin-action-section]:not(:first-child)')
  expect(boundary).toContain('border-top: 1px')
  expect(boundary).toContain('margin-block: 10px 0')
})
