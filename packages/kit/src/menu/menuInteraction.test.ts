import { describe, expect, it } from 'vitest'
import { MenuInteraction } from './menuInteraction'

describe('menu transition ownership', () => {
  it('submits one window for repeated requests before React can render', () => {
    const menu = new MenuInteraction()
    const open = menu.request(true)!
    expect(menu.request(true)).toBeUndefined()
    expect(menu.phase).toBe('opening')
    expect(menu.complete(open)).toBe(true)
    expect(menu.request(true)).toBeUndefined()
  })
  it('dismisses for content scroll only while open or opening', () => {
    const menu = new MenuInteraction()
    expect(menu.contentScroll()).toBe(false)
    menu.contentContact()
    const token = menu.request(true)!
    expect(menu.contentScroll()).toBe(false)
    menu.contentContact()
    expect(menu.contentScroll()).toBe(true)
    menu.complete(token)
    expect(menu.contentScroll()).toBe(true)
    menu.request(false)
    expect(menu.contentScroll()).toBe(false)
  })
  it('rejects the old completion after reversal and after reset', () => {
    const menu = new MenuInteraction()
    const opening = menu.request(true)!
    const closing = menu.request(false)!
    expect(menu.complete(opening)).toBe(false)
    expect(menu.phase).toBe('closing')
    const reopening = menu.request(true)!
    expect(menu.complete(closing)).toBe(false)
    expect(menu.complete(reopening)).toBe(true)
    expect(menu.phase).toBe('open')
    menu.reset()
    expect(menu.complete(reopening)).toBe(false)
    expect(menu.phase).toBe('closed')
  })
  it('does not let the previous dismissing pan dismiss a reopened menu', () => {
    const menu = new MenuInteraction()
    menu.request(true)
    menu.contentContact()
    expect(menu.contentScroll()).toBe(true)
    menu.request(false)
    menu.request(true)
    expect(menu.contentScroll()).toBe(false)
    menu.contentContact()
    expect(menu.contentScroll()).toBe(true)
  })
})
