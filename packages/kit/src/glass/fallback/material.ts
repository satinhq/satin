import { popoverOutline } from './popoverOutline.ts'
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
    const outline =
      spec.treatment === 'confirmation' && spec.popoverArrow
        ? popoverOutline(shape, spec.popoverArrow)
        : undefined
    return {
      transform: `translate3d(${spec.frameX + shape.centerX - shape.halfWidth}px,${spec.frameY + shape.centerY - shape.halfHeight - (outline?.top ?? 0)}px,0)`,
      width: `${Math.max(0, shape.halfWidth * 2)}px`,
      height: `${outline?.height ?? Math.max(0, shape.halfHeight * 2)}px`,
      clipPath: outline ? `path("${outline.path}")` : 'none',
      borderRadius: outline
        ? '0px'
        : `${shape.radius}px ${shape.radius}px ${shape.bottomRadius ?? shape.radius}px ${shape.bottomRadius ?? shape.radius}px`,
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
    this.element.querySelectorAll('[data-satin-fallback-shadow]').forEach(shadow => shadow.remove())
    for (const [index, part] of this.parts.entries()) {
      part.style.background = background
      part.style.backdropFilter = reduced
        ? 'none'
        : `blur(${spec.variant === 'clear' ? 4 : 18}px) saturate(1.4)`
      part.style.setProperty('-webkit-backdrop-filter', part.style.backdropFilter)
      part.style.boxShadow = `inset 0 0 0 0.5px rgba(255,255,255,${dark ? 0.25 : 0.7}),0 2px 10px rgba(0,0,0,0.08)`
      part.querySelector('svg')?.remove()
      if (spec.treatment === 'confirmation' && spec.popoverArrow) {
        const shape = this.shapes(spec)[index]
        if (!shape) continue
        const outline = popoverOutline(shape, spec.popoverArrow)
        // Keep the existing body shadow outside the clipped backdrop aperture.
        const shadow = document.createElement('span')
        shadow.dataset.satinFallbackShadow = 'true'
        shadow.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;'
        Object.assign(shadow.style, this.frame(shape, { ...spec, popoverArrow: undefined }))
        shadow.style.boxShadow = '0 2px 10px rgba(0,0,0,0.08)'
        this.element.insertBefore(shadow, part)
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', `0 0 ${outline.width} ${outline.height}`)
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;'
        const rim = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        rim.setAttribute('d', outline.path)
        rim.setAttribute('fill', 'none')
        rim.setAttribute('stroke', `rgba(255,255,255,${dark ? 0.25 : 0.7})`)
        rim.setAttribute('stroke-width', '1')
        svg.append(rim)
        part.append(svg)
        // Half of the one-pixel stroke lies inside the single clipped aperture.
        part.style.boxShadow = 'none'
      }
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
