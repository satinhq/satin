import type { Animation } from './animationValue.ts'

/** Layout owners capture before React commits and animate after every owner has committed. */
type Capture = () => (animation: Animation | null) => void
const captures = new Set<Capture>()
let depth = 0

export function registerLayoutAnimation(capture: Capture) {
  captures.add(capture)
  return () => {
    captures.delete(capture)
  }
}

export function isLayoutTransaction() {
  return depth > 0
}

export function commitAnimatedLayout(animation: Animation, update: () => void) {
  // An inner withAnimation joins the outer synchronous commit.
  if (depth) return update()
  const completions = [...captures].map(capture => capture())
  depth++
  let committed = false
  try {
    update()
    committed = true
  } finally {
    depth--
    for (const complete of completions) complete(committed ? animation : null)
  }
}
