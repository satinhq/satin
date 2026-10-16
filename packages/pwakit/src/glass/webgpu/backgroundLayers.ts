/** CSS background-image layers drawn into a glass backdrop capture (canvas 2D). Gradients
 * (linear, radial, conic and their repeating forms) are drawn with the canvas gradient API from
 * the element's computed style; each layer honours its background-size, -position and -repeat.
 * An image the capture cannot draw (url(), image-set(), element(), cross-fade()) is reported as a
 * glass error: the glass would otherwise show a backdrop without it, silently. */

export type BackgroundSpec = Readonly<{
  image: string
  size: string
  position: string
  repeat: string
}>
type Stop = { color: string; at?: number; unit?: 'px' | '%' }
type Gradient =
  | { kind: 'linear'; repeating: boolean; angle?: number; corner?: string; stops: Stop[] }
  | {
      kind: 'radial'
      repeating: boolean
      circle: boolean
      size: string[]
      at: string[]
      stops: Stop[]
    }
  | { kind: 'conic'; repeating: boolean; from: number; at: string[]; stops: Stop[] }

/** Splits at top-level separators (commas or whitespace), outside parentheses. */
export function splitTop(text: string, separator: ',' | ' '): string[] {
  const out: string[] = []
  let depth = 0,
    current = ''
  for (const ch of text) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    const split = separator === ',' ? ch === ',' : /\s/.test(ch)
    if (split && depth === 0) {
      if (current.trim()) out.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) out.push(current.trim())
  return out
}

const angleUnits: Record<string, number> = { deg: 1, rad: 180 / Math.PI, turn: 360, grad: 0.9 }
function angle(token: string): number | undefined {
  const m = /^(-?[\d.]+(?:e-?\d+)?)(deg|rad|turn|grad)$/.exec(token)
  return m ? Number(m[1]) * angleUnits[m[2]] : token === '0' ? 0 : undefined
}
const lengthPattern = /^(-?[\d.]+(?:e-?\d+)?)(px|%)?$/
const isLength = (token: string) => lengthPattern.test(token) || token.startsWith('calc(')
function length(token: string): { at: number; unit: 'px' | '%' } {
  const m = lengthPattern.exec(token)
  if (!m) throw Error(`Unsupported gradient length ${token}`)
  return { at: Number(m[1]), unit: m[2] === '%' ? '%' : 'px' }
}

/** Colour stops; a conic gradient's angle positions become percentages of the full turn. */
function stops(args: string[], angular = false): Stop[] {
  const out: Stop[] = []
  const isPosition = (t: string) => isLength(t) || (angular && angle(t) !== undefined)
  const position = (t: string) =>
    angular && angle(t) !== undefined && !lengthPattern.test(t)
      ? { at: angle(t)! / 3.6, unit: '%' as const }
      : length(t)
  for (const arg of args) {
    const tokens = splitTop(arg, ' ')
    if (tokens.every(isPosition)) throw Error('Unsupported gradient colour hint')
    const color = tokens.find(t => !isPosition(t))!,
      positions = tokens.filter(isPosition).map(position)
    if (!positions.length) out.push({ color })
    for (const position of positions) out.push({ color, ...position })
  }
  if (out.length < 2) throw Error('A gradient needs at least two colour stops')
  return out
}

/** Parses one computed background-image layer, or undefined for a non-gradient image. */
export function parseGradient(layer: string): Gradient | undefined {
  const m = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s.exec(layer.trim())
  if (!m) return undefined
  const repeating = !!m[1],
    kind = m[2],
    args = splitTop(m[3], ',')
  if (kind === 'linear') {
    const first = args[0]
    if (first.startsWith('to '))
      return { kind, repeating, corner: first.slice(3).trim(), stops: stops(args.slice(1)) }
    const a = angle(first)
    return a === undefined
      ? { kind, repeating, angle: 180, stops: stops(args) }
      : { kind, repeating, angle: a, stops: stops(args.slice(1)) }
  }
  if (kind === 'radial') {
    const first = splitTop(args[0], ' ')
    const prelude = first.every(
      t =>
        /^(circle|ellipse|closest-side|closest-corner|farthest-side|farthest-corner|at|left|right|top|bottom|center)$/.test(
          t,
        ) || isLength(t),
    )
    if (!prelude)
      return {
        kind,
        repeating,
        circle: false,
        size: [],
        at: ['center', 'center'],
        stops: stops(args),
      }
    const at = first.indexOf('at'),
      shape = at < 0 ? first : first.slice(0, at)
    return {
      kind,
      repeating,
      circle:
        shape.includes('circle') ||
        (shape.filter(isLength).length === 1 && !shape.includes('ellipse')),
      size: shape.filter(t => t !== 'circle' && t !== 'ellipse'),
      at: at < 0 ? ['center', 'center'] : first.slice(at + 1),
      stops: stops(args.slice(1)),
    }
  }
  const first = splitTop(args[0], ' ')
  if (first[0] === 'from' || first[0] === 'at') {
    const from = first[0] === 'from' ? (angle(first[1]) ?? 0) : 0,
      at = first.indexOf('at')
    return {
      kind: 'conic',
      repeating,
      from,
      at: at < 0 ? ['center', 'center'] : first.slice(at + 1),
      stops: stops(args.slice(1), true),
    }
  }
  return { kind: 'conic', repeating, from: 0, at: ['center', 'center'], stops: stops(args, true) }
}

/** Resolves stop positions to fractions of `extent` (CSS rules: missing positions are spread
 * evenly between their neighbours; a position never precedes an earlier one). */
export function resolveStops(
  list: readonly Stop[],
  extent: number,
): { color: string; offset: number }[] {
  const at = list.map((s, i) =>
    s.at === undefined
      ? i === 0
        ? 0
        : i === list.length - 1
          ? 1
          : undefined
      : s.unit === '%'
        ? s.at / 100
        : extent > 0
          ? s.at / extent
          : 0,
  )
  let max = -Infinity
  for (let i = 0; i < at.length; i++)
    if (at[i] !== undefined) {
      at[i] = Math.max(at[i]!, max)
      max = at[i]!
    }
  for (let i = 1; i < at.length; i++)
    if (at[i] === undefined) {
      let j = i
      while (at[j] === undefined) j++
      const a = at[i - 1]!,
        b = at[j]!
      for (let k = i; k < j; k++) at[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1)
    }
  return list.map((s, i) => ({ color: s.color, offset: at[i]! }))
}

/** A repeating gradient's stops over [0,1]: its period repeated across the whole line. */
export function repeatStops(
  resolved: readonly { color: string; offset: number }[],
): { color: string; offset: number }[] {
  const first = resolved[0].offset,
    last = resolved.at(-1)!.offset,
    period = last - first
  if (period <= 1e-6)
    return [
      { color: resolved.at(-1)!.color, offset: 0 },
      { color: resolved.at(-1)!.color, offset: 1 },
    ]
  const color = (t: number) => {
    const u = first + ((((t - first) % period) + period) % period)
    for (let i = 1; i < resolved.length; i++)
      if (u <= resolved[i].offset) {
        const a = resolved[i - 1],
          b = resolved[i],
          f = b.offset > a.offset ? (u - a.offset) / (b.offset - a.offset) : 1
        return f <= 0 ? a.color : f >= 1 ? b.color : a.color === b.color ? a.color : undefined
      }
    return resolved.at(-1)!.color
  }
  const out: { color: string; offset: number }[] = []
  const start = Math.floor((0 - first) / period) - 1,
    end = Math.ceil((1 - first) / period) + 1
  if (end - start > 4096) throw Error('Repeating gradient period is too small to capture')
  for (let k = start; k <= end; k++)
    for (const s of resolved) {
      const offset = s.offset + k * period
      if (offset >= 0 && offset <= 1) out.push({ color: s.color, offset })
    }
  // Exact boundary colours (the period's interpolation at 0 and 1 when no stop lands there).
  const edge = (t: number) => {
    const value = color(t)
    if (value === undefined) throw Error('Unsupported repeating gradient boundary interpolation')
    return value
  }
  if (!out.length || out[0].offset > 0) out.unshift({ color: edge(0), offset: 0 })
  if (out.at(-1)!.offset < 1) out.push({ color: edge(1), offset: 1 })
  return out
}
/** CSS linear-gradient geometry for a w x h box: start and end points of the gradient line. */
export function linearLine(g: Extract<Gradient, { kind: 'linear' }>, w: number, h: number) {
  let a = g.angle ?? 180
  if (g.corner) {
    const words = g.corner.split(/\s+/),
      up = words.includes('top'),
      down = words.includes('bottom'),
      left = words.includes('left'),
      right = words.includes('right')
    if ((up || down) && (left || right)) {
      const t = (Math.atan2(h, w) * 180) / Math.PI
      a = up && right ? t : down && right ? 180 - t : down && left ? 180 + t : 360 - t
    } else a = up ? 0 : right ? 90 : down ? 180 : 270
  }
  const r = (a * Math.PI) / 180,
    dx = Math.sin(r),
    dy = -Math.cos(r)
  const length = Math.abs(w * dx) + Math.abs(h * dy),
    cx = w / 2,
    cy = h / 2
  return {
    x0: cx - (dx * length) / 2,
    y0: cy - (dy * length) / 2,
    x1: cx + (dx * length) / 2,
    y1: cy + (dy * length) / 2,
    length,
  }
}

function positionValue(token: string | undefined, extent: number) {
  if (!token || token === 'center') return extent / 2
  if (token === 'left' || token === 'top') return 0
  if (token === 'right' || token === 'bottom') return extent
  const { at, unit } = length(token)
  return unit === '%' ? (extent * at) / 100 : at
}
function point(at: readonly string[], w: number, h: number) {
  let [x, y] = at
  if ((x === 'top' || x === 'bottom') && y !== 'top' && y !== 'bottom') [x, y] = [y, x]
  return { x: positionValue(x, w), y: positionValue(y ?? 'center', h) }
}

function radii(
  g: Extract<Gradient, { kind: 'radial' }>,
  w: number,
  h: number,
  c: { x: number; y: number },
) {
  const lengths = g.size.filter(isLength)
  if (lengths.length) {
    const rx = length(lengths[0]),
      ry = lengths[1] ? length(lengths[1]) : rx
    const x = rx.unit === '%' ? (w * rx.at) / 100 : rx.at,
      y = ry.unit === '%' ? (h * ry.at) / 100 : ry.at
    return g.circle ? { rx: x, ry: x } : { rx: x, ry: y }
  }
  const keyword = g.size[0] ?? 'farthest-corner'
  const sides = { l: c.x, r: w - c.x, t: c.y, b: h - c.y }
  const near = { x: Math.min(sides.l, sides.r), y: Math.min(sides.t, sides.b) },
    far = { x: Math.max(sides.l, sides.r), y: Math.max(sides.t, sides.b) }
  if (keyword === 'closest-side')
    return g.circle
      ? { rx: Math.min(near.x, near.y), ry: Math.min(near.x, near.y) }
      : { rx: near.x, ry: near.y }
  if (keyword === 'farthest-side')
    return g.circle
      ? { rx: Math.max(far.x, far.y), ry: Math.max(far.x, far.y) }
      : { rx: far.x, ry: far.y }
  const corner = keyword === 'closest-corner' ? near : far
  if (g.circle) {
    const r = Math.hypot(corner.x, corner.y)
    return { rx: r, ry: r }
  }
  // An ellipse through the corner with the side ratio (CSS: sqrt(2) x the side distances).
  return { rx: corner.x * Math.SQRT2, ry: corner.y * Math.SQRT2 }
}

type Context = Pick<
  CanvasRenderingContext2D,
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'createConicGradient'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'fillRect'
  | 'beginPath'
  | 'roundRect'
  | 'clip'
  | 'rect'
> & { fillStyle: string | CanvasGradient | CanvasPattern }

/** Paints one gradient into the tile [0,0,w,h] of the current transform. */
function supportedStops(g: Gradient, extent: number) {
  const resolved = resolveStops(g.stops, extent)
  if (g.repeating) return repeatStops(resolved)
  if (resolved.some(s => s.offset < 0 || s.offset > 1))
    throw Error('Unsupported gradient stops outside the capture interval')
  return resolved
}

function paintGradient(ctx: Context, g: Gradient, w: number, h: number) {
  if (w <= 0 || h <= 0) return
  if (g.kind === 'linear') {
    const line = linearLine(g, w, h)
    const resolved = supportedStops(g, line.length)
    const gradient = ctx.createLinearGradient(line.x0, line.y0, line.x1, line.y1)
    for (const s of resolved) gradient.addColorStop(s.offset, s.color)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    return
  }
  if (g.kind === 'radial') {
    const c = point(g.at, w, h),
      { rx, ry } = radii(g, w, h, c)
    if (rx <= 0 || ry <= 0) return
    const resolved = supportedStops(g, rx)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.scale(1, ry / rx)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    for (const s of resolved) gradient.addColorStop(s.offset, s.color)
    ctx.fillStyle = gradient
    ctx.fillRect(-c.x, (-c.y * rx) / ry, w, (h * rx) / ry)
    ctx.restore()
    return
  }
  const c = point(g.at, w, h)
  const resolved = supportedStops(g, 1)
  // Canvas conic gradients start at 3 o'clock; CSS at 12 o'clock.
  const gradient = ctx.createConicGradient(((g.from - 90) * Math.PI) / 180, c.x, c.y)
  for (const s of resolved) gradient.addColorStop(s.offset, s.color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

function tileSize(size: string, w: number, h: number) {
  if (!size || size === 'auto' || size === 'auto auto' || size === 'cover' || size === 'contain')
    return { tw: w, th: h }
  const [a, b] = size.split(/\s+/)
  const value = (token: string | undefined, extent: number) =>
    !token || token === 'auto'
      ? extent
      : (() => {
          const l = length(token)
          return l.unit === '%' ? (extent * l.at) / 100 : l.at
        })()
  return { tw: value(a, w), th: value(b, w === 0 ? h : h) }
}
function tileOffset(position: string, w: number, h: number, tw: number, th: number) {
  const [x = '0%', y = '0%'] = position.split(/\s+/)
  const axis = (token: string, extent: number, tile: number) =>
    token === 'center'
      ? (extent - tile) / 2
      : token === 'left' || token === 'top'
        ? 0
        : token === 'right' || token === 'bottom'
          ? extent - tile
          : (() => {
              const l = length(token)
              return l.unit === '%' ? ((extent - tile) * l.at) / 100 : l.at
            })()
  return { ox: axis(x, w, tw), oy: axis(y, h, th) }
}

const reported = new Set<string>()
/** Draws a node's background-image layers into [0,0,w,h] (radius-clipped). Unsupported layers are
 * reported (once per distinct value) through `report`, never silently dropped. */
export function drawBackgroundLayers(
  ctx: Context,
  spec: BackgroundSpec,
  w: number,
  h: number,
  radius: number,
  report: (error: Error) => void,
) {
  const layers = splitTop(spec.image, ','),
    sizes = splitTop(spec.size, ','),
    positions = splitTop(spec.position, ','),
    repeats = splitTop(spec.repeat, ',')
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, radius)
  ctx.clip()
  // CSS lists the top layer first: paint bottom-up.
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    let gradient: Gradient | undefined
    try {
      gradient = parseGradient(layer)
    } catch (error) {
      if (!reported.has(layer)) {
        reported.add(layer)
        report(
          Error(
            `Glass backdrop capture cannot parse background-image layer ${layer.slice(0, 120)}: ${(error as Error).message}`,
          ),
        )
      }
      continue
    }
    if (!gradient) {
      if (!reported.has(layer)) {
        reported.add(layer)
        report(
          Error(
            `Glass backdrop capture does not draw background-image ${layer.slice(0, 120)}; the glass shows its backdrop without it`,
          ),
        )
      }
      continue
    }
    const { tw, th } = tileSize(sizes[i % sizes.length] ?? 'auto', w, h)
    if (tw <= 0 || th <= 0) continue
    const { ox, oy } = tileOffset(positions[i % positions.length] ?? '0% 0%', w, h, tw, th)
    const repeat = repeats[i % repeats.length] ?? 'repeat',
      rx = repeat === 'repeat' || repeat === 'repeat-x' || repeat.startsWith('repeat '),
      ry = repeat === 'repeat' || repeat === 'repeat-y' || repeat.endsWith(' repeat')
    const xs = rx
        ? { from: Math.floor(-ox / tw), to: Math.ceil((w - ox) / tw) }
        : { from: 0, to: 1 },
      ys = ry ? { from: Math.floor(-oy / th), to: Math.ceil((h - oy) / th) } : { from: 0, to: 1 }
    if ((xs.to - xs.from) * (ys.to - ys.from) > 10000) {
      report(Error('Glass backdrop capture: background tile grid too large'))
      continue
    }
    for (let tx = xs.from; tx < xs.to; tx++)
      for (let ty = ys.from; ty < ys.to; ty++) {
        ctx.save()
        ctx.translate(ox + tx * tw, oy + ty * th)
        ctx.beginPath()
        ctx.rect(0, 0, tw, th)
        ctx.clip()
        try {
          paintGradient(ctx, gradient, tw, th)
        } catch (error) {
          if (!reported.has(layer)) {
            reported.add(layer)
            report(
              Error(
                `Glass backdrop capture cannot draw background-image ${layer.slice(0, 120)}: ${(error as Error).message}`,
              ),
            )
          }
        } finally {
          ctx.restore()
        }
      }
  }
  ctx.restore()
}
