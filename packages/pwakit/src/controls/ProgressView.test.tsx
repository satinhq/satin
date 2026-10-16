// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { ProgressView } from './ProgressView.tsx'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
const root = createRoot(container)
afterEach(() => act(() => root.render(null)))

it('announces clamped determinate progress and removes the value for indeterminate work', () => {
  act(() => root.render(<ProgressView label="Download" value={15} total={10} />))
  const progress = container.querySelector('[role="progressbar"]')!
  expect(progress.getAttribute('aria-valuenow')).toBe('10')
  expect(progress.getAttribute('aria-valuemax')).toBe('10')
  expect(progress.getAttribute('aria-labelledby')).toBeTruthy()
  act(() => root.render(<ProgressView label="Loading" />))
  expect(container.querySelector('[role="progressbar"]')!.hasAttribute('aria-valuenow')).toBe(false)
})

it('honors circular determinate and linear indeterminate styles', () => {
  act(() => root.render(<ProgressView value={0.4} label="Download" progressViewStyle="circular" />))
  expect(container.querySelector('[role="progressbar"] svg')).not.toBeNull()
  act(() => root.render(<ProgressView label="Loading" progressViewStyle="linear" />))
  expect(container.querySelector('[data-satin-progress-track]')).not.toBeNull()
  expect(container.querySelector('[role="progressbar"]')!.hasAttribute('aria-valuenow')).toBe(false)
})
