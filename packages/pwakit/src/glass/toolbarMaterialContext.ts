import { createContext, createElement, type ReactNode } from 'react'
import type { Glass, GlassShape } from './regions.ts'

/** Navigation glass items own material independently of entry content opacity. */
export const ToolbarMaterialContext = createContext(false)

export type ToolbarMaterial = {
  glass: Glass
  shape: GlassShape
  press?: 'button' | 'bar' | 'menu'
}

/** A child describes the slot's material without registering a second renderer region. */
export const toolbarMaterials = new WeakMap<HTMLElement, ToolbarMaterial>()

/** Each run of top-level glass items gets a persistent placement/index owner. */
export function toolbarMaterialOwner(content: HTMLElement | null | undefined) {
  const slot = content?.closest<HTMLElement>('[data-satin-navigation-toolbar-slot]')
  if (!slot || !content) return
  const runs = toolbarMaterialRuns(slot)
  const index = runs.findIndex(run => run.some(item => item === content || item.contains(content)))
  if (index < 0) return
  return slot
    .closest('[data-satin-navigation-chrome]')
    ?.querySelector<HTMLElement>(
      `[data-satin-toolbar-glass="${slot.dataset.satinNavigationToolbarSlot}"][data-satin-toolbar-glass-item="${index}"]`,
    )
}

export function toolbarMaterialItems(slot: HTMLElement | undefined) {
  return [...(slot?.querySelectorAll<HTMLElement>('[data-satin-glass-slot-content]') ?? [])].filter(
    item => !item.parentElement?.closest('[data-satin-glass-slot-content]'),
  )
}

/** Items of consecutive `ToolbarItem`s (one each, with no spacer between) share one glass capsule,
 * as iOS 26+ merges adjacent bar items of a placement. The principal placement never merges. */
export function toolbarMaterialRuns(slot: HTMLElement | undefined) {
  const runs: HTMLElement[][] = []
  let previous: Element | null = null
  for (const item of toolbarMaterialItems(slot)) {
    const wrapper = item.closest('[data-satin-toolbar-item="item"]')
    const joins =
      slot?.dataset.satinNavigationToolbarSlot !== 'principal' &&
      wrapper !== null &&
      previous !== null &&
      previous.nextElementSibling === wrapper &&
      toolbarMaterialItems(wrapper as HTMLElement).length === 1
    if (joins) runs.at(-1)!.push(item)
    else runs.push([item])
    previous = wrapper && toolbarMaterialItems(wrapper as HTMLElement).length === 1 ? wrapper : null
  }
  return runs
}

/** SearchDrawer hides the bar items of a screen presenting search; they own no glass. */
export function toolbarSearchHidden(element: HTMLElement) {
  return Boolean(element.closest('[data-satin-entry-toolbar][data-satin-search-presented]'))
}

const materialContents = new WeakMap<HTMLElement, HTMLElement>()
export function bindToolbarMaterialContent(material: HTMLElement, content: HTMLElement) {
  materialContents.set(material, content)
}

export function toolbarMaterialContent(material: HTMLElement) {
  return materialContents.get(material) ?? material
}

/** Every content item carried by the same glass capsule as this trigger. */
export function toolbarMenuContents(trigger: HTMLElement | null | undefined) {
  const slot = trigger?.closest<HTMLElement>('[data-satin-navigation-toolbar-slot]')
  return (
    toolbarMaterialRuns(slot ?? undefined).find(run =>
      run.some(item => item === trigger || (trigger && item.contains(trigger))),
    ) ?? (trigger ? [trigger] : [])
  )
}

/* Keep Menu trigger geometry local to its presentation context. */
export function toolbarMenuTrigger(trigger: HTMLElement | null | undefined) {
  const slot = trigger?.closest<HTMLElement>('[data-satin-navigation-toolbar-slot]')
  return (
    toolbarMaterialItems(slot ?? undefined).find(
      item => item === trigger || (trigger && item.contains(trigger)),
    ) ?? trigger
  )
}

/** A portal must have its canvas on its first commit, before first-show readiness binds. */
export function ToolbarMaterialPortal({ children }: { children: ReactNode }) {
  return createElement(ToolbarMaterialContext, { value: false }, children)
}
