// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, Fragment, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { Row, Section } from './ListForm.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let container: HTMLDivElement | undefined

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.unstubAllGlobals()
})

describe('section fragment row identity', () => {
  it('gives nested fragment rows separate listitems and only one last row', () => {
    const markup = renderToStaticMarkup(
      <Section>
        <>
          <Row label="First" />
          <>
            {false}
            {null}
            <Row label="Second" />
          </>
        </>
      </Section>,
    )
    expect(markup.match(/role="listitem"/g)).toHaveLength(2)
    expect(markup.match(/data-satin-last-row="true"/g)).toHaveLength(1)
    const renderedSection = document.createElement('div')
    renderedSection.innerHTML = markup
    const items = renderedSection.querySelectorAll('[role="listitem"]')
    expect(items[0]?.textContent).toBe('First')
    expect(items[0]?.hasAttribute('data-satin-last-row')).toBe(false)
    expect(items[1]?.textContent).toBe('Second')
    expect(items[1]?.getAttribute('data-satin-last-row')).toBe('true')
  })

  it('preserves row state across keyed fragment reordering with duplicate local row keys', () => {
    function StatefulRow({ name }: { name: string }) {
      const [originalName] = useState(name)
      return <span data-current-name={name}>{originalName}</span>
    }
    function content(names: string[]) {
      return (
        <Section>
          {names.map(name => (
            <Fragment key={name}>
              <StatefulRow key="row" name={name} />
            </Fragment>
          ))}
        </Section>
      )
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root?.render(content(['First', 'Second'])))
    act(() => root?.render(content(['Second', 'First'])))
    const rows = [...container.querySelectorAll('[role="listitem"]')]
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.textContent)).toEqual(['Second', 'First'])
  })
})
