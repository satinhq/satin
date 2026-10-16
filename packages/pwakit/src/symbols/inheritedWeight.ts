import { useLayoutEffect, useState, type RefObject } from 'react'
import { symbolWeightForFont } from './metrics.ts'
import type { SymbolWeight } from './types.ts'

// A shared observer only reads styles for glyphs below changed font-bearing ancestors.
// Transform/opacity animation writes must not schedule O(symbol-count) style reads.
const subscriptions = new Map<Element, () => void>()
const pending = new Set<Element>()
let observer: MutationObserver | undefined
let frame: number | undefined
const mediaQueries: MediaQueryList[] = []
function schedule(elements: Iterable<Element>) {
  for (const element of elements) pending.add(element)
  if (!pending.size || frame !== undefined) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    const updates = [...pending]
    pending.clear()
    for (const element of updates) subscriptions.get(element)?.()
  })
}
function refresh() {
  schedule(subscriptions.keys())
}
function fontDeclarations(style: string | null) {
  return (style ?? '')
    .split(';')
    .filter(declaration => /^\s*(?:font(?:-[\w-]+)?|all|--[\w-]+)\s*:/.test(declaration))
    .join(';')
}
function onMutations(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    const target =
      mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
    if (!target) continue
    if (
      target.closest('style') ||
      [...mutation.addedNodes].some(
        node => node instanceof Element && node.matches('style, link[rel="stylesheet"]'),
      )
    ) {
      refresh()
      continue
    }
    if (mutation.type !== 'attributes') continue
    if (
      target.hasAttribute('data-satin-symbol') &&
      mutation.attributeName?.startsWith('data-satin-symbol')
    )
      continue
    if (
      mutation.attributeName === 'style' &&
      fontDeclarations(mutation.oldValue) === fontDeclarations(target.getAttribute('style'))
    )
      continue
    schedule([...subscriptions.keys()].filter(element => target.contains(element)))
  }
}
export function useInheritedSymbolWeight(
  ref: RefObject<SVGSVGElement | null>,
  explicit?: SymbolWeight,
) {
  const [weight, setWeight] = useState<SymbolWeight>('regular')
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || explicit) return
    const update = () => setWeight(symbolWeightForFont(getComputedStyle(element).fontWeight))
    update()
    subscriptions.set(element, update)
    if (!observer) {
      observer = new MutationObserver(onMutations)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        characterData: true,
        subtree: true,
      })
      window.addEventListener('resize', refresh)
      document.addEventListener('transitionend', refresh)
      document.fonts?.addEventListener('loadingdone', refresh)
      if (window.matchMedia)
        for (const query of [
          '(prefers-color-scheme: dark)',
          '(prefers-contrast: more)',
          '(prefers-reduced-motion: reduce)',
        ]) {
          const media = window.matchMedia(query)
          media.addEventListener('change', refresh)
          mediaQueries.push(media)
        }
    }
    return () => {
      subscriptions.delete(element)
      pending.delete(element)
      if (!subscriptions.size) {
        observer?.disconnect()
        observer = undefined
        window.removeEventListener('resize', refresh)
        document.removeEventListener('transitionend', refresh)
        document.fonts?.removeEventListener('loadingdone', refresh)
        for (const media of mediaQueries.splice(0)) media.removeEventListener('change', refresh)
        if (frame !== undefined) cancelAnimationFrame(frame)
        frame = undefined
        pending.clear()
      }
    }
  }, [ref, explicit])
  return explicit ?? weight
}
