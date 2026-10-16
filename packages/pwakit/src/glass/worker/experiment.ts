import { reportGlassError } from '../errors.ts'
import { WorkerGlassClient } from './client.ts'
import {
  captureFixture,
  rasterSetup,
  fixtureMotion,
  type FixtureMotion,
  WORKER_BACKDROPS,
  type FixtureKind,
} from './fixture.ts'
import {
  epochNow,
  poseAt,
  type FrameSample,
  type MotionPlan,
  type GlassLift,
  type RasterSetup,
} from './protocol.ts'
import type { Appearance } from '../lens/theme.ts'

const mounted = new WeakMap<HTMLElement, Promise<unknown>>()
export function mountGlassWorkerExperiment(host: HTMLElement) {
  let existing = mounted.get(host)
  if (!existing) {
    existing = mount(host)
    mounted.set(host, existing)
  }
  return existing
}
async function mount(host: HTMLElement) {
  const params = new URLSearchParams(location.search)
  host.innerHTML = `<h1>Glass worker feasibility</h1><p>Dedicated worker · WebGPU reference candidate, parity pending · synthetic motion, not phone acceptance</p>
    <p id="status">Preparing renderer…</p><div style="position:relative;width:440px;height:318px;overflow:hidden;background:#888"><div id="page" style="position:absolute;inset:0;width:440px;background:linear-gradient(90deg,#ef476f,#118ab2)"></div><canvas id="glass" style="position:absolute;inset:0;width:440px;height:318px"></canvas></div>
    <button id="sampled">Sampled pose + main stalls</button> <button id="timeline">Timeline + main stalls</button> <button id="export">Export measurements</button><pre id="result"></pre>`
  const status = host.querySelector('#status')!,
    result = host.querySelector('#result')!
  const canvas = host.querySelector<HTMLCanvasElement>('#glass')!,
    page = host.querySelector<HTMLElement>('#page')!
  const client = new WorkerGlassClient()
  document.getElementById('satin-launch-screen')?.remove()
  const launchStart = performance.now()
  // Readiness failures remain visible even if asynchronous initialization later completes.
  const fallback = setTimeout(() => {
    reportGlassError(
      'readiness-timeout',
      'Glass worker was not ready within 2.5 seconds',
      'diagnostic launch',
    )
  }, 2500)
  try {
    await client.init(canvas, Number(params.get('dpr') ?? 3))
  } catch (error) {
    clearTimeout(fallback)
    status.textContent = String(error)
    throw error
  }
  let setup = rasterSetup('light', 'dock', Number(params.get('dpr') ?? 3))
  let capture: unknown,
    lastRun: unknown,
    sourceRevision = 0,
    currentBackdrop = 'photo-landscape'
  const configure = async (
    backdrop = 'photo-landscape',
    appearance: Appearance = 'light',
    kind: FixtureKind = 'dock',
    lift?: GlassLift,
    motion?: FixtureMotion,
    trigger?: RasterSetup['trigger'],
  ) => {
    const revision = ++sourceRevision
    setup = fixtureMotion(
      { ...rasterSetup(appearance, kind, setup.resolution), lift, trigger },
      motion,
    )
    setup = {
      ...setup,
      sourceKey: `fixture:${backdrop}:${appearance}:${setup.resolution}`,
      glyphKey: `fixture-glyph:${appearance}:${kind}:${setup.resolution}`,
    }
    currentBackdrop = backdrop
    const value = await captureFixture(backdrop, setup)
    if (revision !== sourceRevision) {
      value.front.close()
      value.rear.close()
      value.glyphs.close()
      return { superseded: true }
    }
    page.style.background = `url(/comparisons/measured-reference/backdrops/${backdrop}.png) left top / 440px auto`
    page.parentElement!.style.background = `url(/comparisons/measured-reference/backdrops/${backdrop}.png) left bottom / 440px auto`
    const postStart = performance.now()
    const installed = await client.request(
      {
        type: 'source',
        revision,
        setup,
        front: value.front,
        rear: value.rear,
        glyphs: value.glyphs,
        sentAt: epochNow(),
      },
      [value.front, value.rear, value.glyphs],
    )
    capture = {
      backdrop,
      appearance,
      kind,
      captureMs: value.captureMs,
      bitmapMs: value.bitmapMs,
      mainCanvasBytes: value.mainCanvasBytes,
      roundTripMs: performance.now() - postStart,
      installed,
    }
    return capture
  }
  await configure()
  clearTimeout(fallback)
  status.textContent = `Ready (${client.backend}). ${Math.round(performance.now() - launchStart)} ms including source preparation.`
  const run = async (mode: MotionPlan['mode'] = 'timeline', stallMs = 40, duration = 2200) => {
    const plan: MotionPlan = {
      mode,
      sourceRevision,
      epoch: epochNow() + 100,
      duration,
      from: 0,
      to: setup.width,
    }
    const blocked: { at: number; ms: number }[] = [],
      poses: { at: number; x: number; expectedX: number }[] = []
    client.work.length = 0
    const animation = page.animate(
      [{ transform: 'translateX(0px)' }, { transform: `translateX(${setup.width}px)` }],
      { duration, fill: 'forwards', easing: 'linear' },
    )
    // Explicit same-clock WAAPI start. No claim of worker access to ScrollTimeline.
    animation.startTime = plan.epoch - performance.timeOrigin
    await client.request({ type: 'run', plan })
    await new Promise<void>(resolve => {
      let nextStall = plan.epoch + 180
      const tick = () => {
        const at = epochNow(),
          expectedX = poseAt(plan, at)
        const matrix = new DOMMatrixReadOnly(getComputedStyle(page).transform)
        poses.push({ at, x: matrix.m41, expectedX })
        if (mode === 'sampled') client.pose(matrix.m41, at)
        if (stallMs && at >= nextStall && at < plan.epoch + duration - 100) {
          const start = performance.now()
          while (performance.now() - start < stallMs) {
            /* controlled CPU stall, excluded from render CPU cost */
          }
          blocked.push({ at, ms: performance.now() - start })
          nextStall += 200
        }
        if (epochNow() < plan.epoch + duration + 100) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    animation.cancel()
    const report = (await client.request({ type: 'report' })) as { frames: FrameSample[] }
    lastRun = {
      worker: true,
      mode,
      stallMs,
      plan,
      blocked,
      poses,
      mainFrameWork: [...client.work],
      report,
      boundary:
        'Frame times are renderer submissions. errorPx compares with the declared WAAPI timeline, not scanout. DOM pose reads exist only when the main thread runs.',
    }
    result.textContent = JSON.stringify(summarize(report.frames), null, 2)
    return lastRun
  }
  const addLayer = async (id: string, scroll = false) => {
    const container = document.createElement('div')
    container.style.cssText = 'position:relative;width:440px;height:200px;overflow:auto'
    if (scroll) container.setAttribute('data-satin-scroll-container', id)
    const content = document.createElement('div')
    content.style.cssText = 'position:relative;height:636px'
    const extra = document.createElement('canvas')
    extra.style.cssText = 'top:0;left:0;width:440px;height:318px'
    content.append(extra)
    container.append(content)
    host.append(container)
    await client.attachLayer(extra, {
      id,
      depth: 1,
      attachment: scroll ? { kind: 'scroll', scrollId: id } : { kind: 'fixed' },
    })
    const value = await captureFixture(currentBackdrop, setup)
    return client.request(
      {
        type: 'layer-source',
        layerId: id,
        setup,
        front: value.front,
        rear: value.rear,
        glyphs: value.glyphs,
      },
      [value.front, value.rear, value.glyphs],
    )
  }
  const api = {
    configure,
    run,
    addLayer,
    snapshot: () => client.request({ type: 'snapshot' }),
    request: client.request.bind(client),
    report: () => client.request({ type: 'report' }),
    capture: () => capture,
    fixtures: WORKER_BACKDROPS,
    readyMs: performance.now() - launchStart,
    environment: {
      backend: client.backend,
      userAgent: navigator.userAgent,
      worker: true,
      standalone: matchMedia('(display-mode: standalone)').matches,
      crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      resolution: setup.resolution,
    },
  }
  ;(globalThis as unknown as { __glass12u: typeof api }).__glass12u = api
  for (const mode of ['sampled', 'timeline'] as const)
    host.querySelector(`#${mode}`)!.addEventListener('click', () => {
      void run(mode).catch(error => {
        status.textContent = String(error)
      })
    })
  host.querySelector('#export')!.addEventListener('click', () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ environment: api.environment, capture, lastRun }, null, 2)], {
        type: 'application/json',
      }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'glass-12u.json'
    anchor.click()
    URL.revokeObjectURL(url)
  })
  return api
}
export function summarize(frames: FrameSample[]) {
  const intervals = frames
    .flatMap(frame => (frame.interval === null ? [] : [frame.interval]))
    .sort((a, b) => a - b)
  const cpu = frames.map(frame => frame.cpuMs).sort((a, b) => a - b)
  const error = frames.map(frame => frame.errorPx).sort((a, b) => a - b)
  const quantile = (values: number[], q: number) =>
    values[Math.min(values.length - 1, Math.floor(values.length * q))] ?? null
  return {
    frames: frames.length,
    medianMs: quantile(intervals, 0.5),
    p90Ms: quantile(intervals, 0.9),
    over20Percent: intervals.length
      ? (100 * intervals.filter(value => value > 20).length) / intervals.length
      : null,
    maxMs: intervals.at(-1),
    cpuMedianMs: quantile(cpu, 0.5),
    cpuP90Ms: quantile(cpu, 0.9),
    poseErrorP90Px: quantile(error, 0.9),
    poseErrorMaxPx: error.at(-1),
  }
}
