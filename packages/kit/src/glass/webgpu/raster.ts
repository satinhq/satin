import {
  canvasSubmissionCosts,
  submitCanvasCommands,
  trackCanvasWrite,
} from './canvasSubmission.ts'
import { morphFieldSampleBounds } from '../morphField.ts'
import { uncoveredSourceRows } from './captureBands.ts'
import type { GlassCanvas, GlassViewport } from '../rendererContract.ts'
import { TAB_BAR_BLUR_SIGMA, stableTabSelection } from '../lens/tabSelectionMaterial.ts'
/// <reference types="@webgpu/types" />
import { contextBackdropFit } from './contextComposite.ts'
import { glassNow, glassTimed, glassTimedAsync, glassTiming } from './profile.ts'
import { lagTraceEnabled } from './lagTrace.ts'
import { traceCapture, traceResult, traceSourcePlane, traceSubmitted } from './sampleTrace.ts'
import { lensDebugIndex, type LensDebugView } from './lensDebug.ts'
import { FrameGraph, type GraphLease } from './frameGraph.ts'
import { Backdrop } from './backdrop.ts'
import { edgesUnderSurface, encodeScrollEdges } from './edgePass.ts'
import type { NavigationPose } from './productionTracks.ts'
import { gpuScope, drainGPUErrors } from './errors.ts'
import { LayerDevice, type GlassLayer } from './layers.ts'
import { Passes, clampScissor, encodePass, viewOf, type Target } from './passes.ts'
import type { RasterSetup } from '../worker/protocol.ts'
import type { SurfaceRenderSpec } from '../renderSpecs.ts'
import { rasterPipelines } from './rasterShaders.ts'
import {
  areaMipLevels,
  encodeAreaMips,
  pyramidClamp,
  pyramidContent,
  pyramidStorage,
} from './areaMips.ts'
import { encodeMaterial, encodeTabSelection, usesAreaMips } from './rasterMaterial.ts'
import {
  compositeUniforms,
  backdropFillEdges,
  lensLiftUniforms,
  liftLighting,
  liftLightingClocks,
  liftVisibleAmount,
  materialUniforms,
  pageBackground,
  planeCompositeUniforms,
  sharedLiftUniforms,
  type ResultLayout,
} from './rasterUniforms.ts'

/** One result encode's shared inputs (encodeResult and the passes it runs). */
type ResultFrame = {
  encoder: GPUCommandEncoder
  /** The tab-drag pose (CSS px). */
  x: number
  layout: ResultLayout
  sampleRect: readonly number[]
  backdrop: Backdrop
  backdropRect: readonly [number, number, number, number]
  backdropKey: string
  background: number[]
}

// Cumulative acquired drawable cost, sampled at both ends of a perf window.
// Acquisition can precede an abandoned command buffer; submitted area is tracked separately.
const drawableCost = { pixels: 0, waitMs: 0, count: 0 }
export const drawableCosts = () => ({ ...drawableCost, ...canvasSubmissionCosts() })
let nextRaster = 0
/** A layer canvas that covers only part of its layer: [x,y,width,height] in layer CSS px. */
const canvasViewports = new WeakMap<GlassCanvas, readonly [number, number, number, number]>()
/** A canvas's next drawable. WebKit blocks here when the canvas presented again before the
 * compositor released a drawable; that wait stalls the whole worker thread (timed for the probe). */
function drawable(context: GPUCanvasContext, kind: string, encoder: GPUCommandEncoder) {
  const at = glassNow()
  const texture = context.getCurrentTexture()
  const waited = glassNow() - at
  trackCanvasWrite(encoder, context.canvas, texture.width * texture.height)
  drawableCost.pixels += texture.width * texture.height
  drawableCost.waitMs += waited
  drawableCost.count++
  if (waited > 3) glassTiming('drawable-wait', at, kind)
  if (lagTraceEnabled()) presentedCanvases.push(`${texture.width}x${texture.height}`)
  // Whatever is drawn now replaces the canvas content: presentLayer records it again if it is the one drawing.
  presentedLayers.delete(context.canvas)
  return texture
}
/** What each layer canvas last presented through `presentLayer`: every visible surface's result
 * revision and its placement on the canvas.
 *
 * WebKit blocks a worker thread for every canvas a frame draws to, in proportion to the
 * canvas's pixels (measured in the Catalyst host: about 21 ms per megapixel, whatever is drawn).
 * So a frame presents only the layer canvases whose content changed; an untouched canvas keeps
 * showing its last frame. A renderer that runs in the document (page-owned canvases) is not
 * blocked that way: there the skip only spares the GPU the unchanged canvases (a menu morph
 * presents 0.66 MP per frame instead of 1.49 MP). Any other draw to a canvas (a single-surface
 * draw, a clear) forgets its entry, so the next layer present is never skipped. */
const presentedLayers = new WeakMap<object, string>()
/** Lag trace: the pixel size of every canvas drawn to since the last call (each one is presented
 * by WebKit when the frame ends, and the worker waits for it). */
const presentedCanvases: string[] = []
export function takePresentedCanvases() {
  return presentedCanvases.splice(0).join(' ')
}
/** Thin WebGPU reference candidate. No Pixi imports, contexts, tickers, or DOM reads. */
/** A retained spec's material at a new appearance. The tab bar's material blur follows the
 * appearance; any other selection (the scope bar's thumb) keeps its region's own material. */
export function retainedAppearanceSpec(
  spec: SurfaceRenderSpec,
  appearance: RasterSetup['appearance'],
): SurfaceRenderSpec {
  if (!spec.tabSelection || spec.id !== 'dock') return spec
  return {
    ...spec,
    blurSigmaCssPx: TAB_BAR_BLUR_SIGMA[appearance],
    tabSelection: { ...spec.tabSelection, ...stableTabSelection(appearance) },
  }
}
export class WebGPURaster {
  private submissionAllowed = () => true
  setSubmissionGate(allowed: () => boolean) {
    this.submissionAllowed = allowed
  }
  private resultOwner = `raster-result-${++nextRaster}`
  private device!: GPUDevice
  private context!: GPUCanvasContext
  private canvas!: GlassCanvas
  private passes!: Passes
  private setup?: RasterSetup
  private lensDebug = 0
  setLensDebug(view: LensDebugView) {
    this.lensDebug = lensDebugIndex(view)
  }
  private targets: Record<string, Target> = {}
  private graph!: FrameGraph
  private textureLeases: GraphLease<Target>[] = []
  private imageLeases: GraphLease<ImageBitmap>[] = []
  private bitmaps?: { front: ImageBitmap; rear: ImageBitmap; glyphs: ImageBitmap }
  private compositePipeline!: GPURenderPipeline
  private overlayPipeline!: GPURenderPipeline
  private presentPipeline!: GPURenderPipeline
  private format: GPUTextureFormat = 'rgba8unorm'
  private presentationRoot?: WebGPURaster
  private presentationOrigin?: { x: number; y: number }
  private presentationMembers = new Set<WebGPURaster>()
  private presentationSequence?: readonly WebGPURaster[]
  private collectingPresentation = false
  /** Member samples encode their materials first. The root then presents the whole frame once. */
  withSharedPresentation(draw: () => void) {
    this.collectingPresentation = true
    try {
      draw()
    } finally {
      this.collectingPresentation = false
    }
  }
  /** Retain independent material sampling, but store overlapping fixed chrome once. */
  joinPresentation(root: WebGPURaster, origin: { x: number; y: number }) {
    if (this.presentationRoot === root) {
      this.presentationOrigin = origin
      if (root.setup) root.resizeCanvas()
      return
    }
    if (this.setup) this.clear()
    this.presentationRoot?.presentationMembers.delete(this)
    this.presentationRoot = root
    this.presentationOrigin = origin
    root.presentationMembers.add(this)
    if (root.setup) root.resizeCanvas()
    root.forgetPresent()
  }
  leavePresentation() {
    const root = this.presentationRoot
    root?.presentationMembers.delete(this)
    if (root?.setup) root.resizeCanvas()
    root?.forgetPresent()
    this.presentationRoot = undefined
    this.presentationOrigin = undefined
  }
  private lost = false
  private suspended = false
  private covered = false
  private initialized = false
  onLoss = () => {}
  onRestore = () => {}
  /** `presentPixels` counts fragments the layer-sized result/present passes shade; `presentAttachmentPixels` what they would shade unscissored. */
  readonly stats = {
    sourceInstalls: 0,
    sourceBytes: 0,
    draws: 0,
    submissions: 0,
    presentPixels: 0,
    presentAttachmentPixels: 0,
  }
  private owner!: LayerDevice
  private unsubscribe?: () => void
  async init(
    canvas: GlassCanvas,
    owner: LayerDevice,
    layer: GlassLayer,
    presenter?: import('../rendererContract.ts').GlassPresenter,
  ) {
    if (this.initialized) throw Error('WebGPU renderer already initialized')
    this.initialized = true
    this.canvas = canvas
    this.owner = owner
    this.belowScrollEdges = layer.attachment.kind === 'scroll'
    this.context = await owner.attach(layer, canvas, presenter)
    this.bindDevice(owner)
  }
  private bindDevice(owner: LayerDevice) {
    this.graph = FrameGraph.for(owner)
    this.useDevice(owner.liveDevice!)
    this.unsubscribe = owner.subscribe(device => {
      if (!device) {
        this.lost = true
        this.release()
        this.onLoss()
        return
      }
      this.useDevice(device)
      this.lost = false
      this.forgetPresent()
      this.resultEmpty = false
      if (this.setup && !this.suspended) {
        this.allocate()
        this.upload()
      }
      this.onRestore()
    })
  }
  /** Update retained chrome material before unsuspending its first resume frame. */
  setAppearance(appearance: RasterSetup['appearance']) {
    if (!this.setup) return
    const spec = this.setup.spec
    this.setup = { ...this.setup, appearance, spec: retainedAppearanceSpec(spec, appearance) }
  }
  dispose() {
    this.presentationRoot?.presentationMembers.delete(this)
    this.presentationRoot?.forgetPresent()
    this.unsubscribe?.()
    this.release()
    this.passes.destroy()
    for (const lease of this.imageLeases) lease.release()
    this.imageLeases = []
    this.bitmaps = undefined
    this.setup = undefined
  }
  /** Keep only the pixels this surface last presented on its canvas: drop its setup and every
   * image and texture lease (a hidden tab's region must not pin a capture that has left the
   * resident budget). A parked surface cannot draw by any path (motion, device restore, app
   * resume): nothing encodes without a setup. It draws again once it is installed again. */
  park() {
    this.release()
    for (const lease of this.imageLeases) lease.release()
    this.imageLeases = []
    this.bitmaps = undefined
    this.setup = undefined
    this.navigation = undefined
    this.lastBackdropKey = ''
  }
  forkRegion() {
    const region = new WebGPURaster()
    region.setSubmissionGate(this.submissionAllowed)
    region.initialized = true
    region.canvas = this.canvas
    region.context = this.context
    region.owner = this.owner
    region.bindDevice(this.owner)
    return region
  }
  private useDevice(device: GPUDevice) {
    return gpuScope(device, 'useDevice', () => this.useDeviceScoped(device))
  }
  private useDeviceScoped(device: GPUDevice) {
    this.device = device
    this.passes = new Passes(device)
    const cached = rasterPipelines(device, this.format)
    this.compositePipeline = cached.composite
    this.overlayPipeline = cached.overlay
    this.presentPipeline = cached.present
  }
  loseDevice() {
    this.owner.loseForTest()
  }
  private allocatedStorage?: string
  private release() {
    this.allocatedStorage = undefined
    for (const lease of this.textureLeases) lease.release()
    this.textureLeases = []
    this.targets = {}
  }
  private allocate() {
    gpuScope(this.device, 'allocate', () => this.allocateScoped())
    this.allocatedStorage = this.storageKey(this.setup!, this.imageLeases)
  }
  private allocateScoped() {
    const { spec, resolution } = this.setup!
    const sampleWidth = spec.sampleWidth
    const sampleHeight = spec.sampleHeight
    // Canvas dimensions change only at presentation, after preparation succeeds.
    const target = (name: string, x: number, y: number, mip = false) => {
      const source = ['front', 'rear', 'glyphs'].indexOf(name)
      const lease = this.graph.target(
        name,
        x,
        y,
        mip,
        source >= 0
          ? this.imageLeases[source].key
          : name === 'result'
            ? this.resultOwner
            : undefined,
      )
      this.textureLeases.push(lease)
      this.targets[name] = lease.value
    }
    target('front', this.bitmaps!.front.width, this.bitmaps!.front.height)
    if (this.setup!.navigationAtlas || this.bitmaps!.front === this.bitmaps!.rear)
      this.targets.rear = this.targets.front
    else target('rear', this.bitmaps!.rear.width, this.bitmaps!.rear.height)
    target('glyphs', this.bitmaps!.glyphs.width, this.bitmaps!.glyphs.height)
    for (const name of ['source', 'composed'])
      target(name, sampleWidth * resolution, sampleHeight * resolution)
    // Results (and a menu's material) cover the surface's sample rectangle plus one pixel
    // for its fractional layer offset, not the whole layer: a full-screen intermediate is
    // cleared and stored every frame on a tile GPU. See resultOrigin in drawScoped.
    const [resultWidth, resultHeight] = this.resultSize()
    target(
      'material',
      spec.materialProfile === 'menu' ? resultWidth : sampleWidth * resolution,
      spec.materialProfile === 'menu' ? resultHeight : sampleHeight * resolution,
    )
    target('result', resultWidth, resultHeight)
    if (spec.treatment) {
      const presentationWidth =
        spec.treatment === 'alert' ||
        spec.treatment === 'confirmation' ||
        spec.treatment === 'sheet'
          ? Math.ceil(sampleWidth)
          : sampleWidth * resolution
      const presentationHeight =
        spec.treatment === 'alert' ||
        spec.treatment === 'confirmation' ||
        spec.treatment === 'sheet'
          ? Math.ceil(sampleHeight)
          : sampleHeight * resolution
      target('presentationHorizontal', presentationWidth, presentationHeight)
      target('presentationVertical', presentationWidth, presentationHeight)
    } else if (spec.variant === 'clear') {
      target('clearHorizontal', sampleWidth * resolution, sampleHeight * resolution)
      target('clearVertical', sampleWidth * resolution, sampleHeight * resolution)
    }
    // A field can highlight one member even when its resting material has no tint.
    // Keep that pass available throughout a press, including clear/presentation materials.
    if (spec.tint?.[3] || spec.shape?.members?.length)
      target('tinted', sampleWidth * resolution, sampleHeight * resolution)
    if (this.setup!.lift?.optics)
      target('liftRest', sampleWidth * resolution, sampleHeight * resolution)
    const scale = spec.materialProfile === 'menu' ? 0.25 : 0.5
    // WebKit rejects a viewport extending even fractionally past its attachment.
    // Preserve the logical sampling grid and pad storage to contain that viewport. The bar
    // material's pyramid pads to whole coarse texels, so its levels do not follow the surface's
    // size (areaMips.ts).
    const pyramidSize = usesAreaMips(spec) ? pyramidStorage : Math.ceil
    target(
      'pyramid',
      pyramidSize(sampleWidth * resolution * scale),
      pyramidSize(sampleHeight * resolution * scale),
      true,
    )
    target(
      'horizontal',
      Math.ceil(sampleWidth * resolution * 0.25),
      Math.ceil(sampleHeight * resolution * 0.25),
    )
    target(
      'vertical',
      Math.ceil(sampleWidth * resolution * 0.25),
      Math.ceil(sampleHeight * resolution * 0.25),
    )
  }
  private upload() {
    for (const name of ['front', 'rear', 'glyphs'] as const)
      if (name !== 'rear' || this.targets.rear !== this.targets.front)
        this.graph.upload(this.bitmaps![name], this.targets[name])
  }
  /** `present:false` prepares storage and uploads without drawing; a batch's final render presents every surface together. */
  install(
    setup: RasterSetup,
    front: ImageBitmap,
    rear: ImageBitmap,
    glyphs: ImageBitmap,
    present = true,
  ) {
    const leases: GraphLease<ImageBitmap>[] = []
    try {
      const first = this.graph.image(
        setup.sourceKey ? setup.sourceKey + ':front' : undefined,
        front,
      )
      leases.push(first)
      // One immutable capture serves as both composite inputs unless navigation supplies a distinct rear route.
      if (setup.navigationAtlas || rear === front) {
        if (rear !== front && rear !== first.value) rear.close()
        leases.push(this.graph.image(first.key, first.value))
      } else
        leases.push(this.graph.image(setup.sourceKey ? setup.sourceKey + ':rear' : undefined, rear))
      leases.push(this.graph.image(setup.glyphKey, glyphs))
    } catch (error) {
      // Shared slot images stay owned by their graph lease; only unowned transfers are closed.
      for (const lease of leases) lease.release()
      for (const image of new Set([front, rear, glyphs])) if (!this.graph.owns(image)) image.close()
      throw error
    }
    this.installLeases(setup, leases, present)
  }
  /** The scene retains canonical images; each presenter acquires its own leases. */
  installRetained(
    setup: RasterSetup,
    source: GraphLease<ImageBitmap>,
    foreground: GraphLease<ImageBitmap>,
    present = true,
  ) {
    const leases = [
      this.graph.image(source.key, source.value),
      this.graph.image(source.key, source.value),
      this.graph.image(foreground.key, foreground.value),
    ]
    return this.installLeases(setup, leases, present)
  }
  /** Allocation identity belongs to GPU storage, never to a spec already changed by a live pose. */
  private storageKey(setup: RasterSetup, images: GraphLease<ImageBitmap>[]) {
    return JSON.stringify([
      setup.width,
      setup.height,
      setup.resolution,
      setup.spec.sampleWidth,
      setup.spec.sampleHeight,
      setup.spec.materialProfile,
      setup.spec.variant,
      setup.spec.treatment,
      !!(setup.spec.tint?.[3] || setup.spec.shape?.members?.length),
      !!setup.lift?.optics,
      !!setup.navigationAtlas,
      images.map(lease => lease.key),
    ])
  }
  private installLeases(setup: RasterSetup, leases: GraphLease<ImageBitmap>[], present = true) {
    const replace = this.allocatedStorage !== this.storageKey(setup, leases)
    // Acquire replacement storage before releasing the old: a texture whose key
    // survives (shared capture, unchanged glyphs) keeps its upload.
    const previousTextures = replace ? this.textureLeases : []
    if (replace) {
      this.textureLeases = []
      this.targets = {}
      this.allocatedStorage = undefined
    }
    const previousImages = this.imageLeases
    this.imageLeases = leases
    this.navigation = undefined
    this.bitmaps = { front: leases[0].value, rear: leases[1].value, glyphs: leases[2].value }
    this.setup = setup
    // Navigation can restore a scrolled route before the next source-scroll message.
    // The capture and its offset must reach the first presentation together.
    if (setup.sourceScrollY !== undefined) this.scrollY = setup.sourceScrollY
    this.stats.sourceBytes = [...new Set(Object.values(this.bitmaps))].reduce(
      (total, bitmap) => total + bitmap.width * bitmap.height * 4,
      0,
    )
    this.stats.sourceInstalls++
    try {
      if (!this.suspended && !this.lost) {
        if (replace) {
          glassTimed('source-allocate', () => this.allocate())
          glassTimed('source-upload', () => this.upload())
        } else glassTiming('source-storage-reused')
        if (present) glassTimed('source-draw-submit', () => this.draw(0))
      }
    } finally {
      for (const lease of previousTextures) lease.release()
      for (const lease of previousImages) lease.release()
    }
    return replace
  }
  clear() {
    if (this.lost || this.suspended || !this.submissionAllowed()) return
    this.forgetPresent()
    gpuScope(this.device, 'clear presenter', () => {
      const encoder = this.device.createCommandEncoder()
      encodePass(
        encoder,
        {
          colorAttachments: [
            {
              view: this.context.getCurrentTexture().createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 0],
            },
          ],
        },
        () => {},
      )
      submitCanvasCommands(this.device, encoder, encoder.finish())
      this.stats.submissions++
    })
  }
  setCovered(covered: boolean) {
    this.covered = covered
    this.forgetPresent()
  }
  get isCovered() {
    return this.covered
  }
  setVisible(visible: boolean, deferDraw = false) {
    if (this.suspended === !visible) return
    this.suspended = !visible
    this.forgetPresent()
    if (!visible) this.release()
    else if (this.setup && !this.lost) {
      this.allocate()
      this.upload()
      if (!deferDraw) this.draw(this.lastX)
    }
  }
  /** `scissor` ([x,y,w,h] device pixels, clamped to `size`) bounds fragment work to the
   * pixels a pass can change; the clear load op still covers the whole attachment. */
  private custom(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    output: GPUTextureView,
    values: number[],
    textures: Target[],
    load = false,
    scissor?: readonly number[],
    size?: readonly [number, number],
  ) {
    // Present draws carry an opacity slot (1 unless a surface fades, e.g. the bar trigger in a
    // menu morph) and an occluder (none for the passes that compose a result).
    if (pipeline === this.presentPipeline && values.length === 4)
      values = [...values, 1, 0, 0, 0, 0, 0, 0, 0]
    const buffer = this.passes.uniform(new Float32Array(values))
    const group = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: this.passes.sampler },
        ...textures.map((texture, i) => ({ binding: i + 2, resource: viewOf(texture.texture) })),
      ],
    })
    const timestampWrites =
      this.timing && (pipeline === this.compositePipeline || pipeline === this.presentPipeline)
        ? {
            querySet: this.timing.queries,
            ...(pipeline === this.compositePipeline
              ? { beginningOfPassWriteIndex: 0 }
              : { endOfPassWriteIndex: 1 }),
          }
        : undefined
    const rect = scissor && size ? clampScissor(scissor, size[0], size[1]) : undefined
    if (size) {
      this.stats.presentAttachmentPixels += size[0] * size[1]
      this.stats.presentPixels += rect ? rect[2] * rect[3] : size[0] * size[1]
    }
    encodePass(
      encoder,
      {
        colorAttachments: [{ view: output, loadOp: load ? 'load' : 'clear', storeOp: 'store' }],
        timestampWrites,
      },
      pass => {
        if (rect) pass.setScissorRect(...rect)
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, group)
        pass.draw(3)
      },
      pipeline === this.compositePipeline
        ? 'composite'
        : size && size[0] === this.canvas?.width && size[1] === this.canvas?.height
          ? 'present-canvas'
          : 'present',
    )
    this.passes.draws++
  }
  private timing?: { queries: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer }
  async benchmark(count = 30) {
    if (this.lost || this.suspended || this.covered || !this.setup)
      throw Error('Cannot benchmark an inactive glass scene')
    const timed = this.device.features.has('timestamp-query')
    if (timed)
      this.timing = gpuScope(this.device, 'timestamp allocation', () => ({
        queries: this.device.createQuerySet({ type: 'timestamp', count: 2 }),
        resolve: this.device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        }),
        read: this.device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
      }))
    const samples: { cpuMs: number; gpuMs: number | null }[] = []
    try {
      for (let i = 0; i < count + 5; i++) {
        const start = performance.now()
        this.draw(i)
        const cpuMs = performance.now() - start
        let gpuMs: number | null = null
        if (this.timing) {
          await this.timing.read.mapAsync(GPUMapMode.READ)
          const time = new BigUint64Array(this.timing.read.getMappedRange())
          gpuMs = Number(time[1] - time[0]) / 1e6
          this.timing.read.unmap()
        } else await this.device.queue.onSubmittedWorkDone()
        if (i >= 5) samples.push({ cpuMs, gpuMs })
      }
    } finally {
      this.timing?.queries.destroy()
      this.timing?.resolve.destroy()
      this.timing?.read.destroy()
      this.timing = undefined
    }
    return {
      samples,
      timestampQuery: timed,
      boundary:
        'Explicit isolated frame benchmark; excludes source capture/upload and compositor/scanout.',
    }
  }
  get spec() {
    return this.setup?.spec
  }
  private navigation?: NavigationPose
  setNavigation(pose: NavigationPose) {
    this.navigation = pose
  }
  /** Route cells in its installed navigation atlas (0 when it composes a settled capture). */
  get navigationRoutes() {
    return (this.setup?.navigationAtlas ?? 0) > 1 ? this.setup!.navigationAtlas! : 0
  }
  private scrollY = 0
  setTrigger(trigger: RasterSetup['trigger']) {
    if (this.setup) this.setup = { ...this.setup, trigger }
  }
  setScroll(y: number) {
    this.scrollY = y
  }
  /** A fixed region's backdrop moved under it: same storage and uploads, new sampling origin. */
  setSourceOrigin(origin: { x: number; y: number }) {
    if (this.setup) this.setup = { ...this.setup, sourceOrigin: origin }
  }
  /** A region presenter moved in the viewport (its canvas scrolled or relaid out). */
  setViewportOrigin(origin: { x: number; y: number }) {
    if (this.setup) this.setup = { ...this.setup, viewportOrigin: origin }
  }
  private liveViewport?: GlassViewport
  /** Moving the canvas changes where it looks, never its retained source or target storage. */
  setViewport(viewport: GlassViewport) {
    this.liveViewport = viewport
  }
  updateSpec(spec: RasterSetup['spec']) {
    if (!this.setup) throw Error('Region source is not installed')
    if (
      !Number.isFinite(spec.sampleWidth) ||
      !Number.isFinite(spec.sampleHeight) ||
      spec.sampleWidth <= 0 ||
      spec.sampleHeight <= 0
    )
      throw Error('Invalid glass sampling envelope')
    this.setup = { ...this.setup, spec }
    if (
      this.allocatedStorage !== this.storageKey(this.setup, this.imageLeases) &&
      !this.suspended &&
      !this.lost
    ) {
      this.release()
      this.allocate()
      this.upload()
      glassTiming('envelope-reprepared')
    }
  }
  setLift(lift: RasterSetup['lift']) {
    if (!this.setup) throw Error('Lift source is not installed')
    if (lift?.optics && !this.targets.liftRest && !this.suspended && !this.lost)
      throw Error('Shared lift storage was not prepared')
    this.setup = { ...this.setup, lift }
  }
  private lastX = 0
  draw(x: number, clear = true) {
    if (!this.submissionAllowed()) return
    return gpuScope(this.device, 'draw', () => this.drawScoped(x, clear))
  }
  private drawScoped(x: number, clear = true) {
    if (!this.submissionAllowed()) return
    const encoder = this.device?.createCommandEncoder()
    if (!encoder || !this.encodeResult(encoder, x)) return
    if (this.presentationRoot) {
      const root = this.presentationRoot
      if (!root.collectingPresentation && root.targets.result)
        WebGPURaster.presentLayer(encoder, root.presentationSequence ?? [root])
    } else {
      this.resizeCanvas()
      this.custom(
        encoder,
        this.presentPipeline,
        drawable(this.context, 'single', encoder).createView(),
        this.presentUniform(),
        [this.targets.result],
        !clear,
        this.presentScissor(),
        [this.canvas.width, this.canvas.height],
      )
    }
    if (this.timing) {
      encoder.resolveQuerySet(this.timing.queries, 0, 2, this.timing.resolve, 0)
      encoder.copyBufferToBuffer(this.timing.resolve, 0, this.timing.read, 0, 16)
    }
    submitCanvasCommands(this.device, encoder, encoder.finish())
    this.submitted()
  }
  submitted() {
    this.passes.submitted()
    this.stats.draws = this.passes.draws
    this.stats.submissions++
    if (lagTraceEnabled())
      traceSubmitted(this.targets.result.texture, {
        raster: this.resultOwner,
        region: this.setup!.spec.id,
        revision: this.resultRevision,
        submission: this.stats.submissions,
        empty: this.resultEmpty,
        scrollY: this.scrollY,
        viewport: JSON.stringify(this.liveViewport ?? null),
      })
  }
  private presentRect?: readonly number[]
  /** Layer-space device-pixel origin of the result texture (integer, so presents are 1:1). */
  private resultOrigin: [number, number] = [0, 0]
  /** Chrome surfaces (a bar or menu on a full-screen layer) keep a local result; a
   * region presenter's layer already is its sample rectangle and keeps layer space. */
  private localResult = false
  /** Device-pixel offset of this layer's canvas within its layer. */
  private presentationViewport() {
    const viewport = canvasViewports.get(this.canvas)
    if (!viewport || !this.setup || !this.presentationMembers.size) return viewport
    // The placeholder keeps its original band. object-fit:contain, aligned to the
    // bottom, lets the worker omit transparent rows above all retained morph bounds.
    const top = Math.max(
      viewport[1],
      Math.floor(
        Math.min(
          this.setup.spec.frameY - 64,
          ...[...this.presentationMembers].map(member => member.presentationOrigin!.y),
        ),
      ),
    )
    return [viewport[0], top, viewport[2], viewport[1] + viewport[3] - top] as const
  }
  private canvasOffset() {
    const viewport = this.presentationViewport()
    const resolution = this.setup!.resolution
    return viewport ? [viewport[0] * resolution, viewport[1] * resolution] : [0, 0]
  }
  private canvasSize(): [number, number] {
    const viewport = this.presentationViewport()
    const { resolution, width, height } = this.setup!
    return viewport
      ? [Math.round(viewport[2] * resolution), Math.round(viewport[3] * resolution)]
      : [Math.round(width * resolution), Math.round(height * resolution)]
  }
  private resizeCanvas() {
    const [width, height] = this.canvasSize()
    if (this.canvas.width !== width || this.canvas.height !== height) this.forgetPresent()
    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
  }
  /** Size the shared layer canvas to a band of its layer (the element is placed there by
   * the page): a lift overlay presents a strip, not a second full-screen canvas. */
  setCanvasViewport(viewport: readonly [number, number, number, number] | undefined) {
    if (viewport) canvasViewports.set(this.canvas, viewport)
    else canvasViewports.delete(this.canvas)
    this.forgetPresent()
  }
  /** Surface opacity on its layer canvas (spec.opacity; 1 when absent). */
  private presentAlpha() {
    return Math.max(0, Math.min(1, this.setup?.spec.opacity ?? 1))
  }
  /** `spec.occluder` on the layer canvas: [radius, centre x, centre y, half width, half height]
   * in canvas pixels, or zeros. */
  private presentOccluder() {
    const spec = this.setup?.spec
    const occluder = spec?.occluder
    if (!spec || !occluder || occluder.halfWidth <= 0 || occluder.halfHeight <= 0)
      return [0, 0, 0, 0, 0]
    const resolution = this.setup!.resolution
    const [offsetX, offsetY] = this.canvasOffset()
    return [
      occluder.radius * resolution,
      (spec.frameX + occluder.centerX) * resolution - offsetX,
      (spec.frameY + occluder.centerY) * resolution - offsetY,
      occluder.halfWidth * resolution,
      occluder.halfHeight * resolution,
    ]
  }
  /** The present uniform for this surface's layer canvas: placement, opacity and occluder. */
  private presentUniform() {
    const [radius, ...occluder] = this.presentOccluder()
    return [...this.presentOrigin(), this.presentAlpha(), radius!, 0, 0, ...occluder]
  }
  private presentScissor() {
    const rect = this.presentRect
    if (!rect) return rect
    const [offsetX, offsetY] = this.canvasOffset()
    return [rect[0] - offsetX, rect[1] - offsetY, rect[2], rect[3]]
  }
  /** Present uniform: where the result texture lands on the layer canvas. */
  private presentOrigin() {
    const { resolution, width, height } = this.setup!
    const [resultX, resultY] = this.resultOrigin
    const result = this.targets.result
    const [offsetX, offsetY] = this.canvasOffset()
    return this.localResult
      ? [resultX - offsetX, resultY - offsetY, result.width, result.height]
      : [-offsetX, -offsetY, width * resolution, height * resolution]
  }
  private resultSize(): [number, number] {
    const { spec, resolution, width, height } = this.setup!
    const sampleWidth = spec.sampleWidth
    const sampleHeight = spec.sampleHeight
    const local: [number, number] =
      spec.materialProfile === 'menu'
        ? [
            Math.ceil(Math.ceil(sampleWidth * resolution * 0.25) / 0.25) + 1,
            Math.ceil(Math.ceil(sampleHeight * resolution * 0.25) / 0.25) + 1,
          ]
        : [Math.ceil(sampleWidth * resolution) + 1, Math.ceil(sampleHeight * resolution) + 1]
    this.localResult = local[0] * local[1] * 2 < width * resolution * height * resolution
    return this.localResult ? local : [width * resolution, height * resolution]
  }
  /** Result holds nothing (a lift overlay at rest): presenting it would only clear. */
  private resultEmpty = false
  /** Counts every re-encode of the result: an unchanged count means unchanged result pixels. */
  private resultRevision = 0
  /** The next layer present of this raster's canvas is never skipped (its content, size or
   * device changed outside `presentLayer`). */
  private forgetPresent() {
    presentedLayers.delete(this.canvas)
  }
  /** Present every surface of one canvas layer in a single render pass: one clear, one
   * store of the canvas per frame instead of a load+store per surface. Results are
   * per-raster storage, so presenting after every surface has encoded is safe.
   * Returns false, drawing nothing, when the canvas already shows exactly this (see
   * `presentedLayers`): the same results at the same places, or nothing at all. */
  static presentLayer(encoder: GPUCommandEncoder, rasters: readonly WebGPURaster[]) {
    const root = rasters[0]
    // Only the presenter sizes shared canvas storage. Region results can have different
    // sample dimensions; encoding them must not repeatedly resize the layer canvas.
    root.resizeCanvas()
    root.presentationSequence = rasters
    const visible = [...new Set([...rasters, ...root.presentationMembers])].filter(
      raster =>
        !raster.resultEmpty && !!raster.targets.result && !raster.covered && !raster.suspended,
    )
    const signature = JSON.stringify([
      root.canvas.width,
      root.canvas.height,
      visible.map(raster => [
        raster.resultOwner,
        raster.resultRevision,
        raster.groupPresentUniform(root),
        raster.groupPresentScissor(root),
      ]),
    ])
    if (presentedLayers.get(root.canvas) === signature) return false
    const draws = visible.map(raster => raster.presentDraw(root))
    const size = [root.canvas.width, root.canvas.height] as const
    encodePass(
      encoder,
      {
        colorAttachments: [
          {
            view: drawable(root.context, 'layer', encoder).createView(),
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      },
      pass => {
        for (const draw of draws) {
          const rect: [number, number, number, number] = draw.rect
            ? clampScissor(draw.rect, size[0], size[1])
            : [0, 0, size[0], size[1]]
          pass.setScissorRect(...rect)
          pass.setPipeline(root.presentPipeline)
          pass.setBindGroup(0, draw.group)
          pass.draw(3)
          draw.raster.stats.presentAttachmentPixels += size[0] * size[1]
          draw.raster.stats.presentPixels += rect[2] * rect[3]
          draw.raster.passes.draws++
        }
      },
      'canvas-layer',
    )
    presentedLayers.set(root.canvas, signature)
    return true
  }
  private presentationOffset(root: WebGPURaster) {
    if (this.presentationRoot !== root || !this.presentationOrigin) return [0, 0]
    const resolution = this.setup!.resolution
    const [x, y] = this.canvasOffset()
    const [rootX, rootY] = root.canvasOffset()
    return [
      this.presentationOrigin.x * resolution + x - rootX,
      this.presentationOrigin.y * resolution + y - rootY,
    ]
  }
  private groupPresentUniform(root: WebGPURaster) {
    const values = this.presentUniform()
    const [x, y] = this.presentationOffset(root)
    values[0] += x
    values[1] += y
    values[8] += x
    values[9] += y
    return values
  }
  private groupPresentScissor(root: WebGPURaster) {
    const rect = this.presentScissor()
    if (!rect) return rect
    const [x, y] = this.presentationOffset(root)
    return [rect[0] + x, rect[1] + y, rect[2], rect[3]]
  }
  private presentDraw(root: WebGPURaster) {
    const buffer = this.passes.uniform(new Float32Array(this.groupPresentUniform(root)))
    const group = this.device.createBindGroup({
      layout: this.presentPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: this.passes.sampler },
        { binding: 2, resource: viewOf(this.targets.result.texture) },
      ],
    })
    return { raster: this as WebGPURaster, group, rect: this.groupPresentScissor(root) }
  }
  /** Scroll-attached glass is part of the scrolling content, and the navigation bar's scroll-edge
   * effect is painted over that content (CSS, a layer above the scroll container). Its own
   * backdrop is the content behind it, without the edge: composing the edge in as well applied
   * the effect twice where such glass passes under the bar, and redrew it in every scroll frame
   * while it was there. Bar glass sits above the edge and keeps refracting the treated backdrop. */
  private belowScrollEdges = false
  private lastBackdropKey = ''
  /** Diagnostics: the backdrop key the last composite used. */
  get composedBackdropKey() {
    return this.lastBackdropKey
  }
  /** This surface's sample rectangle in viewport coordinates. */
  private backdropRect(): readonly [number, number, number, number] {
    const { spec, viewportOrigin } = this.setup!
    const viewport = this.liveViewport
    const scaleX = viewport?.scaleX ?? 1
    const scaleY = viewport?.scaleY ?? 1
    return [
      (viewport?.x ?? viewportOrigin?.x ?? 0) + (spec.frameX - spec.sampleInsetX) * scaleX,
      (viewport?.y ?? viewportOrigin?.y ?? 0) + (spec.frameY - spec.sampleInsetY) * scaleY,
      spec.sampleWidth * scaleX,
      spec.sampleHeight * scaleY,
    ]
  }
  /** Whether the backdrop under this surface changed since its last encode (a plane scrolled or moved). */
  backdropStale() {
    const backdrop = Backdrop.for(this.owner)
    return (
      !!this.setup &&
      backdrop.installed &&
      backdrop.keyFor(
        this.backdropRect(),
        this.setup.contentLayer,
        this.setup.spec.backdropExclusions,
        this.belowScrollEdges,
        !!this.setup.spec.backdropMenuOverlay,
        this.navigation,
      ) !== this.lastBackdropKey
    )
  }
  /** Sample-sized scratch for the scroll-edge blur, acquired only by surfaces under a bar edge. */
  private edgeScratch(): [Target, Target] {
    const targets = this.targets
    for (const name of ['edgeH', 'edgeV'])
      if (!targets[name]) {
        const lease = this.graph.target(name, targets.source.width, targets.source.height)
        this.textureLeases.push(lease)
        targets[name] = lease.value
      }
    return [targets.edgeH, targets.edgeV]
  }
  /** Compose the screen-space backdrop under this surface into its source target: the
   * page background, then each plane clipped to its viewport rectangle. The content
   * plane keeps the navigation composite (pose, route atlas) on the raster's own capture. */
  private composeBackdrop(
    encoder: GPUCommandEncoder,
    backdrop: Backdrop,
    rect: readonly [number, number, number, number],
    content: number[],
    background: number[],
  ) {
    const targets = this.targets
    const resolution = this.setup!.resolution
    const scaleX = this.liveViewport?.scaleX ?? 1
    const scaleY = this.liveViewport?.scaleY ?? 1
    const size = [targets.source.width, targets.source.height] as const
    const contentLayer = this.setup!.contentLayer
    const draws = backdrop
      .under(rect, this.setup!.spec.backdropExclusions, !!this.setup!.spec.backdropMenuOverlay)
      .map(({ plane, clip }) => {
        const layer = plane.layer
        const missing = uncoveredSourceRows(
          rect,
          layer,
          layer.id === contentLayer ? this.setup!.navigationCoverage : undefined,
        )
        if (missing)
          throw Error(
            `Glass ${this.setup!.spec.id} samples rows ${missing.top.toFixed(1)}..` +
              `${missing.bottom.toFixed(1)} of plane ${layer.id}, whose capture holds only ` +
              JSON.stringify(
                layer.id === contentLayer
                  ? (this.setup!.navigationCoverage?.rows ?? layer.rows)
                  : layer.rows,
              ),
          )
        const x0 = Math.floor(((clip[0] - rect[0]) / scaleX) * resolution)
        const y0 = Math.floor(((clip[1] - rect[1]) / scaleY) * resolution)
        const scissor = clampScissor(
          [
            x0,
            y0,
            Math.ceil(((clip[0] + clip[2] - rect[0]) / scaleX) * resolution) - x0,
            Math.ceil(((clip[1] + clip[3] - rect[1]) / scaleY) * resolution) - y0,
          ],
          size[0],
          size[1],
        )
        let values: number[]
        let textures: Target[]
        if (layer.id === contentLayer) {
          values = [...content]
          if (this.liveViewport) {
            values[4] = rect[0]
            values[5] = rect[1]
          }
          // A route atlas is viewport-space; the settled capture is plane-local.
          if (!this.setup!.navigationAtlas) {
            values[3] = layer.width
            values[4] -= layer.origin.x
            values[5] -= layer.origin.y
            // A windowed content plane: its fill beyond the window's open edges (compositeSource).
            values[15] = backdropFillEdges(layer)
            values.splice(53, 3, ...layer.fill.slice(0, 3))
          }
          textures = [targets.front, targets.rear]
        } else if (layer.follows === contentLayer && !this.setup!.navigationAtlas) {
          // The window pinned at the top of the content plane's list is the content plane there:
          // the same pose and the same treatment beside the capture, with its own pixels.
          const texture = backdrop.texture(plane)
          values = [...content]
          if (this.liveViewport) {
            values[4] = rect[0]
            values[5] = rect[1]
          }
          values[3] = layer.width
          values[4] -= layer.origin.x
          values[5] -= layer.origin.y
          values[12] = layer.height
          values[13] = layer.height
          values[15] = backdropFillEdges(layer)
          values.splice(53, 3, ...layer.fill.slice(0, 3))
          textures = [texture, texture]
        } else {
          const texture = backdrop.texture(plane)
          values = planeCompositeUniforms(size, resolution, layer, rect)
          textures = [texture, texture]
        }
        values[56] = scaleX
        values[57] = scaleY
        const pipeline = layer.menuOverlay ? this.overlayPipeline : this.compositePipeline
        const uniforms = new Float32Array(values)
        if (lagTraceEnabled() && scissor[2] && scissor[3])
          traceSourcePlane(
            targets.source.texture,
            {
              raster: this.resultOwner,
              region: this.setup!.spec.id,
              plane: layer.id,
              key: layer.key,
            },
            uniforms,
            scissor,
            {
              viewport: JSON.stringify(rect),
              originX: layer.origin.x,
              originY: layer.origin.y,
              scrollX: layer.scroll.x,
              scrollY: layer.scroll.y,
              rows: JSON.stringify(layer.rows ?? null),
              follows: layer.follows ?? null,
              overlay: !!layer.menuOverlay,
            },
          )
        const buffer = this.passes.uniform(uniforms)
        const group = this.device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer } },
            { binding: 1, resource: this.passes.sampler },
            ...textures.map((texture, i) => ({
              binding: i + 2,
              resource: viewOf(texture.texture),
            })),
          ],
        })
        return { scissor, group, pipeline, overlay: !!layer.menuOverlay }
      })
    encodePass(
      encoder,
      {
        colorAttachments: [
          {
            view: viewOf(targets.source.texture),
            loadOp: 'clear',
            clearValue: background,
            storeOp: 'store',
          },
        ],
      },
      pass => {
        pass.setPipeline(this.compositePipeline)
        for (const draw of draws) {
          if (draw.overlay || !draw.scissor[2] || !draw.scissor[3]) continue
          pass.setScissorRect(...draw.scissor)
          pass.setBindGroup(0, draw.group)
          pass.draw(3)
          this.passes.draws++
        }
      },
      'composite',
    )
    // Bar glass refracts the scroll-edge-treated backdrop, as native bar buttons do.
    const edges = this.belowScrollEdges
      ? []
      : edgesUnderSurface(
          backdrop.edgesUnder(rect, this.navigation),
          this.setup!.spec.materialProfile,
        )
    if (edges.length)
      encodeScrollEdges(
        encoder,
        this.device,
        values => this.passes.uniform(values),
        this.passes.sampler,
        targets.source,
        this.edgeScratch(),
        rect,
        resolution,
        edges,
        [scaleX, scaleY],
      )
    const overlays = draws.filter(draw => draw.overlay)
    if (overlays.length) {
      encodePass(
        encoder,
        {
          colorAttachments: [
            { view: viewOf(targets.source.texture), loadOp: 'load', storeOp: 'store' },
          ],
        },
        pass => {
          for (const draw of overlays) {
            if (!draw.scissor[2] || !draw.scissor[3]) continue
            pass.setPipeline(draw.pipeline)
            pass.setScissorRect(...draw.scissor)
            pass.setBindGroup(0, draw.group)
            pass.draw(3)
            this.passes.draws++
          }
        },
        'backdrop-overlay',
      )
    }
  }
  /** Encode this surface's passes up to its result; false when it cannot draw now. */
  encodeResult(encoder: GPUCommandEncoder, x: number) {
    if (!this.setup || this.lost || this.suspended || this.covered) return false
    this.lastX = x
    const setup = this.setup
    const { spec, appearance, resolution } = setup
    const targets = this.targets
    const sampleRect = this.sampleRectangle()
    this.presentRect = sampleRect
    // Result space = layer space shifted by an integer pixel origin, so every kernel
    // rasterizes at the same pixel centres (and sub-pixel phase) as in layer space.
    const local = this.localResult
    const originX = (spec.frameX - spec.sampleInsetX) * resolution
    const originY = (spec.frameY - spec.sampleInsetY) * resolution
    const resultX = local ? Math.floor(originX) : 0
    const resultY = local ? Math.floor(originY) : 0
    this.resultOrigin = [resultX, resultY]
    const layout: ResultLayout = {
      spec,
      appearance,
      resolution,
      width: setup.width,
      height: setup.height,
      sampleWidth: spec.sampleWidth,
      sampleHeight: spec.sampleHeight,
      local,
      resultSampleX: originX - resultX,
      resultSampleY: originY - resultY,
      result: targets.result,
    }
    const background = pageBackground(appearance)
    const backdrop = Backdrop.for(this.owner)
    const backdropRect = this.backdropRect()
    const backdropKey = backdrop.installed
      ? backdrop.keyFor(
          backdropRect,
          setup.contentLayer,
          setup.spec.backdropExclusions,
          this.belowScrollEdges,
          !!setup.spec.backdropMenuOverlay,
          this.navigation,
        )
      : ''
    this.lastBackdropKey = backdropKey
    const resultKey = JSON.stringify([
      this.imageLeases.map(lease => lease.key),
      setup,
      this.scrollY,
      this.navigation,
      x,
      this.lensDebug,
      backdropKey,
    ])
    if (this.timing || !this.graph.matches(targets.result, resultKey)) {
      const liftAtRest = setup.liftOverlay && !(setup.lift && setup.lift.amount > 0)
      if (liftAtRest || spec.restHidden || (spec.opacity === 0 && !spec.prewarmTransparent)) {
        if (!this.resultEmpty) this.passes.clear(encoder, targets.result)
        this.resultEmpty = true
        if (lagTraceEnabled()) traceResult(targets.result.texture, null)
        this.graph.unpublish(targets.result)
      } else {
        this.resultEmpty = false
        this.encodeVisibleResult({
          encoder,
          x,
          layout,
          sampleRect,
          backdrop,
          backdropRect,
          backdropKey,
          background,
        })
      }
      this.graph.mark(targets.result, resultKey)
      this.resultRevision++
    }
    return true
  }
  /** Outside a surface's sample rectangle its result is exactly transparent (every pass clears,
   * then writes only inside its output frame), so only that rectangle needs shading. A menu's
   * material frame is its padded pyramid extent. Device px on the layer. */
  private sampleRectangle() {
    const { spec, resolution } = this.setup!
    const left = (spec.frameX - spec.sampleInsetX) * resolution
    const top = (spec.frameY - spec.sampleInsetY) * resolution
    const fieldBounds = morphFieldSampleBounds(spec)
    if (fieldBounds) {
      const [fieldX, fieldY, fieldWidth, fieldHeight] = fieldBounds
      return [
        left + fieldX * resolution,
        top + fieldY * resolution,
        fieldWidth * resolution,
        fieldHeight * resolution,
      ] as const
    }
    const pyramid = this.targets.pyramid
    return spec.materialProfile === 'menu'
      ? ([left, top, pyramid.width / 0.25, pyramid.height / 0.25] as const)
      : ([left, top, spec.sampleWidth * resolution, spec.sampleHeight * resolution] as const)
  }
  /** The whole layer, placed relative to this surface's sample rectangle (device px). */
  private layerPresentOrigin(layout: ResultLayout) {
    const { spec, resolution } = layout
    return [
      -(spec.frameX - spec.sampleInsetX) * resolution,
      -(spec.frameY - spec.sampleInsetY) * resolution,
      layout.width * resolution,
      layout.height * resolution,
    ]
  }
  /** The backdrop capture, the material (or presentation treatment), the tab selection and the
   * lift, each re-encoded only when its inputs changed. */
  private encodeVisibleResult(frame: ResultFrame) {
    const { encoder, x, layout, backdropKey } = frame
    const { spec, appearance } = layout
    const setup = this.setup!
    const targets = this.targets
    const scale = spec.materialProfile === 'menu' ? 0.25 : 0.5
    this.encodeCapture(frame, scale)
    const material = materialUniforms(layout, setup, targets.pyramid, scale)
    // The bar pyramid's storage runs past its content (areaMips.ts): reads stop at the content.
    if (usesAreaMips(spec))
      material.uInputClamp = pyramidClamp(targets.pyramid, [
        pyramidContent(layout.sampleWidth * layout.resolution * scale),
        pyramidContent(layout.sampleHeight * layout.resolution * scale),
      ])
    // A lift overlay's pre-lift result equals the bar's own result (same sources, spec,
    // scroll and pose); reuse the bar's published result and composed scratch instead
    // of re-encoding the same material, selection blur and pill passes every frame.
    const baseKey = JSON.stringify([
      this.imageLeases.map(lease => lease.key),
      { ...setup, lift: undefined, liftOverlay: undefined },
      this.scrollY,
      this.navigation,
      x,
      this.lensDebug,
      layout.local,
      targets.result.width,
      targets.result.height,
      backdropKey,
    ])
    const published =
      !this.timing && setup.liftOverlay && setup.lift
        ? this.graph.publishedResult(baseKey)
        : undefined
    const baseResult =
      published &&
      published !== targets.result &&
      (!spec.tabSelection || this.graph.matches(targets.composed, baseKey))
        ? published
        : targets.result
    if (spec.treatment === 'contextMenu') material.uMaterialShadowResponse = [1, 0, 0, 0]
    if (baseResult === targets.result) {
      encodeMaterial(encoder, this.passes, targets, layout, material)
      this.encodeResultPresent(encoder, layout, frame.sampleRect)
      if (spec.tabSelection)
        encodeTabSelection(encoder, this.passes, targets, this.graph, layout, baseKey)
    }
    const lift = setup.lift
    // Only a result that is exactly the base (no lift drawn into it) may be shared.
    if (baseResult === targets.result && !lift) this.graph.publish(baseKey, targets.result)
    else if (baseResult === targets.result) this.graph.unpublish(targets.result)
    const lensAmount = liftVisibleAmount(lift, appearance)
    if (lift && !spec.tabSelection && lift.source === 'composed') {
      this.graph.mark(targets.composed, 'lift-composed')
      this.passes.copy(encoder, viewOf(targets.source.texture), viewOf(targets.composed.texture))
      this.custom(
        encoder,
        this.presentPipeline,
        viewOf(targets.composed.texture),
        this.layerPresentOrigin(layout),
        [targets.material],
        true,
      )
    }
    if (lift && lensAmount > 0) this.encodeLift(encoder, layout, lift, lensAmount, baseResult)
    if (setup.liftOverlay && !(lift && lensAmount > 0)) {
      this.passes.clear(encoder, targets.result)
      this.resultEmpty = true
    }
    if (lagTraceEnabled())
      traceResult(targets.result.texture, this.resultEmpty ? null : targets.source.texture)
  }
  /** The composited backdrop under the surface (source target) and its blur pyramid, re-encoded
   * only when the capture, pose, scroll or backdrop under it changed. */
  private encodeCapture(frame: ResultFrame, scale: number) {
    const { encoder, x, layout, backdrop, backdropRect, backdropKey, background } = frame
    const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
    const setup = this.setup!
    const targets = this.targets
    const passes = this.passes
    const captureKey = JSON.stringify([
      this.imageLeases.slice(0, 2).map(lease => lease.key),
      setup.sourceWidth,
      setup.sourceOrigin,
      appearance,
      resolution,
      layout.width,
      sampleWidth,
      sampleHeight,
      spec.frameX - spec.sampleInsetX,
      spec.frameY - spec.sampleInsetY,
      spec.materialProfile,
      spec.treatment,
      usesAreaMips(spec),
      this.scrollY,
      this.navigation,
      x,
      setup.navigationAtlas,
      backdropKey,
    ])
    const captured =
      !this.timing &&
      this.graph.matches(targets.source, captureKey) &&
      this.graph.matches(targets.pyramid, captureKey)
    if (captured) return
    if (lagTraceEnabled()) traceCapture(targets.source.texture)
    const composite = compositeUniforms(
      setup,
      this.navigation,
      this.scrollY,
      x,
      background,
      targets.front.height,
      targets.rear.height,
    )
    if (backdrop.installed)
      this.composeBackdrop(encoder, backdrop, backdropRect, composite, background)
    else {
      if (lagTraceEnabled())
        traceSourcePlane(
          targets.source.texture,
          {
            raster: this.resultOwner,
            region: spec.id,
            plane: setup.contentLayer ?? 'own-capture',
            key: setup.sourceKey ?? 'own-capture',
          },
          new Float32Array(composite),
          [0, 0, targets.source.width, targets.source.height],
          { viewport: JSON.stringify(backdropRect), scrollY: this.scrollY },
        )
      this.custom(encoder, this.compositePipeline, viewOf(targets.source.texture), composite, [
        targets.front,
        targets.rear,
      ])
    }
    if (spec.treatment === 'contextMenu') {
      const fit = contextBackdropFit[appearance]
      passes.kernel(
        encoder,
        'contextComposite',
        targets.composed,
        {
          uResolution: [sampleWidth, sampleHeight],
          uShape: [sampleWidth / 2, sampleHeight / 2, sampleWidth / 2, sampleHeight / 2],
          uRadius: 0,
          uFilter: [0, fit.gain, fit.bias, 0],
          uAxis: [0, 0],
          uShadow: [0, 0, 0],
        },
        { uTexture: targets.source },
      )
      passes.copy(encoder, viewOf(targets.composed.texture), viewOf(targets.source.texture))
    }
    const pyramidViewport = [
      0,
      0,
      sampleWidth * resolution * scale,
      sampleHeight * resolution * scale,
    ]
    if (usesAreaMips(spec)) {
      // The bar's wide diffusion reads coarse levels: they must weigh the backdrop evenly and
      // must not follow the surface's size (areaMips.ts).
      const levelZero = areaMipLevels(targets.pyramid)[0].view
      passes.copy(
        encoder,
        viewOf(targets.source.texture),
        levelZero,
        'rgba8unorm',
        false,
        false,
        pyramidViewport,
      )
      encodeAreaMips(
        encoder,
        this.device,
        targets.pyramid,
        [pyramidContent(pyramidViewport[2]), pyramidContent(pyramidViewport[3])],
        values => passes.uniform(values),
      )
    } else passes.pyramid(encoder, targets.source, targets.pyramid, pyramidViewport)
    this.graph.mark(targets.source, captureKey)
    this.graph.mark(targets.pyramid, captureKey)
  }
  /** The material into the result: a menu copies its padded material; any other surface presents
   * it inside its sample rectangle (the present shader is zero outside it, which the clear wrote). */
  private encodeResultPresent(
    encoder: GPUCommandEncoder,
    layout: ResultLayout,
    sampleRect: readonly number[],
  ) {
    const { spec, resolution, sampleWidth, sampleHeight, resultSampleX, resultSampleY } = layout
    const targets = this.targets
    if (spec.materialProfile === 'menu') {
      this.passes.copy(encoder, viewOf(targets.material.texture), viewOf(targets.result.texture))
      return
    }
    const sample = [
      resultSampleX,
      resultSampleY,
      sampleWidth * resolution,
      sampleHeight * resolution,
    ]
    this.custom(
      encoder,
      this.presentPipeline,
      viewOf(targets.result.texture),
      [resultSampleX, resultSampleY, sampleWidth * resolution, sampleHeight * resolution],
      [targets.material],
      false,
      layout.local && spec.shape?.members?.length
        ? [
            sampleRect[0] - this.resultOrigin[0],
            sampleRect[1] - this.resultOrigin[1],
            sampleRect[2],
            sampleRect[3],
          ]
        : layout.local
          ? sample
          : sampleRect,
      [targets.result.width, targets.result.height],
    )
  }
  /** A pressed control's lift: with fitted optics, the shared-lift lens over the unchanged
   * result underneath (optionally diffused); without, the plain lens kernel. */
  private encodeLift(
    encoder: GPUCommandEncoder,
    layout: ResultLayout,
    lift: NonNullable<RasterSetup['lift']>,
    lensAmount: number,
    baseResult: Target,
  ) {
    const { spec, appearance, resolution, sampleWidth, sampleHeight } = layout
    const targets = this.targets
    const passes = this.passes
    const capsule = lift.capsule ?? spec.tabSelection?.capsule ?? spec.shape.first
    if (!lift.optics) {
      passes.kernel(
        encoder,
        'lens',
        targets.result,
        lensLiftUniforms(layout, lift, capsule, targets.source),
        {
          uTexture: targets.source,
          uClearSource: lift.source === 'transmissive' ? targets.source : targets.composed,
          uGlyphSource: targets.glyphs,
        },
        true,
      )
      return
    }
    // Capture the unchanged reference result underneath the moving aperture. One
    // foreground image is composited by sharedLift, never a faded duplicate.
    passes.copy(encoder, viewOf(targets.source.texture), viewOf(targets.liftRest.texture))
    this.custom(
      encoder,
      this.presentPipeline,
      viewOf(targets.liftRest.texture),
      layout.local
        ? [
            -layout.resultSampleX,
            -layout.resultSampleY,
            targets.result.width,
            targets.result.height,
          ]
        : this.layerPresentOrigin(layout),
      [baseResult],
      true,
    )
    if (this.setup!.liftOverlay) passes.clear(encoder, targets.result)
    const optics = lift.optics
    const lighting = liftLighting(lift, spec, appearance)
    const clocks = liftLightingClocks(lift, optics, appearance)
    let lensSource = lift.source === 'transmissive' ? targets.source : targets.composed
    if (lighting.diffusionSigmaPt > 0 && clocks[0] > 0) {
      const sigma = lighting.diffusionSigmaPt * clocks[0] * resolution * 0.25
      passes.kernel(
        encoder,
        'lensDiffusion',
        targets.horizontal,
        { uSigma: sigma, uStep: [1 / (sampleWidth * resolution * 0.25), 0] },
        { uTexture: lensSource },
      )
      passes.kernel(
        encoder,
        'lensDiffusion',
        targets.vertical,
        { uSigma: sigma, uStep: [0, 1 / (sampleHeight * resolution * 0.25)] },
        { uTexture: targets.horizontal },
      )
      lensSource = targets.vertical
    }
    passes.kernel(
      encoder,
      'sharedLift',
      targets.result,
      sharedLiftUniforms(layout, lift, optics, capsule, this.lensDebug, lensAmount),
      { uRestSource: targets.liftRest, uClearSource: lensSource, uGlyphSource: targets.glyphs },
      true,
    )
  }
  async settled() {
    await glassTimedAsync('gpu-queue-complete', () => this.device.queue.onSubmittedWorkDone())
    await drainGPUErrors(this.device)
    if (this.owner.faults.length) throw Error(this.owner.faults.splice(0).join('\n'))
  }
  async stageSnapshot(
    stage: 'source' | 'pyramid' | 'material' | 'composed' | 'vertical',
    level: number,
  ) {
    // 'source' and 'composed' are the pre-12o names of the front source and result targets.
    // A suspended (hidden) or lost raster holds no targets: the diagnostic is a no-op.
    if (this.suspended || this.lost || !this.setup)
      return {
        width: 0,
        height: 0,
        pixels: new Uint8Array(0),
        unavailable: this.lost ? 'lost' : this.suspended ? 'suspended' : 'not-installed',
      }
    const name = stage === 'source' ? 'front' : stage === 'composed' ? 'result' : stage
    const target = this.targets[name]
    if (!target) throw Error(`Glass stage "${stage}" is not materialized on this raster`)
    const width = Math.max(1, target.width >> level)
    const height = Math.max(1, target.height >> level)
    const stride = Math.ceil((width * 4) / 256) * 256
    const buffer = gpuScope(this.device, 'readback allocation', () =>
      this.device.createBuffer({
        size: stride * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
    )
    const encoder = this.device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture: target.texture, mipLevel: level },
      { buffer, bytesPerRow: stride },
      [width, height],
    )
    submitCanvasCommands(this.device, encoder, encoder.finish())
    await buffer.mapAsync(GPUMapMode.READ)
    const mapped = new Uint8Array(buffer.getMappedRange())
    const pixels = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++)
      pixels.set(mapped.subarray(y * stride, y * stride + width * 4), y * width * 4)
    buffer.unmap()
    buffer.destroy()
    return { width, height, pixels }
  }
  async snapshot() {
    const width = this.canvas.width
    const height = this.canvas.height
    const stride = Math.ceil((width * 4) / 256) * 256
    const buffer = gpuScope(this.device, 'readback allocation', () =>
      this.device.createBuffer({
        size: stride * height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      }),
    )
    this.draw(this.lastX)
    const encoder = this.device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture: this.context.getCurrentTexture() },
      { buffer, bytesPerRow: stride },
      [width, height],
    )
    submitCanvasCommands(this.device, encoder, encoder.finish())
    await buffer.mapAsync(GPUMapMode.READ)
    const mapped = new Uint8Array(buffer.getMappedRange())
    const pixels = new Uint8Array(width * height * 4)
    // Match WebGL readPixels' bottom-up rows for the 12u pair method.
    for (let y = 0; y < height; y++)
      pixels.set(mapped.subarray(y * stride, y * stride + width * 4), (height - 1 - y) * width * 4)
    buffer.unmap()
    buffer.destroy()
    return { width, height, pixels }
  }
  /** What this surface currently presents (diagnostics and the menu-close regression check). */
  presentation() {
    const spec = this.setup?.spec
    const first = spec?.shape.first
    return spec
      ? {
          id: spec.id,
          restHidden: !!spec.restHidden,
          opacity: spec.opacity ?? 1,
          empty: this.resultEmpty,
          covered: this.covered,
          lift: this.setup?.lift?.amount ?? 0,
          centre: first
            ? [+(spec.frameX + first.centerX).toFixed(2), +(spec.frameY + first.centerY).toFixed(2)]
            : null,
          radius: first?.radius ?? null,
        }
      : null
  }
  report() {
    return {
      ...this.stats,
      appearance: this.setup?.appearance ?? null,
      gpuBackingBytes: this.graph.report().gpuBytes,
      sharedGraph: this.graph.report(),
      ...this.owner.report(),
      lost: this.lost,
      suspended: this.suspended,
      covered: this.covered,
    }
  }
}
