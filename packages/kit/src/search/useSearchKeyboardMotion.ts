import { useLayoutEffect, useRef, type RefObject } from 'react'
import { installKeyboardAccessory } from '../keyboard/accessory.ts'

/** The bottom field keeps its carrier after Cancel, until the keyboard has returned to rest. */
export function useSearchKeyboardMotion(
  row: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  presented: boolean,
) {
  const active = useRef(presented)
  active.current = presented
  useLayoutEffect(() => {
    if (!enabled) return
    const toolbar = row.current?.closest<HTMLElement>('[data-satin-navigation-toolbar-slot]')
    if (!toolbar) return
    // The toolbar already resolves safe area and container geometry. Reuse that resting gap.
    return installKeyboardAccessory(
      toolbar,
      () => active.current,
      height => {
        const restGap = Number.parseFloat(getComputedStyle(toolbar).bottom) || 0
        return height > 0 ? -Math.max(0, height + 8 - restGap) : 0
      },
    )
  }, [enabled, row])
}
