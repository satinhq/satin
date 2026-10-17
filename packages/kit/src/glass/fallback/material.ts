import type { CapsuleShape, SurfaceRenderSpec } from '../renderSpecs.ts'
import { animateElement, timelineStart } from '../../motion/animate.ts'

/** CSS owns backdrop sampling, including video that cannot be read into a GPU texture. */
export class FallbackMaterial {
  readonly element = document.createElement('div')
  private parts: HTMLDivElement[] = []
  private animations: Animation[] = []
  constructor(host: HTMLElement) {
    this.element.dataset.satinFallbackMaterial = 'true'
    this.element.setAttribute('aria-hidden', 'true')
    this.element.style.cssText =
      'position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:visible;'
    host.prepend(this.element)
  }
  private shapes(spec: SurfaceRenderSpec) {
    return (
      spec.shape.members ?? [spec.shape.first, ...(spec.shape.second ? [spec.shape.second] : [])]
    )
  }
  private frame(shape: CapsuleShape, spec: SurfaceRenderSpec) {
    return {
      transform: `translate3d(${spec.frameX + shape.centerX - shape.halfWidth}px,${spec.frameY + shape.centerY - shape.halfHeight}px,0)`,
      width: `${Math.max(0, shape.halfWidth * 2)}px`,
      height: `${Math.max(0, shape.halfHeight * 2)}px`,
      borderRadius: `${shape.radius}px ${shape.radius}px ${shape.bottomRadius ?? shape.radius}px ${shape.bottomRadius ?? shape.radius}px`,
      opacity: spec.restHidden ? 0 : (spec.opacity ?? 1),
    }
  }
  private ensure(count: number, appearance: 'light' | 'dark', spec: SurfaceRenderSpec) {
    while (this.parts.length > count) this.parts.pop()!.remove()
    while (this.parts.length < count) {
      const part = document.createElement('div')
      part.style.cssText =
        'position:absolute;left:0;top:0;box-sizing:border-box;pointer-events:none;'
      this.element.append(part)
      this.parts.push(part)
    }
    const reduced = matchMedia('(prefers-reduced-transparency: reduce)').matches
    const dark = appearance === 'dark'
    const tint = spec.tint
    const background = tint
      ? `rgba(${tint[0] * 255},${tint[1] * 255},${tint[2] * 255},${tint[3]})`
      : dark
        ? `rgba(35,35,38,${reduced ? 1 : 0.68})`
        : `rgba(250,250,252,${reduced ? 1 : 0.58})`
    for (const part of this.parts) {
      part.style.background = background
      part.style.backdropFilter = reduced
        ? 'none'
        : `blur(${spec.variant === 'clear' ? 4 : 18}px) saturate(1.4)`
      part.style.setProperty('-webkit-backdrop-filter', part.style.backdropFilter)
      part.style.boxShadow = `inset 0 0 0 0.5px rgba(255,255,255,${dark ? 0.25 : 0.7}),0 2px 10px rgba(0,0,0,0.08)`
    }
  }
  paint(spec: SurfaceRenderSpec, appearance: 'light' | 'dark') {
    this.cancel()
    const shapes = this.shapes(spec)
    this.ensure(shapes.length, appearance, spec)
    shapes.forEach((shape, index) =>
      Object.assign(this.parts[index].style, this.frame(shape, spec)),
    )
  }
  /** A sampled track is submitted once. Width/radius may paint, but never need a JS frame loop. */
  play(
    specs: readonly SurfaceRenderSpec[],
    duration: number,
    at: number,
    appearance: 'light' | 'dark',
  ) {
    this.paint(specs[specs.length - 1], appearance)
    const count = Math.max(...specs.map(spec => this.shapes(spec).length))
    this.ensure(count, appearance, specs[specs.length - 1])
    const start = timelineStart(at)
    this.parts.forEach((part, index) => {
      const frames = specs.map((spec, sample) => {
        const shape = this.shapes(spec)[index]
        return {
          offset: sample / (specs.length - 1),
          ...(shape ? this.frame(shape, spec) : { opacity: 0 }),
        }
      })
      const animation = animateElement(part, frames, { duration, easing: 'linear', fill: 'both' })
      animation.startTime = start
      this.animations.push(animation)
    })
    return Promise.all(this.animations.map(animation => animation.finished)).then(
      () => {},
      () => {},
    )
  }
  private cancel() {
    for (const animation of this.animations) animation.cancel()
    this.animations = []
  }
  dispose() {
    this.cancel()
    this.element.remove()
  }
}
