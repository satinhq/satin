import { contextBackdrop } from './contextBackdrop.ts'
// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { watchPresentationBackdrop } from './presentationBackdrop.ts'
it('prepares newly exposed sheet content when entrance ends, even outside resident source bounds', async () => {
  const page = document.createElement('main')
  const sheet = document.createElement('dialog')
  page.append(sheet)
  const prepare = vi.fn()
  const release = watchPresentationBackdrop(page, prepare)
  sheet.setAttribute('data-satin-presentation-moving', 'entrance')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(prepare).not.toHaveBeenCalled()
  sheet.removeAttribute('data-satin-presentation-moving')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(prepare).toHaveBeenCalledOnce()
  release()
})

it('prepares and removes the dimmed backdrop when a context menu portals outside the scene', async () => {
  const prepared: (number | undefined)[] = []
  const release = watchPresentationBackdrop(document.body, () => {
    prepared.push(contextBackdrop(document)?.alpha)
  })
  const menu = document.createElement('div')
  menu.setAttribute('data-satin-context-backdrop-active', 'true')
  try {
    document.body.append(menu)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(prepared.at(-1)).toBe(0.2)
    menu.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(prepared.at(-1)).toBeUndefined()
  } finally {
    release()
    menu.remove()
  }
})

it('releases deferred source damage when a menu settles or detaches', async () => {
  const menu = document.createElement('div')
  menu.dataset.satinMenuPanel = 'true'
  menu.dataset.satinMenuPhase = 'open'
  menu.dataset.satinMenuRows = 'glass'
  document.body.append(menu)
  const prepare = vi.fn()
  const release = watchPresentationBackdrop(document.body, prepare)
  try {
    menu.dataset.satinMenuRows = 'dom'
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(prepare).toHaveBeenCalledOnce()
    menu.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(prepare).toHaveBeenCalledTimes(2)
  } finally {
    release()
    menu.remove()
  }
})
