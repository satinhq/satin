import type { KeyboardTranslation } from '../keyboard/translation.ts'
import type { GlassShapeTrack } from './shapeTrack.ts'
import type { GlassMaterial, GlassRegion, GlassSceneSnapshot } from './regions.ts'
import type { AccessoryViewportTrack } from './webgpu/accessoryTrack.ts'

/** 12v owns execution. These messages never import the compatibility renderer. */
export type GlassCanvas = OffscreenCanvas | HTMLCanvasElement
/** Canvas-local CSS points to the live backdrop plane coordinate space. */
export type GlassViewport = Readonly<{ x: number; y: number; scaleX: number; scaleY: number }>
export const GLASS_RENDERER_PROTOCOL = 1 as const
export type GlassInteraction = Readonly<{
  regionId: string
  phase: 'rest' | 'pressed' | 'dragging' | 'releasing'
  /** performance.timeOrigin + performance.now(), shared by document and worker. */
  epoch: number
  /** Region-local CSS pixels; input samples do not resize foreground glyphs. */
  contact?: Readonly<{ x: number; y: number }>
}>
export type GlassPresenter = Readonly<{
  id: string
  role?: 'material' | 'lift'
  layerId: string
  /** One canvas can cover a layer, a container union, or an isolated DOM stacking slot. */
  regionIds: readonly string[]
  origin: Readonly<{ x: number; y: number }>
  /** Container layout origin. Common translation moves the field without changing its local shapes. */
  fieldOrigin?: Readonly<{ x: number; y: number }>
  width: number
  height: number
  resolution: number
}>
export type GlassMaterialResponse = Readonly<{
  rest: GlassMaterial
  lift: Readonly<{
    variant: 'clear'
    /** Sample the transmitted source, never the frosted rest output. */
    source: 'transmitted-backdrop'
    blurSigma: 0
    tintAlpha: 0
    rimProfile: 'measured-reference-native'
    refractForeground: true
  }>
  liftMix: number
}>
/** A zero mix MUST take the original reference rest path without changed arithmetic. */
export function glassMaterialResponse(
  material: GlassMaterial,
  liftMix: number,
): GlassMaterialResponse {
  if (!Number.isFinite(liftMix) || liftMix < 0 || liftMix > 1)
    throw new Error('Glass liftMix must be in 0...1.')
  return {
    rest: material,
    lift: {
      variant: 'clear',
      source: 'transmitted-backdrop',
      blurSigma: 0,
      tintAlpha: 0,
      rimProfile: 'measured-reference-native',
      refractForeground: true,
    },
    liftMix: material.interactive ? liftMix : 0,
  }
}
export type GlassSource = Readonly<{
  id: string
  revision: number
  layerId: string
  regionId?: string
  role: 'transmitted-backdrop' | 'rest-underlay' | 'foreground'
  origin: Readonly<{ x: number; y: number }>
  width: number
  height: number
  resolution: number
}>
export type GlassRendererRequest =
  GlassRendererOperation | { type: 'transaction'; requests: readonly GlassRendererOperation[] }
export type GlassRendererOperation =
  | {
      type: 'initialize'
      protocol: typeof GLASS_RENDERER_PROTOCOL
      appearance: 'light' | 'dark'
      reducedMotion: boolean
    }
  | { type: 'update-presenter'; presenter: GlassPresenter }
  | {
      type: 'presenter-viewport'
      id: string
      viewport: GlassViewport
      keyboard?: KeyboardTranslation
    }
  /** A region's glass changes size inside its still frame (shapeTrack.ts). Sent as soon as the
   * run starts, ahead of the next scene, so the glass moves from its first frame. */
  | { type: 'region-shape-track'; regionId: string; track: GlassShapeTrack | undefined }
  /** A new trajectory inside the same admitted presentation source envelope. */
  | {
      type: 'region-presentation-track'
      regionId: string
      contentEpoch: number
      track: AccessoryViewportTrack
    }
  | { type: 'attach-presenter'; presenter: GlassPresenter; canvas: GlassCanvas }
  | { type: 'detach-presenter'; id: string }
  | { type: 'scene'; snapshot: GlassSceneSnapshot }
  | { type: 'source'; source: GlassSource; bitmap: ImageBitmap }
  | { type: 'release-source'; id: string }
  | { type: 'interaction'; interaction: GlassInteraction }
  | {
      type: 'morph'
      epoch: number
      namespace: string
      id: string
      from: GlassRegion
      to: GlassRegion
    }
  | { type: 'appearance'; value: 'light' | 'dark'; reducedMotion: boolean }
  | { type: 'visibility'; visible: boolean }
  | { type: 'purge' }
  | { type: 'restore' }
  | { type: 'diagnostics' }
  | { type: 'dispose' }
export type GlassRendererDiagnostics = Readonly<{
  backend: 'webgpu'
  devices: number
  contexts: number
  presenters: number
  regions: number
  scheduledFrames: number
  draws: number
  uploads: number
  copies: number
  allocatedBytes: number
  cpuMs: number
  gpuMs: number | null
}>

/** Worker failures must retain raw messages and device-loss reasons. */
export type GlassRendererReply =
  | { type: 'error'; error: import('./errors.ts').GlassError }
  | { type: 'diagnostics'; diagnostics: GlassRendererDiagnostics }
  | { type: 'ready' }

/** Submitted emerge geometry, in the region's border-box coordinates. */
export type GlassRegionEvent =
  | { type: 'accessory-ink'; regionId: string; epoch: number }
  | { type: 'presentation-gate'; allowed: boolean }
  | {
      type: 'field-motion'
      regionId: string
      start: number
      duration: number
      velocityX?: number
      velocityY?: number
      velocityScaleX?: number
      velocityScaleY?: number
      offsetX: number
      offsetY: number
      scaleX: number
      scaleY: number
    }
  | { type: 'emerge-settled'; regionId: string; generation?: number }
  /** A menu's rows moved between its glass ink and its live DOM: the glass draws them settled
   * (`open-settled`: show the DOM rows) or has taken them into the close (`close-started`). */
  | {
      type: 'emerge-ink'
      regionId: string
      generation?: number
      phase: 'open-settled' | 'close-started'
    }
