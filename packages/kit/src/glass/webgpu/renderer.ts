import { submitCanvasCommands } from './canvasSubmission.ts'
import { gpuScope } from './errors.ts'
import { retainNavigationAtlas } from './navigationAtlasCopy.ts'
import { FrameProbe, type FrameKind, type FrameProbeSample } from './frameProbe.ts'
import {
  lagMark,
  lagMarks,
  lagTraceEnabled,
  lagTraceHasRoom,
  setLagTrace,
  type LagMark,
} from './lagTrace.ts'
import { prewarmKernels } from './passes.ts'
import { FrameGraph, type GraphLease } from './frameGraph.ts'
import { glassNow, glassTiming } from './profile.ts'
import { tabHeldGeometry } from './interactionProfiles.ts'
import { RegionScene } from './regionScene.ts'
import { glassFailureCode } from './errorCode.ts'
import { TabMotion, TAB_INTERACTIVE_MOTION } from '../lens/tabMotion.ts'
import {
  sampleRegion,
  sampleNavigation,
  type RegionTrack,
  type NavigationTrack,
  type NavigationPose,
} from './productionTracks.ts'
import { ShapeCadence, validateTrack } from './cadence.ts'
import { documentFrameClock, type FrameClock } from './frameClock.ts'
import { LayerDevice } from './layers.ts'
import { takePresentedCanvases, WebGPURaster } from './raster.ts'
import { Backdrop } from './backdrop.ts'
import { trimShapeTop } from '../lens/drawableTop.ts'
import { MenuLiftInput } from './menuLiftInput.ts'
import {
  epochNow,
  poseAt,
  type WebGPUEnvelope as Envelope,
  type FrameSample,
  type MotionPlan,
  type RasterSetup,
} from '../worker/protocol.ts'

/** The same WebGPU engine can be driven by a worker port or by the page's
 * rendering update. Thread ownership is selected once; it is never an error fallback. */
export function createWebGPURenderer(
  emit: (message: unknown) => void,
  clock: FrameClock = documentFrameClock,
) {
  const cadence = new ShapeCadence()
  glassTiming('renderer-start')
  let firstPresent = false
  let preparedCanonicalDevice: GPUDevice | undefined
  let hideEpoch = 0
  let presentationEpoch = 0
  let appearanceRefreshPending = false
  let appearanceInstallRevision: number | undefined
  let appearanceInstallHideEpoch: number | undefined
  let contentInstallRevision: number | undefined
  let contentInstallHideEpoch: number | undefined
  let deviceAppearanceRevision = 0
  const reportError = (stage: string, error: unknown, reason?: string) =>
    emit({
      glassError: {
        code: glassFailureCode(stage, error),
        stage,
        message: error instanceof Error ? error.message : String(error),
        reason,
        at: Date.now(),
      },
    })
  let adapterRecoveryReady = false
  const owner = new LayerDevice(reportError, pending => {
    adapterRecoveryReady = !pending
    if (pending) emit({ adapterRecovery: true })
  })
  const submissionAllowed = () =>
    visible &&
    presentationEpoch === hideEpoch &&
    !appearanceRefreshPending &&
    appearanceInstallRevision === undefined &&
    contentInstallRevision === undefined
  let reportedGate: boolean | undefined
  const publishPresentationGate = () => {
    const allowed = submissionAllowed()
    if (reportedGate === allowed) return
    reportedGate = allowed
    emit({ glassEvent: { type: 'presentation-gate', allowed } })
  }
  const raster = new WebGPURaster()
  raster.setSubmissionGate(submissionAllowed)
  const layers = new Map<string, WebGPURaster>([['chrome', raster]])
  const appRegions = new RegionScene(
    owner,
    event => emit({ glassEvent: event }),
    submissionAllowed,
    clock.kind === 'worker-raf' ? raster : undefined,
  )
  let tab = new TabMotion(),
    sharedTabLift = false,
    reducedMotion = false
  const menuLift = new TabMotion(TAB_INTERACTIVE_MOTION)
  let tabTiming:
    { sent: number; received: number; handled: number; firstFrame?: number } | undefined
  const menuLiftRaster = () =>
    layers.get('menu-lift') ?? regions.get('chrome-lift')?.get('menu-lift')
  let navigationTrack: NavigationTrack | undefined,
    navigationInputAt = 0
  let navigationPose: { key: string; pose: NavigationPose } | undefined
  const tracks = new Map<string, RegionTrack>()
  // Canvas submission has no scanout callback. This is an explicitly supplied
  // experimental lead, not a latency inferred from rAF or GPU queue completion.
  let presentationLeadMs = 0
  /** The scenes that sample the page's scroller with the chrome. */
  const scrollFollowers = () => [
    raster,
    ...(regions.get('chrome')?.values() ?? []),
    ...(['chrome-lift', 'menu-lift'] as const).flatMap(id =>
      layers.has(id) ? [layers.get(id)!] : [],
    ),
    ...(regions.get('chrome-lift')?.values() ?? []),
  ]
  const sampleNavigationMotion = (at: number, now: number) => {
    if (!navigationTrack) return
    const pose = sampleNavigation(navigationTrack, at)
    navigationPose = { key: navigationPose!.key, pose }
    raster.setNavigation(pose)
    appRegions.setNavigation(pose, navigationPose.key, presentationLeadMs === 0)
    if (now >= navigationTrack.epoch + navigationTrack.duration) navigationTrack = undefined
  }
  const sampleRegionMotion = (at: number, now: number) => {
    for (const [id, track] of tracks) {
      regionById(id)?.updateSpec(sampleRegion(track, at))
      if (now >= track.epoch + track.duration) tracks.delete(id)
    }
  }
  /** The … trigger's press lift: input ordering, early-contact hold and replay (menuLiftInput.ts). */
  const menuInput = new MenuLiftInput({
    surface: () => {
      const surface = menuLiftRaster(),
        first = surface?.spec?.shape.first
      return surface && first ? { first } : undefined
    },
    apply: (request, { first }) => {
      const surface = menuLiftRaster()!
      if (request.phase === 'rest' || reducedMotion) {
        menuLift.reset(0)
        surface.setLift({ amount: 0, source: 'transmissive', optics: menuLift.optics() })
        render(x)
      } else if (request.phase === 'pressed') {
        menuLift.configure(
          [first.halfWidth],
          first.halfWidth * 2,
          first.halfHeight * 2,
          first.halfWidth * 2,
        )
        menuLift.down(first.halfWidth, 0, request.at)
      } else if (request.phase === 'dragging') menuLift.move(request.x ?? first.halfWidth)
      else menuLift.up(request.at)
      wake()
    },
    fail: error => reportError('menu lift', error),
  })
  const regionById = (id: string) =>
    id === 'chrome' ? raster : (layers.get(id) ?? regions.get('chrome')?.get(id))
  const covered = new Set<string>()
  const regions = new Map<string, Map<string, WebGPURaster>>()
  /** Lag trace: the page scroll event whose position the surfaces currently hold. */
  let scrollSequence: number | undefined
  /** Lag trace: loop frames and the probe sample that receives their GPU completion times. */
  const tracedFrames: { mark: LagMark; sample: FrameProbeSample }[] = []
  let loopSample: FrameProbeSample | undefined
  /** Lag trace: a present outside the frame loop (a message applied and drawn at once). */
  function traceMessageRender(device: GPUDevice) {
    const submitted = epochNow()
    const mark = lagMark({
      stage: 'worker-render',
      at: submitted,
      sequence: scrollSequence,
      values: { loop: false, presented: takePresentedCanvases() },
    })
    void device.queue.onSubmittedWorkDone().then(() => {
      mark.values = { ...mark.values, doneMs: epochNow() - submitted }
    })
  }
  /** Lag trace: the renderer's marks, with each loop frame's GPU completion and GPU time. When the
   * renderer runs in the document these are the page's marks too (one list per realm). */
  function exportLagTrace() {
    for (const { mark, sample } of tracedFrames)
      mark.values = {
        ...mark.values,
        doneMs: sample.doneMs,
        gpuMs: sample.gpuMs,
        passes: sample.passes ? JSON.stringify(sample.passes) : undefined,
      }
    return lagMarks()
  }
  const render = (x: number, additional: readonly WebGPURaster[] = [], sampledAt?: number) => {
    // Encoding publishes frame-graph cache keys. A blocked submission must not
    // cache work whose command buffer will be discarded.
    if (!visible || !submissionAllowed()) return
    if (presentationLeadMs && sampledAt === undefined) {
      // Messages can draw between animation callbacks. Refresh the same known
      // trajectories here too; direct drag poses remain the latest actual input.
      const now = epochNow()
      const at = now + presentationLeadMs
      sampleNavigationMotion(at, now)
      sampleRegionMotion(at, now)
      appRegions.sample(now, at)
    }
    const renderHideEpoch = hideEpoch
    const canSubmit = () => submissionAllowed() && renderHideEpoch === hideEpoch
    // Preserve each canvas's region order while presenting each graph result to
    // every layer before another material overwrites shared scratch storage.
    const sequences = [...layers]
      .filter(([id]) => !covered.has(id))
      .map(([id, scene]) =>
        [scene, ...(regions.get(id)?.values() ?? [])].filter(region => !!region.spec),
      )
      .concat(
        [
          ...new Set([
            ...additional,
            ...(presentationLeadMs && appRegions.navigationActive
              ? appRegions.navigationRasters()
              : []),
          ]),
        ].map(region => [region]),
      )
    const device = owner.liveDevice
    if (!device || lost || !sequences.some(s => s.length)) return
    // One encoder and one submission per frame; each canvas layer is presented in a
    // single pass after all of its surfaces have encoded their private results.
    gpuScope(device, 'draw', () => {
      let encoded: WebGPURaster[][] = []
      const encode = (e: GPUCommandEncoder) => {
        encoded = sequences.map(sequence => sequence.filter(scene => scene.encodeResult(e, x)))
        if (!canSubmit()) return
        for (const sequence of encoded) if (sequence.length) WebGPURaster.presentLayer(e, sequence)
      }
      if (frameContext) {
        loopSample = frameProbe.frame(
          frameContext.kind,
          frameContext.interval,
          frameContext.restart,
          encode,
          canSubmit,
        )
        frameContext = undefined
      } else {
        const e = device.createCommandEncoder()
        encode(e)
        const commands = e.finish()
        if (!canSubmit()) return
        submitCanvasCommands(device, e, commands)
        if (lagTraceEnabled()) traceMessageRender(device)
      }
      if (!canSubmit()) return
      for (const sequence of encoded) for (const scene of sequence) scene.submitted()
    })
  }
  // Phone probe: frame evidence per interaction kind, posted when a motion loop goes idle.
  const frameProbe = new FrameProbe(summary => emit({ glassFrames: summary }))
  let frameContext: { kind: FrameKind; interval: number | null; restart: boolean } | undefined
  let plan: MotionPlan | undefined,
    handle = 0,
    visible = true,
    lost = false,
    x = 0,
    inputAt = 0,
    previous: number | undefined,
    callbacks = 0
  let frames: FrameSample[] = [],
    sourceRevision = 0,
    sharedRevision = 0,
    dirty = false
  // Shared capture slots: each image crosses the thread boundary once and every
  // layer/region raster borrows it through the frame graph under its content key.
  // Chrome glyph slots are independent of navigation replacing the root raster's ink.
  const shared = new Map<string, GraphLease<ImageBitmap>>()
  const retainedPlanes = new Map<
    string,
    { image: GraphLease<ImageBitmap>; texture: GraphLease<import('./passes.ts').Target> }
  >()
  /** Images kept alive beyond their slot (`keep`), to be installed again by key, each with the
   * glyph texture a raster uploaded it to: without that lease the texture died with the raster's
   * and coming back to the ink uploaded it again (12 to 33 ms for a phone's tab bar ink). */
  const keptImages = new Map<
    string,
    { image: GraphLease<ImageBitmap>; texture: GraphLease<import('./passes.ts').Target> }
  >()
  /** Uploaded textures a slot holds alongside its image (a restored retained plane). */
  const slotTextures = new Map<string, GraphLease<import('./passes.ts').Target>>()
  const releaseSlot = (slot: string) => {
    shared.get(slot)?.release()
    shared.delete(slot)
    slotTextures.get(slot)?.release()
    slotTextures.delete(slot)
  }
  const sharedImage = (key: string | undefined) => {
    for (const lease of shared.values()) if (lease.key === key) return lease.value
    throw Error('Shared glass source is not installed: ' + key)
  }
  const images = (request: {
    setup: RasterSetup
    front?: ImageBitmap
    rear?: ImageBitmap
    glyphs?: ImageBitmap
  }) => {
    if (request.front && request.rear && request.glyphs)
      return [request.front, request.rear, request.glyphs] as const
    if (request.front || request.rear || request.glyphs)
      throw Error('Glass source request must carry all three images or none')
    const front = sharedImage(request.setup.sourceKey + ':front')
    return [front, front, sharedImage(request.setup.glyphKey)] as const
  }
  // Revisions are assigned in post order; an older message is superseded work, dropped quietly.
  const superseded = (revision: number | undefined) =>
    revision !== undefined && revision < sharedRevision
  const closeImages = (request: {
    front?: ImageBitmap
    rear?: ImageBitmap
    glyphs?: ImageBitmap
  }) => {
    for (const image of new Set([request.front, request.rear, request.glyphs])) image?.close()
  }
  /** Requests waiting for the next worker frame to have been presented. */
  let frameWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = []
  const releaseFrameWaiters = (error?: unknown) => {
    const waiting = frameWaiters
    frameWaiters = []
    for (const waiter of waiting)
      if (error) waiter.reject(error)
      else waiter.resolve()
  }
  const cancel = () => {
    if (handle) clock.cancel(handle)
    handle = 0
    looping = false
    releaseFrameWaiters(Error('Navigation frame cancelled'))
  }
  /** A region scene or source applied from a message presents outside the frame loop; it is sampled
   * like a loop frame so the gate sees every present (restart: its interval may span idle time). */
  const messageFrame = (message: string) => {
    const at = epochNow()
    frames.push({
      at,
      late: 0,
      interval: previous === undefined ? null : at - previous,
      cpuMs: 0,
      x,
      expectedX: x,
      errorPx: 0,
      inputAgeMs: at - inputAt,
      draws: 0,
      uploads: 0,
      copies: 0,
      restart: true,
      message,
    })
    if (frames.length > 2400) frames.shift()
    if (lagTraceEnabled())
      lagMark({ stage: 'worker-message-frame', at, sequence: scrollSequence, values: { message } })
    previous = at
    callbacks++
  }
  // A frame that (re)starts an idle loop has an interval spanning idle time, not a stall.
  let looping = false,
    restarted = false
  const wake = () => {
    if (
      handle ||
      (!dirty &&
        !plan &&
        !tracks.size &&
        !tab.needsFrame &&
        !menuLift.needsFrame &&
        !appRegions.active &&
        !navigationTrack &&
        !Backdrop.for(owner).keyboardMoving) ||
      !visible ||
      lost ||
      ![...layers.keys()].some(id => !covered.has(id))
    )
      return
    handle = clock.request(tick)
  }
  const presentTabSelection = () => {
    if (!raster.spec?.tabSelection) return
    const spec = raster.spec
    const current = {
      ...spec,
      tabSelection: {
        ...spec.tabSelection!,
        capsule: tab.capsule(),
        lensMix: sharedTabLift ? 0 : tab.lensMix,
        // The lift overlay replaces the resting pill as its measured press rises.
        restMix: sharedTabLift ? 1 - tab.lensMix : 1,
      },
    }
    raster.updateSpec(current)
    const overlay = layers.get('chrome-lift')
    if (sharedTabLift && overlay?.spec) {
      overlay.updateSpec(current)
      overlay.setLift({ amount: tab.lensMix, source: 'composed', optics: tab.optics() })
    }
  }
  const tick = (at: number) => {
    handle = 0
    if (
      (!dirty &&
        !plan &&
        !tracks.size &&
        !tab.needsFrame &&
        !menuLift.needsFrame &&
        !appRegions.active &&
        !navigationTrack &&
        !Backdrop.for(owner).keyboardMoving) ||
      !visible ||
      lost ||
      appearanceRefreshPending
    ) {
      if (looping) frameProbe.flush()
      looping = false
      releaseFrameWaiters(Error('Navigation frame unavailable'))
      return
    }
    if (!cadence.admit(at)) {
      wake()
      return
    }
    const tickHideEpoch = hideEpoch
    restarted = !looping
    looping = true
    const kind: FrameKind =
      tab.needsFrame || menuLift.needsFrame || appRegions.pressing
        ? 'drag'
        : tracks.has('chrome')
          ? 'minimize'
          : tracks.has('menu') || tracks.has('right')
            ? 'menu'
            : navigationTrack
              ? 'navigation'
              : dirty
                ? 'scroll'
                : appRegions.active
                  ? 'region'
                  : 'other'
    dirty = false
    const callbackDelayMs = epochNow() - at,
      sampleAt = at + presentationLeadMs,
      expectedX = plan ? poseAt(plan, at) : x,
      start = performance.now()
    try {
      const backdrop = Backdrop.for(owner)
      if (backdrop.keyboardMoving && backdrop.sampleKeyboard(at)) appRegions.backdropMoved()
      sampleNavigationMotion(sampleAt, at)
      const tabChanged = tab.needsFrame && !!raster.spec?.tabSelection
      if (tabChanged) {
        if (tabTiming && tabTiming.firstFrame === undefined) tabTiming.firstFrame = at
        tab.sample(at, reducedMotion)
      }
      if (menuLift.needsFrame) {
        menuLift.sample(at, reducedMotion)
        const surface = menuLiftRaster(),
          first = surface?.spec?.shape.first
        // The lens grows about the trigger; on a fitted page it is lowered, never cut, at the drawable top.
        if (surface && first) {
          const c = menuLift.capsule(),
            lens = trimShapeTop(
              { centerY: first.centerY, halfHeight: c.halfHeight },
              surface.spec!.frameY,
            )
          surface.setLift({
            amount: menuLift.lensMix,
            source: 'transmissive',
            optics: menuLift.optics(),
            glyphLayout: 'content',
            glyphVibrancy: [0, 0],
            capsule: {
              ...c,
              centerX: first.centerX,
              centerY: lens.centerY,
              halfHeight: lens.halfHeight,
              radius: Math.min(c.halfWidth, lens.halfHeight),
            },
          })
        }
      }
      sampleRegionMotion(sampleAt, at)
      // A restore track owns the platter shape; a held gesture owns its selection.
      // Reapply even after lift settles, while the track continues sampling.
      if (tabChanged || tab.active) presentTabSelection()
      if (plan?.mode === 'timeline') x = expectedX
      frameContext = {
        kind,
        interval: previous === undefined || restarted ? null : at - previous,
        restart: restarted,
      }
      loopSample = undefined
      if (clock.kind === 'worker-raf')
        raster.withSharedPresentation(() => {
          appRegions.sample(at, sampleAt)
          render(x, [], sampleAt)
        })
      else {
        appRegions.sample(at, sampleAt)
        render(x, [], sampleAt)
      }
    } catch (error) {
      frameContext = undefined
      plan = undefined
      navigationTrack = undefined
      looping = false
      releaseFrameWaiters(error)
      reportError('frame submission', error)
      return
    }
    if (!visible || tickHideEpoch !== hideEpoch) {
      frameContext = undefined
      looping = false
      return
    }
    callbacks++
    frames.push({
      at,
      late: 0,
      interval: previous === undefined ? null : at - previous,
      cpuMs: performance.now() - start,
      x,
      expectedX,
      errorPx: Math.abs(x - expectedX),
      inputAgeMs: at - inputAt,
      draws: 0,
      uploads: 0,
      copies: 0,
      restart: restarted,
      callbackDelayMs,
    })
    if (frames.length > 2400) frames.shift()
    if (lagTraceEnabled()) {
      const mark = lagMark({
        stage: 'worker-frame',
        at,
        ms: performance.now() - start,
        sequence: scrollSequence,
        values: {
          kind,
          late: 0,
          interval: previous === undefined ? null : at - previous,
          restart: restarted,
          clock: clock.kind ?? 'page-raf',
          homeLeft:
            raster.spec &&
            raster.spec.frameX +
              raster.spec.shape.first.centerX -
              raster.spec.shape.first.halfWidth,
          homeRight:
            raster.spec &&
            raster.spec.frameX +
              raster.spec.shape.first.centerX +
              raster.spec.shape.first.halfWidth,
          accessoryGeometry:
            clock.kind === 'worker-raf' ? appRegions.accessoryGeometry() : undefined,
          callbackDelayMs,
          presented: takePresentedCanvases(),
          tabCentre: tab.frame.centre,
          tabActive: tab.needsFrame,
        },
      })
      if (loopSample && lagTraceHasRoom()) tracedFrames.push({ mark, sample: loopSample })
      // When this thread's event loop next runs a task: the time after the frame during which it
      // could not receive messages (in a worker, WebKit presents the frame's canvases first).
      const ended = epochNow()
      setTimeout(() => {
        mark.values = { ...mark.values, resumeMs: epochNow() - ended }
      }, 0)
    }
    previous = at
    releaseFrameWaiters()
    if (plan && at >= plan.epoch + plan.duration) plan = undefined
    wake()
    if (!handle) {
      if (looping) frameProbe.flush()
      looping = false
    }
  }
  owner.subscribe(device => {
    frameProbe.useDevice(device, clock.kind !== 'worker-raf')
    lost = !device
    if (!device) {
      cancel()
      void appRegions.request({ type: 'visibility', visible: false }).catch(error => {
        reportError('device loss suspension', error)
      })
    } else {
      // Raster restoration rebuilds resources only. The page owns appearance;
      // no restored-device draw or presentation is allowed before its fresh reply.
      appearanceRefreshPending = true
      const appearanceRevision = ++deviceAppearanceRevision
      queueMicrotask(() => {
        if (owner.liveDevice !== device) return
        emit({ appearanceRefresh: true, appearanceRevision })
        if (firstPresent) schedulePrewarm()
      })
    }
    publishPresentationGate()
  })
  // After the first present, compile every material kernel in the background so no surface's
  // first use (alerts, sheets, menus) compiles on the queue during its entrance motion.
  /** Background kernel compilation after the first present, and again on every restored device.
   * Failures are reported (a failure on a device lost meanwhile belongs to the loss, not the kernels). */
  let prewarmTimer: ReturnType<typeof setTimeout> | undefined
  let prewarmPending = false
  const pausePrewarm = () => {
    clearTimeout(prewarmTimer)
    prewarmTimer = undefined
  }
  const schedulePrewarm = () => {
    prewarmPending = true
    pausePrewarm()
    if (visible) prewarmTimer = setTimeout(prewarm, 1000)
  }
  const prewarm = () => {
    prewarmTimer = undefined
    if (!visible) return
    prewarmPending = false
    const device = owner.liveDevice
    if (!device) return
    const at = glassNow()
    void prewarmKernels(device).then(
      () => glassTiming('kernels-prewarmed', at),
      error => {
        if (owner.liveDevice === device) reportError('kernel prewarm', error)
      },
    )
  }
  // Serialize asynchronous init/readback/source operations; motion remains worker-owned.
  let requests = Promise.resolve()
  let receivedAppearance: { value: 'light' | 'dark'; reducedMotion: boolean } | undefined
  let restoredAppearance: typeof receivedAppearance
  const receiveAppearance = (value: 'light' | 'dark', reducedMotion = false) => {
    // visibilitychange and pageshow describe the same foreground arrival. An identical
    // payload must not make an in-flight restore repeat its texture uploads.
    if (receivedAppearance?.value === value && receivedAppearance.reducedMotion === reducedMotion)
      return
    receivedAppearance = { value, reducedMotion }
  }
  const receive = (event: MessageEvent<Envelope>) => {
    const { id, request } = event.data
    if (request.type === 'adapter-visibility') {
      owner.setAdapterVisible(request.visible)
      if (id) emit({ id, value: {} })
      return
    }
    if (request.type === 'retry-adapter') {
      // Acquisition may be holding the serialized renderer queue. Wake it out of band.
      const retry = owner.retryAdapter()
      void Promise.resolve(retry).then(
        () => {
          if (id) emit({ id, value: { requested: true } })
        },
        error => {
          if (id) emit({ id, error: String(error) })
        },
      )
      return
    }
    if (request.type === 'visible' && request.visible && request.appearance) {
      receiveAppearance(request.appearance, request.reducedMotion)
    } else if (request.type === 'canonical' && request.request.type === 'appearance') {
      receiveAppearance(request.request.value, request.request.reducedMotion)
    }
    if (request.type === 'visible' && !request.visible) {
      // Hide is an out-of-band cancellation barrier, not queued behind GPU waits.
      hideEpoch++
      visible = false
      pausePrewarm()
      cancel()
      for (const scene of [
        ...layers.values(),
        ...[...regions.values()].flatMap(list => [...list.values()]),
      ])
        scene.setVisible(false)
      void appRegions.request({ type: 'visibility', visible: false }).catch(error => {
        reportError('hide barrier', error)
      })
    }
    if (request.type === 'appearance-begin') {
      // Close the presentation gate on receipt, even while an older GPU request awaits.
      // The queued handler must never restore a superseded revision.
      appearanceInstallRevision = request.revision
      appearanceInstallHideEpoch = hideEpoch
    }
    if (request.type === 'content-begin') {
      contentInstallRevision = request.revision
      contentInstallHideEpoch = hideEpoch
    }
    publishPresentationGate()
    const receivedHideEpoch = hideEpoch
    const received = epochNow()
    const postedAt = event.data.postedAt
    if (
      postedAt !== undefined &&
      ['source', 'source-images', 'layer-source', 'canonical'].includes(request.type)
    )
      glassTiming('transport', postedAt, request.type)
    const requestMark = lagTraceEnabled()
      ? lagMark({
          stage: 'worker-request',
          at: received,
          sequence: request.type === 'source-scroll' ? request.sequence : undefined,
          values: {
            type: request.type === 'canonical' ? 'canonical:' + request.request.type : request.type,
            postedAt,
          },
        })
      : undefined
    requests = requests
      .then(async () => {
        if (requestMark) requestMark.values = { ...requestMark.values, startedAt: glassNow() }
        const started = glassNow(),
          profiled = [
            'source',
            'source-images',
            'layer-source',
            'canonical',
            'init',
            'capability',
          ].includes(request.type)
        if (profiled) glassTiming('worker-queue', received, request.type)
        let value: unknown
        switch (request.type) {
          case 'content-begin':
            break
          case 'content-commit':
            value = { accepted: false, revision: request.revision }
            if (
              contentInstallRevision === request.revision &&
              contentInstallHideEpoch === hideEpoch
            ) {
              contentInstallRevision = undefined
              contentInstallHideEpoch = undefined
              value = { accepted: true, revision: request.revision }
              appRegions.present()
              render(x)
            }
            break
          case 'lens-debug':
            for (const scene of [
              ...layers.values(),
              ...[...regions.values()].flatMap(list => [...list.values()]),
            ])
              scene.setLensDebug(request.view)
            appRegions.setLensDebug(request.view)
            render(x)
            value = { view: request.view }
            break
          case 'appearance-begin':
            // Installed out of band above, like the hide cancellation barrier.
            break
          case 'appearance-commit':
            // A capture started before hide cannot release the resumed submission gate.
            value = { accepted: false, revision: request.revision }
            if (
              appearanceInstallRevision === request.revision &&
              appearanceInstallHideEpoch === hideEpoch
            ) {
              appearanceInstallRevision = undefined
              appearanceInstallHideEpoch = undefined
              value = { accepted: true, revision: request.revision }
              appRegions.present()
              render(x)
            }
            break
          case 'canonical': {
            if (request.request.type === 'appearance') {
              for (const scene of [
                ...layers.values(),
                ...[...regions.values()].flatMap(list => [...list.values()]),
              ])
                scene.setAppearance(request.request.value)
            }
            value = await appRegions.request(request.request)
            // Canonical production does not send the legacy source/layer-source messages
            // that schedule background prewarming. Finish compilation before acknowledging
            // its first device-backed setup, while the app still holds launch readiness.
            // Only menu kernels gate launch; the remaining surfaces warm in the background.
            const canonicalDevice = owner.liveDevice
            if (canonicalDevice && canonicalDevice !== preparedCanonicalDevice) {
              const started = glassNow()
              await prewarmKernels(canonicalDevice, ['menu', 'ink', 'contextComposite'])
              preparedCanonicalDevice = canonicalDevice
              glassTiming('menu-kernels-prewarmed', started)
              schedulePrewarm()
            }
            if (request.request.type === 'appearance') {
              if (
                appearanceRefreshPending &&
                request.appearanceRevision === deviceAppearanceRevision
              ) {
                const graph = FrameGraph.for(owner)
                for (const [role, entries] of [
                  ['front', retainedPlanes],
                  ['glyphs', keptImages],
                ] as const)
                  for (const retained of entries.values()) {
                    retained.texture.release()
                    retained.texture = graph.target(
                      role,
                      retained.image.value.width,
                      retained.image.value.height,
                      false,
                      retained.image.key,
                    )
                    graph.upload(retained.image.value, retained.texture.value)
                  }
                for (const [slot, texture] of slotTextures) {
                  const image = shared.get(slot)
                  texture.release()
                  if (!image) {
                    slotTextures.delete(slot)
                    continue
                  }
                  const replacement = graph.target(
                    'front',
                    image.value.width,
                    image.value.height,
                    false,
                    image.key,
                  )
                  slotTextures.set(slot, replacement)
                  graph.upload(image.value, replacement.value)
                }
                if (visible && receivedHideEpoch === hideEpoch) {
                  await appRegions.prepareResume()
                  if (visible && receivedHideEpoch === hideEpoch) {
                    appearanceRefreshPending = false
                    appRegions.present()
                  } else {
                    await appRegions.request({ type: 'visibility', visible: false })
                    appearanceRefreshPending = false
                  }
                } else appearanceRefreshPending = false
              }
              render(x)
            }
            if (request.request.type === 'scene' || request.request.type === 'source')
              messageFrame(request.request.type)
            wake()
            break
          }
          case 'navigation-track':
            if (request.track.epoch >= navigationInputAt) {
              navigationInputAt = request.track.epoch
              navigationTrack = request.track
              navigationPose = {
                key: request.key,
                pose: sampleNavigation(request.track, epochNow() + presentationLeadMs),
              }
              wake()
            }
            break
          case 'navigation-atlas': {
            if (request.revision < sharedRevision) {
              for (const cell of request.cells) if ('image' in cell) cell.image.close()
              value = { superseded: true }
              break
            }
            sharedRevision = request.revision
            const device = owner.liveDevice
            if (!device) throw Error('Navigation atlas has no live device')
            const graph = FrameGraph.for(owner),
              key = request.key + ':front'
            const replay = await retainNavigationAtlas(graph, request)
            const lease = graph.virtual(key, request.width, request.height, replay)
            let target: GraphLease<import('./passes.ts').Target> | undefined
            const started = glassNow()
            try {
              target = graph.target('front', request.width, request.height, false, key)
              gpuScope(device, 'navigation atlas', () => {
                graph.reconstructVirtual(key)
              })
              graph.markUploaded(target.value)
              releaseSlot('navigation')
              shared.set('navigation', lease)
              slotTextures.set('navigation', target)
            } catch (error) {
              lease.release()
              target?.release()
              throw error
            }
            glassTiming('navigation-atlas-gpu', started)
            value = { slots: [...shared.keys()] }
            break
          }
          case 'navigation-pose':
            if (request.at >= navigationInputAt) {
              navigationInputAt = request.at
              navigationTrack = undefined
              navigationPose = { key: request.key, pose: request.pose }
              raster.setNavigation(request.pose)
              appRegions.setNavigation(request.pose, request.key)
              render(x)
            }
            break
          case 'navigation-regions': {
            // The dock's first navigation frame goes first: installing every region presenter before it
            // delayed the dock's motion onset by a worker frame (the regions follow from the next frame).
            if (!request.prepare && raster.navigationRoutes > 1 && handle)
              await new Promise<void>((resolve, reject) => frameWaiters.push({ resolve, reject }))
            const lease = shared.get('navigation')
            if (!lease || lease.key !== request.key + ':front')
              throw Error('Navigation atlas is not installed for glass regions')
            await appRegions.navigationSource({
              key: request.key,
              lease,
              routes: request.routes,
              contentLayer: request.contentLayer,
              width: request.width,
              height: request.height,
              pose:
                navigationPose?.key === request.key
                  ? navigationTrack
                    ? sampleNavigation(navigationTrack, epochNow() + presentationLeadMs)
                    : navigationPose.pose
                  : undefined,
              rows: request.rows,
              deferPresent: request.prepare ? false : !!navigationTrack,
            })
            value = { navigation: request.key }
            break
          }
          case 'surface-input':
            menuInput.input(request)
            break
          case 'tab-config':
            reducedMotion = !!request.reducedMotion
            sharedTabLift = !!request.sharedLift
            tab.configure(request.centres, request.width, request.height, request.dockWidth, {
              selected: request.selected,
              centerY: request.centerY,
              parameters: sharedTabLift ? TAB_INTERACTIVE_MOTION : undefined,
              heldGeometry: sharedTabLift
                ? tabHeldGeometry(
                    request.width,
                    request.height,
                    request.dockWidth,
                    request.placement,
                  )
                : undefined,
              widths: request.widths,
            })
            break
          case 'tab-input': {
            if (request.event === 'down') {
              tabTiming = { sent: request.at, received, handled: epochNow() }
              tab.down(request.x, request.index, request.at)
            } else if (request.event === 'move') tab.move(request.x)
            else if (request.event === 'up') tab.up(request.at, request.cancelled, request.index)
            else if (request.event === 'select') tab.select(request.index, request.at)
            else if (!tab.active || request.cancelled) {
              tab.reset(request.index)
              if (raster.spec?.tabSelection) {
                const spec = raster.spec
                raster.updateSpec({
                  ...spec,
                  tabSelection: {
                    ...spec.tabSelection!,
                    capsule: tab.capsule(),
                    lensMix: 0,
                    restMix: 1,
                  },
                })
                const overlay = layers.get('chrome-lift')
                if (overlay?.spec) {
                  overlay.updateSpec(raster.spec!)
                  overlay.setLift({ amount: 0, source: 'composed', optics: tab.optics() })
                }
                render(x)
              }
            }
            wake()
            break
          }
          case 'region-track':
            if (!regionById(request.track.id)) throw Error('Unknown region track')
            tracks.set(request.track.id, request.track)
            wake()
            break
          case 'region-spec': {
            const region = regionById(request.id)
            if (!region) throw Error('Unknown region')
            tracks.delete(request.id)
            region.updateSpec(request.spec)
            render(x)
            break
          }
          case 'lag-trace':
            setLagTrace(request.enabled)
            tracedFrames.length = 0
            break
          case 'source-scroll':
            scrollSequence = request.sequence
            for (const scene of scrollFollowers()) {
              scene.setScroll(request.y)
              if (request.trigger) scene.setTrigger(request.trigger)
            }
            if (
              request.layer &&
              Backdrop.for(owner).setScroll(request.layer, request.x ?? 0, request.y)
            )
              appRegions.backdropMoved()
            dirty = true
            wake()
            break
          case 'backdrop-keyboard':
            for (const layer of request.layers)
              Backdrop.for(owner).setKeyboard(layer.id, layer.key, layer.keyboard, layer.scroll)
            if (Backdrop.for(owner).sampleKeyboard(epochNow())) appRegions.backdropMoved()
            dirty = true
            wake()
            break
          case 'backdrop-scroll':
            if (Backdrop.for(owner).setScroll(request.id, request.x, request.y)) {
              appRegions.backdropMoved()
              dirty = true
              wake()
            }
            break
          case 'backdrop-edges':
            if (Backdrop.for(owner).setEdges(request.edges)) {
              appRegions.backdropMoved()
              dirty = true
              wake()
            }
            break
          case 'capability':
            frameProbe.useDevice(await owner.ready(), clock.kind !== 'worker-raf')
            value = { backend: 'webgpu', timestampQuery: frameProbe.timestampQuery }
            break
          case 'init':
            if (request.appearance !== 'light' && request.appearance !== 'dark')
              throw Error('Glass initialization requires a presented appearance')
            presentationLeadMs = request.presentationLeadMs ?? 0
            if (
              !Number.isFinite(presentationLeadMs) ||
              presentationLeadMs < 0 ||
              presentationLeadMs > 50
            )
              throw Error('Experimental glass presentation lead must be between 0 and 50 ms')
            await appRegions.request({
              type: 'appearance',
              value: request.appearance,
              reducedMotion: false,
            })
            await raster.init(request.canvas, owner, {
              id: 'chrome',
              depth: 0,
              attachment: { kind: 'fixed' },
            })
            value = { ready: true, backend: 'webgpu' }
            break
          case 'source-images': {
            if (request.revision < sharedRevision) {
              for (const { image } of request.images) image?.close()
              value = { superseded: true }
              break
            }
            sharedRevision = request.revision
            // Only a backdrop capture replaces the source paired with live region geometry.
            // Navigation atlas uploads and cache eviction share this transport, but do not
            // publish a new backdrop scene revision on the page.
            if (request.backdrop) appRegions.beginSourceChange(request.revision)
            const graph = FrameGraph.for(owner)
            // Kept before any slot is replaced: an image is alive only while something holds it.
            for (const key of request.keep ?? []) {
              const kept = keptImages.get(key)
              const image = kept?.image ?? graph.retain(key)
              // Taken anew every time the ink is kept: a lease from before a device loss holds a
              // texture of the lost device (never handed out again, see FrameGraph.target), and
              // would not keep alive the texture the ink was uploaded to since.
              const texture = graph.target(
                'glyphs',
                image.value.width,
                image.value.height,
                false,
                key,
              )
              kept?.texture.release()
              keptImages.set(key, { image, texture })
            }
            for (const [index, { slot, key, image }] of request.images.entries()) {
              let lease: GraphLease<ImageBitmap>
              try {
                // Without an image the slot takes a kept one again (no capture, no upload).
                lease = image ? graph.image(key, image) : graph.retain(key)
              } catch (error) {
                for (const rest of request.images.slice(index + 1)) rest.image?.close()
                throw error
              }
              releaseSlot(slot)
              shared.set(slot, lease)
            }
            for (const key of request.unkeep ?? []) {
              const kept = keptImages.get(key)
              kept?.texture.release()
              kept?.image.release()
              keptImages.delete(key)
            }
            // A plane leaving the set (a route covered by a push) can stay resident, image and texture,
            // so a pop back to it composes from its capture instead of re-rasterizing and re-uploading.
            for (const key of request.retain ?? [])
              if (!retainedPlanes.has(key)) {
                const image = graph.retain(key)
                retainedPlanes.set(key, {
                  image,
                  texture: graph.target('front', image.value.width, image.value.height, false, key),
                })
              }
            for (const { slot, key } of request.restore ?? []) {
              const retained = retainedPlanes.get(key)
              if (!retained) throw Error('Retained glass plane is not resident: ' + key)
              releaseSlot(slot)
              shared.set(slot, retained.image)
              slotTextures.set(slot, retained.texture)
              retainedPlanes.delete(key)
            }
            if (request.removePinned?.length) {
              Backdrop.for(owner).removePinned(request.removePinned)
              appRegions.backdropMoved()
              dirty = true
            }
            for (const slot of request.release ?? []) releaseSlot(slot)
            // Planes retain their images before any slot above is released by a later batch.
            if (request.layers) {
              // Regions of unselected tabs take their last frame over their own backdrop first;
              // the selected tab's regions resume once its planes are installed.
              if (request.suspendedRegions)
                appRegions.holdForBackdropChange(request.suspendedRegions)
              Backdrop.for(owner).setLayers(request.layers)
              if (request.suspendedRegions)
                appRegions.resumeForBackdropChange(request.suspendedRegions)
              if (request.edges) Backdrop.for(owner).setEdges(request.edges)
              appRegions.backdropMoved()
              dirty = true
            }
            for (const key of request.unretain ?? []) {
              const retained = retainedPlanes.get(key)
              retained?.texture.release()
              retained?.image.release()
              retainedPlanes.delete(key)
            }
            const backdrop = request.backdrop
            if (backdrop && !backdrop.regions) {
              if (appRegions.sharedRevision !== undefined)
                await appRegions.request({ type: 'release-source', id: 'root-backdrop' })
            } else if (backdrop) {
              await appRegions.request({
                type: 'appearance',
                value: backdrop.appearance,
                reducedMotion: backdrop.reducedMotion,
              })
              if (appRegions.sharedRevision !== backdrop.revision || appRegions.navigationActive) {
                const bitmap = sharedImage(backdrop.key)
                await appRegions.shareSource(
                  {
                    id: 'root-backdrop',
                    revision: backdrop.revision,
                    layerId: 'chrome',
                    role: 'transmitted-backdrop',
                    origin: { x: 0, y: 0 },
                    width: bitmap.width / backdrop.resolution,
                    height: bitmap.height / backdrop.resolution,
                    resolution: backdrop.resolution,
                  },
                  bitmap,
                  backdrop.key,
                  true,
                )
              }
            }
            // A resumed region whose root capture did not change is installed here.
            if (request.layers && request.suspendedRegions) await appRegions.installPending()
            value = { slots: [...shared.keys()] }
            break
          }
          case 'source': {
            if (
              superseded(request.revision) ||
              (request.revision !== undefined && request.revision < sourceRevision)
            ) {
              closeImages(request)
              value = { superseded: true }
              break
            }
            sourceRevision = request.revision ?? sourceRevision + 1
            const [front, rear, glyphs] = images(request)
            cancel()
            plan = undefined
            x = 0
            const at = epochNow(),
              start = performance.now()
            raster.install(request.setup, front, rear, glyphs, false)
            if (tab.active) presentTabSelection()
            if (request.settle !== false) {
              render(x)
              await raster.settled()
            } else dirty = true
            if (!firstPresent && visible) {
              firstPresent = true
              glassTiming('first-present-complete')
              schedulePrewarm()
            }
            wake()
            value = {
              receivedAfterMs: at - request.sentAt,
              installMs: performance.now() - start,
              ...raster.report(),
            }
            break
          }
          case 'cover-layer':
            if (!layers.has(request.layerId)) throw Error('Unknown glass layer')
            if (request.covered) covered.add(request.layerId)
            else covered.delete(request.layerId)
            layers.get(request.layerId)!.setCovered(request.covered)
            for (const scene of regions.get(request.layerId)?.values() ?? [])
              scene.setCovered(request.covered)
            if (!request.covered) render(x)
            cancel()
            wake()
            value = { covered: [...covered] }
            break
          case 'detach-layer': {
            if (request.layerId === 'menu-lift' || request.layerId === 'menu') menuInput.clear()
            if (request.layerId === 'chrome' && !request.regionId)
              throw Error('Cannot detach root layer')
            const list = regions.get(request.layerId)
            if (request.regionId) {
              list?.get(request.regionId)?.dispose()
              list?.delete(request.regionId)
            } else {
              layers.get(request.layerId)?.dispose()
              layers.delete(request.layerId)
              for (const scene of list?.values() ?? []) scene.dispose()
              regions.delete(request.layerId)
              owner.detach(request.layerId)
            }
            render(x)
            value = owner.report()
            break
          }
          case 'layer-viewport': {
            const scene = layers.get(request.layerId)
            if (!scene) throw Error('Unknown glass layer ' + request.layerId)
            scene.setCanvasViewport(request.viewport)
            value = { viewport: request.viewport }
            break
          }
          case 'attach-layer': {
            if (layers.has(request.layer.id)) throw Error('Duplicate layer')
            const scene = new WebGPURaster()
            scene.setSubmissionGate(submissionAllowed)
            await scene.init(request.canvas, owner, request.layer)
            layers.set(request.layer.id, scene)
            value = owner.report()
            break
          }
          case 'layer-source': {
            if (superseded(request.revision)) {
              closeImages(request)
              value = { superseded: true }
              break
            }
            let scene = layers.get(request.layerId)
            if (!scene) throw Error('Unknown layer')
            if (request.regionId) {
              const list = regions.get(request.layerId) ?? new Map<string, WebGPURaster>()
              const region = list.get(request.regionId) ?? scene.forkRegion()
              list.set(request.regionId, region)
              regions.set(request.layerId, list)
              scene = region
            }
            scene.setCovered(covered.has(request.layerId))
            const [front, rear, glyphs] = images(request)
            scene.install(request.setup, front, rear, glyphs, false)
            if (request.layerId === 'chrome-lift' && tab.active) presentTabSelection()
            if (request.settle !== false) {
              render(x)
              await scene.settled()
            } else {
              dirty = true
              wake()
            }
            if (!firstPresent && visible && !request.setup.liftOverlay) {
              firstPresent = true
              glassTiming('first-present-complete')
              schedulePrewarm()
            }
            menuInput.sourceInstalled()
            value = scene.report()
            break
          }
          case 'run':
            validateTrack(request.plan)
            if (
              request.plan.sourceRevision !== undefined &&
              request.plan.sourceRevision !== sourceRevision
            )
              throw Error('Motion source revision is not installed')
            cancel()
            frames = []
            previous = undefined
            plan = request.plan
            x = plan.from
            inputAt = plan.epoch
            wake()
            value = { started: true }
            break
          case 'pose':
            if (request.at >= inputAt) {
              x = request.x
              inputAt = request.at
            }
            break
          case 'benchmark':
            cancel()
            plan = undefined
            value = await raster.benchmark()
            break
          case 'stage':
            if (dirty) {
              dirty = false
              render(x)
            }
            value = await raster.stageSnapshot(request.stage, request.level)
            break
          case 'snapshot': {
            if (dirty) {
              dirty = false
              render(x)
            }
            const scene = layers.get(request.layerId ?? 'chrome')
            if (!scene) {
              value = await appRegions.snapshot(request.layerId!)
              break
            }
            if (request.x !== undefined) scene.draw(request.x)
            value = await scene.snapshot()
            break
          }
          case 'report':
            value = {
              executionThread: typeof document === 'undefined' ? 'worker' : 'main',
              shading: [
                raster,
                ...layers.values(),
                ...[...regions.values()].flatMap(list => [...list.values()]),
              ]
                .filter((r, i, a) => a.indexOf(r) === i)
                .reduce(
                  (n, r) => ({
                    presentPixels: n.presentPixels + r.stats.presentPixels,
                    presentAttachmentPixels:
                      n.presentAttachmentPixels + r.stats.presentAttachmentPixels,
                    draws: n.draws + r.stats.draws,
                  }),
                  { presentPixels: 0, presentAttachmentPixels: 0, draws: 0 },
                ),
              interactive: {
                tab: {
                  timing: tabTiming,
                  active: tab.active,
                  pending: tab.needsFrame,
                  amount: tab.lensMix,
                  capsule: tab.capsule(),
                  optics: tab.optics(),
                  spec: raster.spec,
                },
                menu: {
                  active: menuLift.active,
                  pending: menuLift.needsFrame,
                  amount: menuLift.lensMix,
                },
              },
              appRegions: appRegions.diagnostics(),
              ...raster.report(),
              frames,
              callbacks,
              framePending: !!handle,
              rate: 60,
              clock: clock.kind ?? 'page-raf',
              visible,
              presentationGate: {
                allowed: submissionAllowed(),
                presentationEpoch,
                hideEpoch,
                appearanceRefreshPending,
                appearanceInstallRevision,
                appearanceInstallHideEpoch,
                deviceAppearanceRevision,
                lost,
              },
              sourceRevision,
              covered: [...covered],
              regions: [...regions.entries()].map(([layer, list]) => ({
                layer,
                ids: [...list.keys()],
              })),
              layerReports: [...layers.entries()].map(([id, scene]) => ({ id, ...scene.report() })),
              regionInteractions: appRegions.diagnostics().interactions,
              regionPresenters: appRegions.diagnostics().presenterOrigins,
              regionPoses: appRegions.diagnostics().regionPoses,
              backdropPlanes: Backdrop.for(owner).report(),
              lagTrace: lagTraceEnabled() ? exportLagTrace() : undefined,
              loop: {
                handle: !!handle,
                looping,
                visible,
                lost,
                tracks: [...tracks].map(([id, t]) => [
                  id,
                  Math.round(epochNow() - t.epoch),
                  t.duration,
                ]),
                covered: [...covered],
              },
              presentations: [...layers.entries()].map(([id, scene]) => ({
                layer: id,
                surfaces: [scene, ...(regions.get(id)?.values() ?? [])]
                  .map(surface => surface.presentation())
                  .filter(Boolean),
              })),
              backdrop: Backdrop.for(owner).report(),
            }
            break
          case 'visible': {
            // A second foreground notification can arrive after the user has already
            // pressed a control or started a presentation. Keep that input and motion,
            // and let its new source work proceed without another restore ahead of it.
            // A changed appearance, hide epoch or lost device still takes the full path.
            if (
              request.visible &&
              visible &&
              !lost &&
              !appearanceRefreshPending &&
              presentationEpoch === receivedHideEpoch &&
              receivedHideEpoch === hideEpoch &&
              restoredAppearance &&
              receivedAppearance === restoredAppearance &&
              request.appearance === restoredAppearance.value &&
              (request.reducedMotion ?? false) === restoredAppearance.reducedMotion
            ) {
              if (lagTraceEnabled()) glassTiming('resume-already-restored')
              value = { visible }
              break
            }
            cancel()
            dirty = false
            plan = undefined
            // A track ends at its target here, as the page's own run does when it hides
            // (production.ts, handleVisibility): dropped at its last sample, the tab bar kept a
            // mid-morph shape (a Search member half out) until the next source install.
            for (const [id, track] of tracks) regionById(id)?.updateSpec(track.specs.at(-1)!)
            tracks.clear()
            navigationTrack = undefined
            menuInput.clear()
            const scenes = [
              ...layers.values(),
              ...[...regions.values()].flatMap(list => [...list.values()]),
            ]
            if (!request.visible) {
              visible = false
              for (const scene of scenes) scene.setVisible(false)
              Backdrop.for(owner).suspend()
              await appRegions.request({ type: 'visibility', visible: false })
              tab.reset(tab.selected)
              menuLift.reset(0)
              for (const surface of [layers.get('chrome-lift'), menuLiftRaster()])
                if (surface?.spec)
                  surface.setLift({ amount: 0, source: 'transmissive', optics: tab.optics() })
            } else {
              try {
                if (request.appearance !== 'light' && request.appearance !== 'dark')
                  throw Error('Glass resume requires a current presented appearance')
                await owner.ready()
                if (receivedHideEpoch !== hideEpoch) break
                // Appearance arrivals bypass the serialized GPU wait. Retint retained
                // sources again if the page store changes before the first submission.
                while (receivedHideEpoch === hideEpoch) {
                  const appearance = receivedAppearance!
                  for (const scene of scenes) {
                    scene.setVisible(false)
                    scene.setAppearance(appearance.value)
                  }
                  await appRegions.request({
                    type: 'appearance',
                    value: appearance.value,
                    reducedMotion: appearance.reducedMotion,
                  })
                  if (receivedHideEpoch !== hideEpoch) break
                  for (const scene of scenes) scene.setVisible(true, true)
                  await appRegions.prepareResume()
                  await raster.settled()
                  if (appearance === receivedAppearance) break
                }
                if (receivedHideEpoch !== hideEpoch) {
                  for (const scene of scenes) scene.setVisible(false)
                  await appRegions.request({ type: 'visibility', visible: false })
                  break
                }
                appearanceRefreshPending = false
                presentationEpoch = receivedHideEpoch
                restoredAppearance = receivedAppearance
                visible = true
                if (prewarmPending) schedulePrewarm()
                appRegions.present()
                render(x)
                await raster.settled()
              } catch (error) {
                visible = false
                for (const scene of scenes) scene.setVisible(false)
                await appRegions.request({ type: 'visibility', visible: false })
                throw error
              }
            }
            value = { visible }
            break
          }
          case 'force-null-adapters':
            owner.forceNullAdaptersForTest(request.attempts)
            raster.loseDevice()
            value = { requested: true }
            break
          case 'lose-context':
            raster.loseDevice()
            value = { requested: true }
            break
          case 'restore-context':
            value = { automatic: true }
            break
        }
        if (profiled)
          glassTiming(
            'worker-request',
            started,
            request.type === 'canonical' ? 'canonical:' + request.request.type : request.type,
          )
        if (requestMark) requestMark.ms = glassNow() - started
        if (adapterRecoveryReady && !appearanceRefreshPending) {
          adapterRecoveryReady = false
          emit({ adapterRecovery: false })
        }
        publishPresentationGate()
        if (id) emit({ id, value })
      })
      .catch(error => {
        reportError(request.type, error)
        if (id) emit({ id, error: String(error) })
      })
  }

  return {
    receive,
    stop: () => {
      pausePrewarm()
      prewarmPending = false
      owner.stop()
      cancel()
    },
  }
}
