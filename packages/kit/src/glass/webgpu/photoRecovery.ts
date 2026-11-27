import { imageCapture } from '../../image/resource.ts'
import { releaseCaptureCanvas } from './captureRelease.ts'

type Photo = { attempts: number; pending: Set<string>; unavailable: boolean; rearmed: boolean }
type PlanePhotos = {
  photos: Map<string, Photo>
  due: number
  ready: Set<string>
  canvas?: HTMLCanvasElement
}

/** Twenty failed rasters allow 80 compositions, over twice the measured 33 omitted draws. */
const photoAttemptBudget = 20
export class PhotoRecovery {
  private planes = new Map<string, PlanePhotos>()
  private frame = 0
  private timer = 0
  private readonly wake: () => void
  constructor(wake: () => void) {
    this.wake = wake
  }
  private plane(id: string) {
    let state = this.planes.get(id)
    if (!state) {
      state = { photos: new Map(), due: 0, ready: new Set() }
      this.planes.set(id, state)
    }
    return state
  }
  canvas(id: string) {
    const state = this.plane(id)
    return (state.canvas ??= document.createElement('canvas'))
  }
  swap(id: string, previous?: HTMLCanvasElement) {
    this.plane(id).canvas = previous
  }
  unavailable(id: string) {
    return new Set(
      [...this.plane(id).photos].filter(([, photo]) => photo.unavailable).map(([source]) => source),
    )
  }
  pending(id: string, scope?: string) {
    return [...(this.planes.get(id)?.photos.values() ?? [])].some(photo =>
      scope ? photo.pending.has(scope) : photo.pending.size > 0,
    )
  }
  ready(id: string, scope = 'main') {
    return !this.pending(id, scope) || this.plane(id).ready.has(scope)
  }
  defer(id: string, sources: readonly string[], scope = 'main') {
    const state = this.plane(id)
    const settled = new Set<string>()
    state.ready.delete(scope)
    for (const photo of state.photos.values()) photo.pending.delete(scope)
    let attempts = 0
    for (const source of sources) {
      const photo = state.photos.get(source) ?? {
        attempts: 0,
        pending: new Set<string>(),
        unavailable: false,
        rearmed: false,
      }
      photo.attempts++
      if (!photo.unavailable && photo.attempts < photoAttemptBudget) photo.pending.add(scope)
      if (photo.attempts >= photoAttemptBudget && !photo.unavailable) {
        photo.pending.clear()
        photo.unavailable = true
        settled.add(source)
      }
      state.photos.set(source, photo)
      attempts = Math.max(attempts, photo.attempts)
    }
    state.due = performance.now() + Math.min(250, 16 * 2 ** Math.min(attempts - 1, 4))
    this.schedule()
    return settled
  }
  /** Only a real event affecting the failed image or its ancestor can re-arm it, once. */
  damage(id: string, node: Node) {
    const state = this.planes.get(id)
    if (!state || ![...state.photos.values()].some(photo => photo.unavailable && !photo.rearmed))
      return
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return
    const images = [...element.querySelectorAll<HTMLImageElement>('img')]
    if (element instanceof HTMLImageElement) images.push(element)
    for (const image of images) {
      const source = imageCapture(image)?.source || image.currentSrc || image.src
      const photo = state.photos.get(source)
      if (!photo?.unavailable || photo.rearmed) continue
      photo.unavailable = false
      photo.attempts = 0
      photo.rearmed = true
    }
  }
  private schedule() {
    const pending = [...this.planes].filter(([id]) => this.pending(id))
    if (!pending.length) {
      clearTimeout(this.timer)
      cancelAnimationFrame(this.frame)
      this.timer = this.frame = 0
      return
    }
    if (this.timer || this.frame) return
    const due = Math.min(...pending.map(([, state]) => state.due))
    this.timer = window.setTimeout(
      () => {
        this.timer = 0
        this.frame = requestAnimationFrame(() => {
          this.frame = 0
          // A guard may decline preparation; never spin page callbacks while waiting.
          for (const [id, state] of this.planes) {
            if (!this.pending(id) || state.due > performance.now()) continue
            for (const photo of state.photos.values())
              for (const scope of photo.pending) state.ready.add(scope)
            state.due = performance.now() + 250
          }
          this.wake()
          this.schedule()
        })
      },
      Math.max(0, due - performance.now()),
    )
  }
  complete(id: string, scope = 'main') {
    this.planes.get(id)?.ready.delete(scope)
    for (const photo of this.planes.get(id)?.photos.values() ?? []) {
      photo.pending.delete(scope)
      if (!photo.pending.size && !photo.unavailable) photo.attempts = 0
    }
    this.schedule()
  }
  retain(planes: ReadonlySet<string>) {
    for (const [id, state] of this.planes)
      if (!planes.has(id)) {
        if (state.canvas) releaseCaptureCanvas(state.canvas)
        this.planes.delete(id)
      }
    this.schedule()
  }
  dispose() {
    clearTimeout(this.timer)
    cancelAnimationFrame(this.frame)
    this.timer = this.frame = 0
    for (const state of this.planes.values()) if (state.canvas) releaseCaptureCanvas(state.canvas)
    this.planes.clear()
  }
}
