/** Opt-in graphics lifecycle telemetry. No readbacks, finish, or shader changes. */
type Event = { at: number; kind: string; [key: string]: unknown }
let emit: ((kind: string, details?: Record<string, unknown>) => void) | undefined
export function recordGraphicsEvent(kind: string, details?: Record<string, unknown>) {
  emit?.(kind, details)
}
export function installGraphicsProbe() {
  const events: Event[] = [],
    frames: unknown[] = [],
    restores: (() => void)[] = []
  const objects = new WeakMap<object, number>()
  let next = 0,
    droppedEvents = 0,
    droppedFrames = 0
  const id = (value: unknown): number | undefined => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return undefined
    let n = objects.get(value as object)
    if (!n) {
      n = ++next
      objects.set(value as object, n)
    }
    return n
  }
  const event = (kind: string, details: Record<string, unknown> = {}) => {
    events.push({ at: performance.now(), kind, ...details })
    if (events.length > 12000) {
      events.shift()
      droppedEvents++
    }
  }
  emit = event
  const wrap = (
    prototype: object,
    name: string,
    observe: (self: unknown, args: unknown[], result: unknown, start: number, end: number) => void,
  ) => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (typeof descriptor?.value !== 'function') {
      event('instrument-unavailable', { name })
      return
    }
    const original = descriptor.value
    try {
      Object.defineProperty(prototype, name, {
        ...descriptor,
        value: function (this: unknown, ...args: unknown[]) {
          const start = performance.now(),
            result = Reflect.apply(original, this, args),
            end = performance.now()
          try {
            observe(this, args, result, start, end)
          } catch {
            event('instrument-error', { name })
          }
          return result
        },
      })
      restores.push(() => Object.defineProperty(prototype, name, descriptor))
    } catch {
      event('instrument-unavailable', { name })
    }
  }
  wrap(HTMLCanvasElement.prototype, 'getContext', (self, args, result) => {
    if (result) event('canvas-context', { canvas: id(self), type: args[0], context: id(result) })
  })
  for (const name of ['width', 'height']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name)
    if (!descriptor?.set) continue
    Object.defineProperty(HTMLCanvasElement.prototype, name, {
      ...descriptor,
      set: function (this: HTMLCanvasElement, value: number) {
        const before = name === 'width' ? this.width : this.height
        descriptor.set!.call(this, value)
        event('canvas-resize', { canvas: id(this), axis: name, before, after: value })
      },
    })
    restores.push(() => Object.defineProperty(HTMLCanvasElement.prototype, name, descriptor))
  }
  wrap(CanvasRenderingContext2D.prototype, 'drawImage', (self, args, _result, start, end) => {
    const source = args[0],
      context = self as CanvasRenderingContext2D
    event('canvas-copy', {
      destination: id(context.canvas),
      source: id(source),
      cpuMs: end - start,
      rect: args.slice(1),
    })
  })
  let previous = 0
  return {
    frame(at: number) {
      const probeStarted = performance.now()
      const delta = previous ? at - previous : 0
      frames.push({
        at,
        delta,
        probeCpuMs: performance.now() - probeStarted,
        estimatedMissed60HzSlots: delta > 25 ? Math.max(0, Math.round(delta / (1000 / 60)) - 1) : 0,
      })
      if (frames.length > 7200) {
        frames.shift()
        droppedFrames++
      }
      previous = at
    },
    report: () => ({
      events,
      frames,
      droppedEvents,
      droppedFrames,
      boundary:
        'Main-thread HTML canvas API calls and framework lifecycle events. No GPU completion, worker calls or physical presentation are observed.',
    }),
    dispose() {
      emit = undefined
      for (const restore of restores.reverse()) restore()
    },
  }
}
