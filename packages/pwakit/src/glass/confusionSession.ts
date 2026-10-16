export type ConfusionPair = Readonly<{
  id: string
  backdrop: string
  appearance: 'light' | 'dark'
  state: string
  kind: 'still' | 'clip'
  native: string
  pwa: string
  widthPt: number
  heightPt: number
  frames?: number
  fps?: number
  build: string
}>
export type ConfusionManifest = Readonly<{
  version: string
  status: string
  pairs: readonly ConfusionPair[]
  pending: readonly string[]
}>
export type ConfusionTrial = {
  pairId: string
  nativeLeft: boolean
  guess?: 'left' | 'right'
  guessedAt?: string
  revealed: boolean
}
export type ConfusionSession = {
  id: string
  manifestVersion: string
  startedAt: string
  trials: ConfusionTrial[]
}
function randomInt(max: number) {
  const ceiling = Math.floor(4294967296 / max) * max
  let value: number
  do {
    value = crypto.getRandomValues(new Uint32Array(1))[0]
  } while (value >= ceiling)
  return value % max
}
export function makeConfusionSession(manifest: ConfusionManifest): ConfusionSession {
  const trials = manifest.pairs.map(pair => ({
    pairId: pair.id,
    nativeLeft: randomInt(2) === 0,
    revealed: false,
  }))
  for (let i = trials.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[trials[i], trials[j]] = [trials[j], trials[i]]
  }
  return {
    id: Array.from(crypto.getRandomValues(new Uint32Array(4)), x => x.toString(16)).join('-'),
    manifestVersion: manifest.version,
    startedAt: new Date().toISOString(),
    trials,
  }
}
export function scoreConfusion(trials: readonly ConfusionTrial[]) {
  const scored = trials.filter(t => t.guess !== undefined)
  const hits = scored.filter(t => (t.guess === 'left') === t.nativeLeft).length
  const n = scored.length
  const rate = n ? hits / n : null
  // Wilson interval expresses sampling uncertainty. It is not an equivalence test.
  const z = 1.959963984540054,
    denominator = 1 + (z * z) / Math.max(1, n)
  const center = n ? (hits / n + (z * z) / (2 * n)) / denominator : null
  const half = n
    ? (z * Math.sqrt(((hits / n) * (1 - hits / n)) / n + (z * z) / (4 * n * n))) / denominator
    : null
  return {
    count: n,
    hits,
    hitRate: rate,
    chance: 0.5,
    interval95: center === null || half === null ? null : [center - half, center + half],
  }
}
