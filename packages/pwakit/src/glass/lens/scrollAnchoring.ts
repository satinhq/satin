export type ScrollAnchorSample = Readonly<{
  latencyMs: number
  residualCssPx: number
  timestampMs: number
  velocityCssPxPerSecond: number
}>

export type ScrollAnchorSummary = Readonly<{
  absoluteMaxCssPx: number
  absoluteP50CssPx: number
  absoluteP95CssPx: number
  latencyP50Ms: number
  mode: 'combined'
  sampleCount: number
}>

function percentile(values: readonly number[], fraction: number) {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0
}

export function summarizeScrollAnchorSamples(
  samples: readonly ScrollAnchorSample[],
): ScrollAnchorSummary {
  const absolute = samples.map(sample => Math.abs(sample.residualCssPx))
  return {
    absoluteMaxCssPx: absolute.reduce((maximum, value) => Math.max(maximum, value), 0),
    absoluteP50CssPx: percentile(absolute, 0.5),
    absoluteP95CssPx: percentile(absolute, 0.95),
    latencyP50Ms: percentile(
      samples.map(sample => sample.latencyMs),
      0.5,
    ),
    mode: 'combined',
    sampleCount: samples.length,
  }
}
