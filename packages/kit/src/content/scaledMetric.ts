import { useSyncExternalStore } from 'react'
import type { TextStyle } from './content.tsx'
import { contentFonts, contentTypography } from './typography.ts'

function createMetricStore(style: TextStyle) {
  const listeners = new Set<() => void>()
  let probe: HTMLSpanElement | null = null
  let observer: ResizeObserver | null = null
  let scale = 1
  const measure = () => {
    if (!probe) return
    const fontSize = Number.parseFloat(getComputedStyle(probe).fontSize)
    const next =
      Number.isFinite(fontSize) && fontSize > 0 ? fontSize / contentTypography[style].size : 1
    if (next === scale) return
    scale = next
    listeners.forEach(listener => listener())
  }
  return {
    snapshot: () => scale,
    subscribe(listener: () => void) {
      listeners.add(listener)
      if (!probe) {
        probe = document.createElement('span')
        probe.setAttribute('aria-hidden', 'true')
        // One shared, invisible em box per subscribed style. Font changes resize it without
        // a per-frame read or a global text policy. Last unsubscription removes all work.
        Object.assign(probe.style, {
          position: 'absolute',
          top: '0',
          left: '0',
          visibility: 'hidden',
          pointerEvents: 'none',
          width: '1em',
          height: '1em',
          overflow: 'hidden',
          font: contentFonts[style],
        })
        document.body.append(probe)
        observer = new ResizeObserver(measure)
        observer.observe(probe)
        measure()
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          observer?.disconnect()
          observer = null
          probe?.remove()
          probe = null
          scale = 1
        }
      }
    },
  }
}
const stores = new Map<TextStyle, ReturnType<typeof createMetricStore>>()

/** Scale a dimension by the target WebKit system text style's Dynamic Type ratio. */
export function useScaledMetric(value: number, relativeTo: TextStyle = 'body'): number {
  if (!Number.isFinite(value)) throw new Error('useScaledMetric requires a finite value.')
  let store = stores.get(relativeTo)
  if (!store) {
    store = createMetricStore(relativeTo)
    stores.set(relativeTo, store)
  }
  const scale = useSyncExternalStore(store.subscribe, store.snapshot, () => 1)
  return value * scale
}
