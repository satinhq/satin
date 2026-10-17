/// <reference types="@webgpu/types" />
import { submitCanvasCommands } from './canvasSubmission.ts'
import { passTimer } from './passes.ts'
/** Worker frame evidence for the phone probe: per interaction kind, frame intervals,
 * CPU, submit→completion latency and (when the device exposes `timestamp-query`) GPU
 * time per frame. Runs only inside motion loops; the summary is posted once the loop
 * goes idle, so idle stays at zero work. */
export type FrameKind = 'drag' | 'scroll' | 'minimize' | 'menu' | 'navigation' | 'region' | 'other'
export type FrameProbeSample = {
  kind: FrameKind
  interval: number | null
  cpuMs: number
  doneMs?: number
  gpuMs?: number
  passes?: Record<string, number>
  passCount?: number
  restart: boolean
}
export type FrameSummary = {
  kind: FrameKind
  frames: number
  timestampQuery: boolean
  intervals: Stat
  cpuMs: Stat
  submitToDoneMs: Stat
  gpuMs?: Stat
  passMs?: Record<string, Stat>
  passesPerFrame?: Stat
  over20: number
  over34: number
  raw: {
    interval: (number | null)[]
    cpuMs: number[]
    doneMs: (number | null)[]
    gpuMs: (number | null)[]
  }
}
type Stat = { p50: number; p95: number; max: number } | null
const stat = (values: number[]): Stat => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b),
    q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) }
}
const round = (v: number | undefined | null) =>
  v === undefined || v === null ? null : +v.toFixed(2)

const CAPACITY = 96
/** Arms per-pass timestamps for one frame (see passTimer) and reads them back. */
class GPUFrameTimer {
  private queries: GPUQuerySet
  private resolve: GPUBuffer
  private reads: { buffer: GPUBuffer; busy: boolean }[]
  constructor(device: GPUDevice) {
    this.queries = device.createQuerySet({ type: 'timestamp', count: 2 * CAPACITY })
    this.resolve = device.createBuffer({
      size: 16 * CAPACITY,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    })
    this.reads = Array.from({ length: 4 }, () => ({
      buffer: device.createBuffer({
        size: 16 * CAPACITY,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
      busy: false,
    }))
  }
  begin() {
    passTimer.set = this.queries
    passTimer.labels = []
    passTimer.capacity = CAPACITY
  }
  cancel() {
    passTimer.set = undefined
    passTimer.labels = []
  }
  /** Returns a reader of {gpuMs, passes} for this frame, or undefined when no slot is free. */
  end(e: GPUCommandEncoder) {
    const labels = passTimer.labels
    passTimer.set = undefined
    passTimer.labels = []
    const slot = this.reads.find(r => !r.busy)
    if (!slot || !labels.length) return undefined
    e.resolveQuerySet(this.queries, 0, 2 * labels.length, this.resolve, 0)
    e.copyBufferToBuffer(this.resolve, 0, slot.buffer, 0, 16 * labels.length)
    slot.busy = true
    return () =>
      slot.buffer.mapAsync(GPUMapMode.READ, 0, 16 * labels.length).then(
        () => {
          const t = new BigUint64Array(slot.buffer.getMappedRange(0, 16 * labels.length)).slice()
          slot.buffer.unmap()
          slot.busy = false
          let first = t[0],
            last = t[1]
          const passes: Record<string, number> = {}
          labels.forEach((label, i) => {
            const b = t[2 * i],
              en = t[2 * i + 1]
            if (b < first) first = b
            if (en > last) last = en
            passes[label] = (passes[label] ?? 0) + Number(en - b) / 1e6
          })
          return { gpuMs: Number(last - first) / 1e6, passes, count: labels.length }
        },
        () => {
          slot.busy = false
          return undefined
        },
      )
  }
}

export class FrameProbe {
  private samples: FrameProbeSample[] = []
  private timer?: GPUFrameTimer
  private device?: GPUDevice
  private post: (summary: FrameSummary[]) => void
  constructor(post: (summary: FrameSummary[]) => void) {
    this.post = post
  }
  get timestampQuery() {
    return !!this.timer
  }
  useDevice(device: GPUDevice | undefined, gpuTiming = true) {
    this.device = device
    this.timer = undefined
    if (gpuTiming && device?.features.has('timestamp-query'))
      try {
        this.timer = new GPUFrameTimer(device)
      } catch {
        this.timer = undefined
      }
  }
  /** Wraps one frame's encoding and submission. Returns the frame's sample: its completion and
   * GPU times are filled in when they arrive. */
  frame(
    kind: FrameKind,
    interval: number | null,
    restart: boolean,
    encode: (e: GPUCommandEncoder) => void,
    canSubmit: () => boolean = () => true,
  ) {
    const device = this.device
    if (!device) return
    clearTimeout(this.pending)
    this.pending = 0
    const started = performance.now(),
      e = device.createCommandEncoder()
    this.timer?.begin()
    encode(e)
    if (!canSubmit()) {
      this.timer?.cancel()
      return
    }
    const read = this.timer?.end(e)
    const commands = e.finish()
    if (!canSubmit()) return
    submitCanvasCommands(device, e, commands)
    const sample: FrameProbeSample = { kind, interval, restart, cpuMs: performance.now() - started }
    this.samples.push(sample)
    if (this.samples.length > 2400) this.samples.shift()
    const submitted = performance.now()
    void device.queue.onSubmittedWorkDone().then(() => {
      sample.doneMs = performance.now() - submitted
    })
    if (read)
      void read().then(r => {
        if (r) {
          sample.gpuMs = r.gpuMs
          sample.passes = r.passes
          sample.passCount = r.count
        }
      })
    return sample
  }
  /** The loop went idle: summarize its frames by kind once their completions arrive. */
  private pending = 0
  /** The loop went idle. Scroll events restart the loop per event, so a summary waits
   * for 300 ms of quiet (one timer after motion, never a loop), then groups by kind. */
  flush() {
    clearTimeout(this.pending)
    if (!this.samples.length) return
    this.pending = setTimeout(() => {
      this.pending = 0
      this.summarize()
    }, 300) as unknown as number
  }
  private summarize() {
    const samples = this.samples
    this.samples = []
    if (!samples.length) return
    {
      const kinds = [...new Set(samples.map(s => s.kind))]
      this.post(
        kinds.map(kind => {
          const list = samples.filter(s => s.kind === kind),
            intervals = list.filter(s => !s.restart && s.interval !== null).map(s => s.interval!)
          const done = list.flatMap(s => (s.doneMs === undefined ? [] : [s.doneMs])),
            gpu = list.flatMap(s => (s.gpuMs === undefined ? [] : [s.gpuMs]))
          const timed = list.filter(s => s.passes),
            labels = [...new Set(timed.flatMap(s => Object.keys(s.passes!)))]
          const passMs = timed.length
            ? Object.fromEntries(labels.map(l => [l, stat(timed.map(s => s.passes![l] ?? 0))]))
            : undefined
          return {
            kind,
            frames: list.length,
            timestampQuery: this.timestampQuery,
            intervals: stat(intervals),
            cpuMs: stat(list.map(s => s.cpuMs)),
            submitToDoneMs: stat(done),
            gpuMs: gpu.length ? stat(gpu) : undefined,
            passMs,
            passesPerFrame: timed.length ? stat(timed.map(s => s.passCount!)) : undefined,
            over20: intervals.filter(v => v > 20).length,
            over34: intervals.filter(v => v > 34).length,
            raw: {
              interval: list.slice(-240).map(s => (s.restart ? null : round(s.interval))),
              cpuMs: list.slice(-240).map(s => round(s.cpuMs)!),
              doneMs: list.slice(-240).map(s => round(s.doneMs)),
              gpuMs: list.slice(-240).map(s => round(s.gpuMs)),
            },
          }
        }),
      )
    }
  }
}
