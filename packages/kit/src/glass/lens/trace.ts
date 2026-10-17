/** Persistent step trace: survives a main-thread hang so the next launch can show where it stopped. */
const KEY = 'satinGeometry-trace'
const started = performance.now()
let previous: string[] = []
try {
  previous = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  localStorage.setItem(KEY, '[]')
} catch {
  previous = []
}
let current: string[] = []

export function trace(step: string) {
  current.push(`${((performance.now() - started) / 1000).toFixed(1)}:${step}`)
  if (current.length > 14) current = current.slice(-14)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // ignore
  }
}

export function previousTrace(): string {
  // Latest step first: the hang is at the tail of the previous run.
  return previous.length ? [...previous].reverse().join(' ← ') : '(none)'
}
