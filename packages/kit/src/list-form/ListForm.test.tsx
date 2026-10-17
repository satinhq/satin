import { readFileSync } from 'node:fs'
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  List,
  Section,
  Row,
  RowIcon,
  ToggleRow,
  Toggle,
  PickerRow,
  StepperRow,
  SegmentedControl,
} from './ListForm.tsx'
import {
  SystemScrollRegistryContext,
  NavigationPaneContext,
} from '../navigation/navigationContext.tsx'
import { List as PublicList } from '../public/controls.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { clampStepper, pickerSelection } from './state.ts'

describe('list and form kit', () => {
  it('places separators on every row except the last and keeps static rows inert', () => {
    const html = renderToStaticMarkup(
      <Section header="Account">
        <Row label="Name" value="Alex" />
        <Row label="Version" value="1.0" />
      </Section>,
    )
    expect(html).toContain('data-satin-last-row="true"')
    expect(html.match(/data-satin-section-item="true"/g)).toHaveLength(2)
    expect(html).not.toContain('<button')
  })
  it('renders toggle state as an accessible switch', () => {
    const html = renderToStaticMarkup(<Toggle checked onChange={() => {}} label="Reminders" />)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-label="Reminders"')
  })
  it('resolves picker selection and value announcement', () => {
    const options = [
      { id: 'date', label: 'Date' },
      { id: 'name', label: 'Name' },
    ]
    expect(pickerSelection(options, 'name')).toBe('Name')
    expect(pickerSelection(options, 'missing')).toBeUndefined()
    const menu = renderToStaticMarkup(
      <PickerRow label="Sort by" value="name" onChange={() => {}} options={options} />,
    )
    expect(menu).toContain('aria-label="Sort by, Name"')
    expect(menu).toContain('data-satin-picker-indicator="true"')
    expect(menu).toContain('data-satin-picker-trigger="true"')
    expect(menu).toContain('aria-haspopup="menu"')
    const navigation = renderToStaticMarkup(
      <PickerRow
        label="Sort by"
        value="name"
        onChange={() => {}}
        options={options}
        presentation="navigation"
        onNavigate={() => {}}
      />,
    )
    expect(navigation).toContain('data-satin-settings-disclosure="true"')
    expect(navigation).not.toContain('data-satin-picker-indicator="true"')
  })
  it('clamps stepper bounds and disables bound controls', () => {
    expect(clampStepper(1, 1, 20, -1)).toBe(1)
    expect(clampStepper(20, 1, 20, 1)).toBe(20)
    expect(clampStepper(4, 1, 20, 1)).toBe(5)
    const html = renderToStaticMarkup(
      <StepperRow label="Daily goal" value={1} min={1} max={20} onChange={() => {}} />,
    )
    const decrease = html.match(/<button[^>]*aria-label="Decrease Daily goal, 1"[^>]*>/)?.[0]
    expect(decrease).toContain(' disabled=""')
    expect(html).toContain('aria-label="Daily goal, 1"')
    expect(html).not.toContain('Daily goal: 1')
  })
  it('marks only the selected segment pressed', () => {
    const html = renderToStaticMarkup(
      <SegmentedControl
        value="week"
        onChange={() => {}}
        options={[
          { id: 'day', label: 'Day' },
          { id: 'week', label: 'Week' },
        ]}
      />,
    )
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
  })
})

it('exposes section headings for rotor navigation', () => {
  const html = renderToStaticMarkup(
    <Section header="Controls">
      <Row label="Example" />
    </Section>,
  )
  expect(html).toContain('role="heading" aria-level="2"')
})

it('names a row switch from one painted label without hiding sampled content', () => {
  const html = renderToStaticMarkup(
    <ToggleRow
      checked
      onChange={() => {}}
      label="Notifications"
      leading={<RowIcon symbol="person" color="blue" />}
    />,
  )
  expect(html.match(/role="switch"/g)).toHaveLength(1)
  expect(html.match(/Notifications/g)).toHaveLength(1)
  const labelId = html.match(/aria-labelledby="([^"]+)"/)![1]
  expect(html).toContain(
    `id="${labelId}" data-satin-row-label="true"><span data-satin-row-text="true">Notifications</span></span>`,
  )
  expect(html).not.toMatch(new RegExp(`<span[^>]*id="${labelId}"[^>]*aria-hidden`))
  expect(html).toContain('data-satin-row-icon="true"')
})

it('gives direct list content row semantics while preserving explicit sections', () => {
  const html = renderToStaticMarkup(
    <SystemScrollRegistryContext value={createScrollSurfaceRegistry()}>
      <List id="direct-content">
        Plain text
        <>
          <span>Custom content</span>
          <Row label="Existing row" />
        </>
        <Section header="Group">
          <Row label="Grouped row" />
        </Section>
      </List>
    </SystemScrollRegistryContext>,
  )
  const document = new DOMParser().parseFromString(html, 'text/html')
  const items = document.querySelectorAll('[role="listitem"]')
  expect(items).toHaveLength(4)
  expect(items[0]?.textContent?.trim()).toBe('Plain text')
  expect(items[1]?.textContent).toBe('Custom content')
  expect(document.querySelector('[role="group"]')?.parentElement?.getAttribute('role')).toBe('list')
})

it('uses sidebar rows in a split sidebar while preserving an explicit list style', () => {
  const render = (variant?: 'insetGrouped') =>
    renderToStaticMarkup(
      <SystemScrollRegistryContext value={createScrollSurfaceRegistry()}>
        <NavigationPaneContext value="sidebar">
          <PublicList id="sidebar" listStyle={variant}>
            <Row label="Library" />
          </PublicList>
        </NavigationPaneContext>
      </SystemScrollRegistryContext>,
    )
  expect(render()).toContain('data-satin-list="sidebar"')
  expect(render('insetGrouped')).toContain('data-satin-list="insetGrouped"')
})

it('accepts native compact section spacing without changing the row contents', () => {
  const html = renderToStaticMarkup(
    <SystemScrollRegistryContext value={createScrollSurfaceRegistry()}>
      <List id="compact-sections" listSectionSpacing="compact">
        <Section>
          <Row label="First" />
        </Section>
        <Section header="Next">
          <Row label="Second" />
        </Section>
      </List>
    </SystemScrollRegistryContext>,
  )
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelectorAll('[role="listitem"]')).toHaveLength(2)
  expect(document.body.textContent).toContain('First')
  expect(document.body.textContent).toContain('Second')
})

// Native value rows let both text columns wrap as the available width shrinks.
it('allows long row labels and values to wrap without clipping their text', () => {
  const style = document.createElement('style')
  style.textContent = readFileSync('src/styles.css', 'utf8')
  const host = document.createElement('div')
  const label = 'The Left Hand of Darkness'
  const value = 'Ursula K. Le Guin'
  host.innerHTML = renderToStaticMarkup(<Row label={label} value={value} />)
  document.head.append(style)
  document.body.append(host)
  try {
    const title = host.querySelector('[data-satin-row-label] > span')!
    const author = host.querySelector('[data-satin-row-value] > span')!
    expect(getComputedStyle(title).textOverflow).not.toBe('ellipsis')
    expect(getComputedStyle(title).overflow).not.toBe('hidden')
    expect(getComputedStyle(title).whiteSpace).not.toBe('nowrap')
    expect(getComputedStyle(author).whiteSpace).not.toBe('nowrap')
    expect(title.textContent).toBe(label)
    expect(author.textContent).toBe(value)
  } finally {
    host.remove()
    style.remove()
  }
})

it('preserves an explicit background when the system scroll background is hidden', () => {
  const html = renderToStaticMarkup(
    <List
      id="hearth"
      scrollContentBackground="hidden"
      style={{ background: 'linear-gradient(red, blue)' }}
    >
      <Row label="Lights" />
    </List>,
  )
  expect(html).toContain('background:linear-gradient(red, blue)')
  expect(html).not.toContain('background:transparent')
})
it('leaves class backgrounds in the cascade when the system background is hidden', () => {
  const html = renderToStaticMarkup(
    <List id="hearth" scrollContentBackground="hidden" className="gradient">
      <Row label="Lights" />
    </List>,
  )
  expect(html).not.toContain('background:transparent')
  expect(html).toContain('data-satin-scroll-content-background="hidden"')
})
