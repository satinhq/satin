import { glassProfile } from './glass/webgpu/profile.ts'
import { selectNavigationProbeLayers } from './navigation/probeLayers.ts'
import { MotionProbeOutbox, motionBeacon } from './motionProbeDelivery.ts'
import { installGraphicsProbe } from './graphicsProbe.ts'
import { createMotionOwnershipControls } from './motionProbeControls.ts'
/** Opt-in CPU/API telemetry. Never interprets rAF timestamps as display scanout. */
export type MotionKind =
  | 'push'
  | 'pop-scrub'
  | 'pop-release'
  | 'pop'
  | 'minimize'
  | 'restore'
  | 'tab-switch'
  | 'menu-open'
  | 'menu-close'
  | 'menu-drag'
type Frame = {
  at: number
  delta: number
  callbackMs: number
  callbacks: number
  input: number
  styleWrites: number
  otherStyleWrites: number
  gl: number
  uploads: number
  mirrorRebuilds: number
}
type MotionWindow = {
  inputStart?: number
  contactFrames?: Frame[]
  id: number
  kind: MotionKind
  owner: string
  start: number
  end?: number
  interrupted?: boolean
  frames: Frame[]
  inputTimes: number[]
  styles: Record<string, number>
}
type Sink = {
  prepared(): void
  begin(kind: MotionKind, owner: string): () => void
  count(name: 'gl' | 'uploads' | 'mirrorRebuilds', amount: number): void
}
const eventCosts: { kind: string; start: number; end: number }[] = []
export function recordMotionEventCost(kind: string, start: number, end: number) {
  if (!sink) return
  eventCosts.push({ kind, start, end })
  if (eventCosts.length > 1200) eventCosts.shift()
}
const navigationGlassFrames: unknown[] = []
export function recordNavigationGlassFrame(value: unknown) {
  if (!sink) return
  navigationGlassFrames.push(value)
  if (navigationGlassFrames.length > 2400) navigationGlassFrames.shift()
}
const preparations: unknown[] = []
let preparationRevision = 0
export function recordMotionPreparation(value: unknown) {
  if (!sink && !swipeTrace) return
  const record = typeof value === 'function' ? value() : value
  swipeTrace?.record(record)
  if (sink) {
    preparationRevision++
    preparations.push(record)
    if (preparations.length > 240) preparations.shift()
    sink.prepared()
  }
}

/** Opt-in swipe trace (scripts/test-support/recorder.js): a diagnostic sink the page installs on
 * `globalThis.__SATIN_SWIPE_TRACE__` before the app bundle loads. Normal builds never install
 * it, so every hook below is one test of a module constant. The sink receives the same records
 * as the motion probe's preparations plus the live navigation tracks, which it samples itself. */
export type SwipeTraceTrack = {
  animation: Animation
  /** outgoing, incoming, outgoing-title, incoming-title, title-clip, title-content, dim, back-button, chrome */
  role: string
  /** Layer width in CSS pixels: translate3d percentages resolve against it. */
  width: number
}
type SwipeTraceSink = {
  record(value: unknown): void
  tracks(phase: string, tracks: SwipeTraceTrack[]): void
}
const swipeTrace = (globalThis as { __SATIN_SWIPE_TRACE__?: SwipeTraceSink }).__SATIN_SWIPE_TRACE__
export const swipeTraceEnabled = () => swipeTrace !== undefined
/** Hand a navigation phase's tracks to the swipe trace. Call only when `swipeTraceEnabled()`. */
export function traceNavigationTracks(phase: string, tracks: SwipeTraceTrack[]) {
  swipeTrace?.tracks(phase, tracks)
}
let sink: Sink | undefined
export function motionPreparationEnabled() {
  return !!sink
}
export function beginMotionProbe(kind: MotionKind, owner: string) {
  return sink?.begin(kind, owner) ?? (() => {})
}
export function countMotionProbe(name: 'gl' | 'uploads' | 'mirrorRebuilds', amount = 1) {
  sink?.count(name, amount)
}
export function motionPercentile(values: readonly number[], p: number) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!
}
const fresh = (at: number, delta: number): Frame => ({
  at,
  delta,
  callbackMs: 0,
  callbacks: 0,
  input: 0,
  styleWrites: 0,
  otherStyleWrites: 0,
  gl: 0,
  uploads: 0,
  mirrorRebuilds: 0,
})
export function summarizeMotionWindow(window: MotionWindow) {
  const frames = window.frames.filter(
    f => f.at >= window.start && (window.end === undefined || f.at < window.end),
  )
  const deltas = frames
    .slice(1)
    .map(f => f.delta)
    .filter(d => d > 0)
  const input = window.inputTimes
  const inclusive = [
    ...new Map([...(window.contactFrames ?? []), ...window.frames].map(f => [f.at, f])).values(),
  ].sort((a, b) => a.at - b.at)
  return {
    id: window.id,
    kind: window.kind,
    owner: window.owner,
    start: window.start,
    end: window.end,
    inputStart: window.inputStart,
    inputToSettlement:
      window.inputStart === undefined
        ? undefined
        : {
            callbackMax: motionPercentile(
              inclusive.map(f => f.callbackMs),
              1,
            ),
            maximumObservedGap: motionPercentile(
              inclusive.slice(1).map(f => f.delta),
              1,
            ),
            uploads: inclusive.reduce((n, f) => n + f.uploads, 0),
            boundary:
              'Includes the display-update bucket crossing first touchstart; conservatively includes other callbacks in that bucket.',
          },
    precedingFrame: window.frames.find(f => f.at < window.start),
    boundaryCallbackMax: motionPercentile(
      window.frames.filter(f => f.at < window.start).map(f => f.callbackMs),
      1,
    ),
    maximumObservedGap: motionPercentile(
      window.frames.map(f => f.delta),
      1,
    ),
    frames: frames.length,
    rafHz: deltas.length ? 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length) : null,
    inputHz: input.length > 1 ? ((input.length - 1) * 1000) / (input.at(-1)! - input[0]!) : null,
    deltaP95: motionPercentile(deltas, 0.95),
    callbackP95: motionPercentile(
      frames.map(f => f.callbackMs),
      0.95,
    ),
    histogram: [8.3, 12.5, 20, 33.4, 50, Infinity].map((upper, i, bins) => ({
      upper: Number.isFinite(upper) ? upper : 'above 50',
      count: deltas.filter(d => d <= upper && (i === 0 || d > bins[i - 1]!)).length,
    })),
    totals: Object.fromEntries(
      ['input', 'styleWrites', 'otherStyleWrites', 'gl', 'uploads', 'mirrorRebuilds'].map(k => [
        k,
        frames.reduce((sum, f) => sum + f[k as keyof Frame], 0),
      ]),
    ),
    glMax: Math.max(0, ...frames.map(f => f.gl)),
    uploadsMax: Math.max(0, ...frames.map(f => f.uploads)),
    styles: window.styles,
  }
}
/** Install once before app mount; dispose restores the original rAF function. */
export function installMotionProbe({
  build,
  endpoint = '/__motion_probe',
  sampleNavigationFrames = true,
  graphicsMode = 'submissions',
}: {
  build: string
  endpoint?: string
  sampleNavigationFrames?: boolean
  graphicsMode?: 'off' | 'submissions'
}) {
  if (sink) throw Error('Only one motion probe may own a page.')
  const graphics = graphicsMode === 'off' ? undefined : installGraphicsProbe()
  const client = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const windows: MotionWindow[] = [],
    idleFrames: Frame[] = [],
    active = new Set<MotionWindow>()
  const scrollSamples: unknown[] = []
  const contacts: unknown[] = []
  const touchSamples: unknown[] = []
  const pointerSamples: unknown[] = []
  const navigationFrames: unknown[] = []
  const timelineIds = new WeakMap<AnimationTimeline, number>()
  let nextTimelineId = 0
  const recentFrames: Frame[] = []
  let inputStart: number | undefined
  const experiments: unknown[] = []
  const svgApertureUpdates: number[] = []
  const inputTiming: unknown[] = []
  const longTasks: { start: number; duration: number }[] = []
  const supported = PerformanceObserver.supportedEntryTypes ?? []
  const nativeRaf = window.requestAnimationFrame.bind(window),
    originalRaf = window.requestAnimationFrame
  let frame = fresh(performance.now(), 0),
    sequence = 0,
    lastAt = 0,
    disposed = false,
    posted = 0,
    postedThrough = 0
  const retain = () => {
    for (const w of active) {
      w.frames.push({ ...frame })
      if (w.frames.length > 600) w.frames.shift()
    }
  }
  const advance = (at: number) => {
    if (at === lastAt) return
    graphics?.frame(at)
    recentFrames.push({ ...frame })
    if (recentFrames.length > 600) recentFrames.shift()
    if (!active.size) {
      idleFrames.push({ ...frame })
      if (idleFrames.length > 300) idleFrames.shift()
    }
    retain()
    frame = fresh(at, lastAt ? at - lastAt : 0)
    lastAt = at
  }
  window.requestAnimationFrame = callback =>
    nativeRaf(at => {
      advance(at)
      const start = performance.now()
      try {
        callback(at)
      } finally {
        const end = performance.now()
        frame.callbackMs += end - start
        frame.callbacks++
        if (end - start > 8.3)
          recordMotionPreparation({
            kind: 'slow-callback',
            start,
            end,
            callback: String(callback).slice(0, 800),
          })
      }
    })
  let observerFrame = 0,
    observerCallbacks = 0,
    postTimer = 0,
    contactActive = false
  const stopObserver = () => {
    cancelAnimationFrame(observerFrame)
    observerFrame = 0
  }
  const scheduleObserver = () => {
    if (!observerFrame && !disposed && active.size && !document.hidden)
      observerFrame = nativeRaf(tick)
  }
  const schedulePost = () => {
    clearTimeout(postTimer)
    postTimer = 0
    if (!disposed && !active.size && !contactActive && !document.hidden)
      postTimer = window.setTimeout(() => {
        postTimer = 0
        void post()
      }, 3000)
  }
  const tick = (at: number) => {
    observerFrame = 0
    if (disposed || !active.size || document.hidden) return
    observerCallbacks++
    advance(at)
    if (
      sampleNavigationFrames &&
      [...active].some(w => ['push', 'pop', 'pop-scrub', 'pop-release'].includes(w.kind))
    ) {
      const start = performance.now()
      const sample = (element: HTMLElement | null) => {
        if (!element) return undefined
        const style = getComputedStyle(element)
        const trackingOffset = Number.parseFloat(style.translate)
        return {
          x:
            new DOMMatrixReadOnly(style.transform).m41 +
            (Number.isFinite(trackingOffset) ? trackingOffset : 0),
          translate: style.translate,
          opacity: Number(style.opacity),
          boxShadow: style.boxShadow,
          animations: element.getAnimations().map(animation => {
            const timeline = animation.timeline
            if (timeline && !timelineIds.has(timeline)) timelineIds.set(timeline, ++nextTimelineId)
            return {
              timeline: timeline ? timelineIds.get(timeline) : null,
              time: String(animation.currentTime),
              start: String(animation.startTime),
              progress: animation.effect?.getComputedTiming().progress,
            }
          }),
        }
      }
      const allLayers = [...document.querySelectorAll<HTMLElement>('[data-satin-screen-container]')]
      const sampledLayers = selectNavigationProbeLayers(allLayers)
      const sampledKeys = new Set(sampledLayers.map(screen => screen.dataset.satinScreenKey))
      const layers = sampledLayers.map(screen => {
        const scroll = screen.querySelector<HTMLElement>('[data-satin-primary="true"]')
        return {
          key: screen.dataset.satinScreenKey,
          screen: screen.dataset.satinScreen,
          phase: screen.dataset.satinTransition,
          rear: sample(screen),
          front: sample(screen.querySelector('[data-satin-navigation-motion-layer]')),
          dim: sample(screen.querySelector('[data-satin-navigation-dim]')),
          scrollY: scroll?.scrollTop,
          pressed: screen.querySelectorAll('[data-satin-press-state="pressed"]').length,
        }
      })
      const titles = [
        ...document.querySelectorAll<HTMLElement>('[data-satin-navigation-title-layer]'),
      ]
        .filter(element => sampledKeys.has(element.dataset.satinNavigationTitleKey))
        .map(element => ({
          phase: element.dataset.satinTransition,
          covered: element.dataset.satinNavigationTitleCovered,
          ...sample(element),
        }))
      const source = document.querySelector<HTMLElement>('[data-satin-native-scrub]')
      navigationFrames.push({
        at,
        observedAt: start,
        layers,
        titles,
        omittedLayers: allLayers.length - sampledLayers.length,
        source: source ? { x: source.scrollLeft, width: source.clientWidth } : undefined,
        readMs: performance.now() - start,
      })
      if (navigationFrames.length > 2400) navigationFrames.shift()
      frame.callbackMs += performance.now() - start
      frame.callbacks++
    }
    scheduleObserver()
  }
  const styleObserver = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target as HTMLElement
      if (element.closest('[data-satin-motion-probe]')) continue
      frame.styleWrites++
      // Compare declared values without a computed-style/layout read. Keep no text content.
      const before = new Map(
        (record.oldValue ?? '').split(';').map(s => {
          const i = s.indexOf(':')
          return [s.slice(0, i).trim(), s.slice(i + 1).trim()]
        }),
      )
      const changed = new Set(
        [...before.keys(), ...Array.from(element.style)].filter(
          k => k && (before.get(k) ?? '') !== element.style.getPropertyValue(k).trim(),
        ),
      )
      for (const key of changed) {
        if (key !== 'transform' && key !== 'opacity') frame.otherStyleWrites++
        for (const w of active) w.styles[key] = (w.styles[key] ?? 0) + 1
      }
    }
  })
  const apertureObserver = new MutationObserver(records => {
    for (const r of records)
      if ((r.target as Element).id.startsWith('satin-tab-aperture-'))
        svgApertureUpdates.push(performance.now())
    if (svgApertureUpdates.length > 3600)
      svgApertureUpdates.splice(0, svgApertureUpdates.length - 3600)
  })
  apertureObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['d'],
    subtree: true,
  })
  styleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
    attributeOldValue: true,
    subtree: true,
  })
  const recordScroll = (event: Event) => {
    const target = event.target
    if (
      !(target instanceof HTMLElement) ||
      !target.matches('[data-satin-scroll], [data-satin-native-scrub]')
    )
      return
    scrollSamples.push({
      at: performance.now(),
      id: target.dataset.satinScroll ?? 'native-scrub',
      x: target.scrollLeft,
      y: target.scrollTop,
    })
    if (scrollSamples.length > 1200) scrollSamples.shift()
  }
  document.addEventListener('scroll', recordScroll, { capture: true, passive: true })
  const contactStart = (event: Event) => {
    const target = event.target as Element
    if (target?.closest('[data-satin-motion-probe]')) return
    const observedAt = performance.now()
    contactActive = true
    clearTimeout(postTimer)
    postTimer = 0
    // Event delivery may wait behind preparation. Keep the input timestamp,
    // rather than starting the budget only after that work has completed.
    inputStart =
      event.timeStamp >= 0 && event.timeStamp <= observedAt ? event.timeStamp : observedAt
    contacts.push({
      at: inputStart,
      observedAt,
      deliveryDelayMs: observedAt - inputStart,
      sourceReady: target
        ?.closest('[data-satin-navigator-host]')
        ?.getAttribute('data-satin-source-ready'),
    })
    if (contacts.length > 120) contacts.shift()
  }
  const recordTouch = (event: TouchEvent) => {
    contactActive = event.touches.length > 0
    if (!contactActive) schedulePost()
    const touch = event.changedTouches[0]
    touchSamples.push({
      type: event.type,
      at: event.timeStamp,
      observedAt: performance.now(),
      x: touch?.clientX,
      y: touch?.clientY,
    })
    if (touchSamples.length > 2400) touchSamples.shift()
  }
  const recordPointer = (event: PointerEvent) => {
    if (
      !('ontouchstart' in window) &&
      (event.type === 'pointerup' || event.type === 'pointercancel')
    ) {
      contactActive = false
      schedulePost()
    }
    const target = event.target instanceof Element ? event.target : undefined
    pointerSamples.push({
      type: event.type,
      at: event.timeStamp,
      observedAt: performance.now(),
      id: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      captured: target?.hasPointerCapture(event.pointerId),
      scroll: target?.closest('[data-satin-scroll]')?.getAttribute('data-satin-scroll'),
      press: target?.closest('[data-satin-pressable]')?.getAttribute('data-satin-press-state'),
    })
    if (pointerSamples.length > 2400) pointerSamples.shift()
  }
  const pointerTypes = [
    'pointerdown',
    'pointermove',
    'pointerup',
    'pointercancel',
    'gotpointercapture',
    'lostpointercapture',
  ] as const
  for (const type of pointerTypes)
    document.addEventListener(type, recordPointer, { capture: true, passive: true })
  const touchTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const
  for (const type of touchTypes)
    document.addEventListener(type, recordTouch, { capture: true, passive: true })
  const contactType = 'ontouchstart' in window ? 'touchstart' : 'pointerdown'
  document.addEventListener(contactType, contactStart, { capture: true, passive: true })
  const input = () => {
    const now = performance.now()
    frame.input++
    for (const w of active) {
      w.inputTimes.push(now)
      if (w.inputTimes.length > 7200) w.inputTimes.shift()
    }
  }
  // Use one stream; counting pointermove and touchmove together doubles input Hz.
  const inputType = 'ontouchstart' in window ? 'touchmove' : 'pointermove'
  document.addEventListener(inputType, input, { capture: true, passive: true })
  const longObserver = supported.includes('longtask')
    ? new PerformanceObserver(list => {
        for (const entry of list.getEntries())
          longTasks.push({ start: entry.startTime, duration: entry.duration })
        if (longTasks.length > 1000) longTasks.splice(0, longTasks.length - 1000)
      })
    : undefined
  longObserver?.observe({ type: 'longtask', buffered: true })
  const eventObserver = supported.includes('event')
    ? new PerformanceObserver(list => {
        for (const entry of list.getEntries()) inputTiming.push(entry.toJSON())
        if (inputTiming.length > 300) inputTiming.splice(0, inputTiming.length - 300)
      })
    : undefined
  eventObserver?.observe({
    type: 'event',
    buffered: true,
    durationThreshold: 16,
  } as PerformanceObserverInit)

  sink = {
    prepared: () => {
      if (!postTimer) schedulePost()
    },
    begin(kind, owner) {
      clearTimeout(postTimer)
      postTimer = 0
      if (!active.size) {
        lastAt = 0
        frame = fresh(performance.now(), 0)
      }
      const w: MotionWindow = {
        id: ++sequence,
        kind,
        owner,
        start: performance.now(),
        frames: [],
        inputTimes: [],
        styles: {},
      }
      if (inputStart !== undefined && w.start - inputStart < 10000) {
        w.inputStart = inputStart
        const crossing = recentFrames.findLastIndex(f => f.at < inputStart!)
        w.contactFrames = recentFrames.slice(Math.max(0, crossing)).map(f => ({ ...f }))
      }
      windows.push(w)
      active.add(w)
      scheduleObserver()
      if (windows.length > 60) windows.shift()
      return () => {
        if (!active.has(w)) return
        w.end = performance.now()
        w.frames.push({ ...frame })
        active.delete(w)
        if (!active.size) {
          stopObserver()
          schedulePost()
        }
      }
    },
    count(name, amount) {
      if (name !== 'uploads') frame[name] += amount
    },
  }
  const report = (completed = windows) => ({
    version: 11,
    glassProfile: glassProfile(),
    sampling: {
      observerPending: Boolean(observerFrame),
      observerCallbacks,
      uploadTimerPending: Boolean(postTimer),
      idlePolicy:
        'no observer rAF outside motion windows; wrapped application callbacks counted passively',
    },
    navigationGlassFrames,
    graphicsMode,
    graphics: graphics?.report(),
    pointerSamples,
    navigationFrames,
    sampleNavigationFrames,
    navigationFrameBoundary:
      'Main-thread computed animation samples, not scanout; diagnostic reads and readMs included in callback cost.',
    touchSamples,
    eventCosts,
    preparations,
    svgApertureUpdates,
    scrollSamples,
    contacts,
    uploadsAvailable: false,
    client,
    build,
    timeOrigin: performance.timeOrigin,
    at: performance.now(),
    url: location.href,
    userAgent: navigator.userAgent,
    standalone:
      matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    navigation: {
      historyLength: history.length,
      screens: [...document.querySelectorAll<HTMLElement>('[data-satin-screen-container]')].map(
        e => ({
          screen: e.dataset.satinScreen,
          covered: e.dataset.satinCovered,
          phase: e.dataset.satinTransition,
          rect: e.getBoundingClientRect().toJSON(),
        }),
      ),
      scroll: [...document.querySelectorAll<HTMLElement>('[data-satin-primary="true"]')].map(e => ({
        id: e.dataset.satinScroll,
        x: e.scrollLeft,
        y: e.scrollTop,
      })),
    },
    nativeNavigation: (() => {
      const source = document.querySelector<HTMLElement>('[data-satin-native-scrub]'),
        host = source?.querySelector<HTMLElement>('[data-satin-navigator-host]')
      return source
        ? {
            ready: host?.getAttribute('data-satin-source-ready') === 'true',
            x: source.scrollLeft,
            width: source.clientWidth,
            scrollWidth: source.scrollWidth,
            host: host?.getBoundingClientRect().toJSON(),
            source: source.getBoundingClientRect().toJSON(),
          }
        : undefined
    })(),
    visibility: document.visibilityState,
    inputType,
    supportedEntryTypes: supported,
    limitations: {
      cpu: 'Sum of instrumented rAF callback wall time. Excludes browser style/layout/paint, event handlers and work outside rAF. Not total main-thread work.',
      longTasks: longObserver
        ? 'PerformanceObserver longtask entries'
        : 'UNAVAILABLE on this runtime; zero long tasks cannot be claimed',
      uploads: 'UNAVAILABLE: GPU texture uploads are not observed by this page probe.',
      gl: 'Renderer submissions; not GPU completion or physical presentation',
      styleWrites:
        'Observed style attributes across app; changed-property counts coalesce same-task writes; setup and endpoints included',
      cap: '60 Hz rAF alone cannot distinguish a platform cap from compositor/GPU starvation',
    },
    longTasks,
    inputTiming,
    experiments,
    idleFrames,
    windows: completed,
    summaries: completed.map(summarizeMotionWindow),
    posted,
    postedThrough,
  })
  let storage: Storage | undefined
  try {
    storage = localStorage
  } catch {
    /* private browsing may deny storage */
  }
  const outbox = new MotionProbeOutbox(storage, 'satin:motion-outbox')
  const send = async (body: string) => {
    try {
      return (
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      ).ok
    } catch {
      return false
    }
  }
  let backgroundSignature = ''
  const background = () => {
    if (disposed) return
    const now = performance.now()
    for (const window of active) {
      window.end = now
      window.interrupted = true
      window.frames.push({ ...frame })
    }
    active.clear()
    contactActive = false
    stopObserver()
    clearTimeout(postTimer)
    postTimer = 0
    const completed = windows.filter(
      window => window.end !== undefined && window.id > postedThrough,
    )
    if (!completed.length && !preparations.length) return
    const signature = `${sequence}:${preparationRevision}`
    if (signature === backgroundSignature) return
    const body = JSON.stringify(report(completed))
    const persisted = outbox.save(body)
    const beacon = motionBeacon(body)
    const queued = beacon ? (navigator.sendBeacon?.(endpoint, beacon) ?? false) : false
    recordMotionPreparation({ kind: 'probe-background-flush', at: now, persisted, queued })
    backgroundSignature = `${sequence}:${preparationRevision}`
  }
  const visibility = () => {
    if (document.visibilityState === 'hidden') background()
    else void post()
  }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pagehide', background)
  let uploading = false,
    postedPreparation = 0
  const post = async () => {
    if (
      active.size ||
      contactActive ||
      disposed ||
      uploading ||
      document.visibilityState !== 'visible'
    )
      return false
    uploading = true
    try {
      if (
        !(await outbox.drain(async body => {
          if (!(await send(body))) return false
          const saved = JSON.parse(body)
          if (saved.client === client)
            postedThrough = Math.max(postedThrough, ...saved.windows.map((w: MotionWindow) => w.id))
          return true
        }))
      )
        return false
      // A gesture may begin while an archived upload awaits its response.
      if (active.size || contactActive || document.visibilityState !== 'visible') return false
      const completed = windows.filter(
        window => window.end !== undefined && window.id > postedThrough,
      )
      if (!completed.length && postedPreparation === preparationRevision) return false
      const sentSequence = Math.max(postedThrough, ...completed.map(window => window.id)),
        sentPreparation = preparationRevision
      if (!(await send(JSON.stringify(report(completed))))) return false
      posted = Date.now()
      postedThrough = sentSequence
      postedPreparation = sentPreparation
      return true
    } catch {
      return false
    } finally {
      uploading = false
      if (outbox.pending || windows.some(w => w.end !== undefined && w.id > postedThrough))
        schedulePost()
    }
  }

  if (outbox.pending) schedulePost()
  return {
    report,
    post,
    createControls: () =>
      createMotionOwnershipControls(result => {
        experiments.push(result)
        void post()
      }),
    get active() {
      return active.size > 0
    },
    dispose() {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', background)
      for (const type of pointerTypes) document.removeEventListener(type, recordPointer, true)
      for (const type of touchTypes) document.removeEventListener(type, recordTouch, true)
      graphics?.dispose()
      disposed = true
      sink = undefined
      window.requestAnimationFrame = originalRaf
      cancelAnimationFrame(observerFrame)
      clearTimeout(postTimer)
      styleObserver.disconnect()
      apertureObserver.disconnect()
      longObserver?.disconnect()
      eventObserver?.disconnect()
      document.removeEventListener(inputType, input, true)
      document.removeEventListener(contactType, contactStart, true)
      document.removeEventListener('scroll', recordScroll, true)
    },
  }
}
