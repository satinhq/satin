/** A retained source-image index. No DOM reads, GPU readbacks or canvas writes
 * occur when an aperture moves. Disc rows are clipped and renormalized against
 * the visible window, not extended by repeating the boundary pixel.
 */
export class RegularMaterialContext {
  // Variance subtracts two nearly equal second moments. Float32 prefix sums
  // fabricate visible context deviation even on a perfectly uniform source.
  private readonly rows: Float64Array
  readonly width: number
  readonly height: number
  constructor(image: Readonly<{ data: ArrayLike<number>; width: number; height: number }>) {
    this.width = image.width
    this.height = image.height
    this.rows = new Float64Array((image.width + 1) * image.height * 4)
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const src = (y * image.width + x) * 4,
          prev = (y * (image.width + 1) + x) * 4
        const r = image.data[src] / 255,
          g = image.data[src + 1] / 255,
          b = image.data[src + 2] / 255
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
        this.rows[prev + 4] = this.rows[prev] + r
        this.rows[prev + 5] = this.rows[prev + 1] + g
        this.rows[prev + 6] = this.rows[prev + 2] + b
        this.rows[prev + 7] = this.rows[prev + 3] + l * l
      }
  }
  get memoryBytes() {
    return this.rows.byteLength
  }
  sample(
    centerX: number,
    centerY: number,
    radius: number,
    visibleTop = 0,
    visibleBottom = this.height,
  ) {
    const sum = [0, 0, 0, 0]
    let count = 0
    for (
      let y = Math.max(0, Math.ceil(visibleTop - 0.5), Math.ceil(centerY - radius - 0.5));
      y < Math.min(this.height, visibleBottom - 0.5, centerY + radius - 0.5);
      y++
    ) {
      const dy = y + 0.5 - centerY,
        half = Math.sqrt(Math.max(0, radius * radius - dy * dy))
      const left = Math.max(0, Math.ceil(centerX - half - 0.5)),
        right = Math.min(this.width, Math.ceil(centerX + half - 0.5))
      if (right <= left) continue
      const a = (y * (this.width + 1) + left) * 4,
        b = (y * (this.width + 1) + right) * 4
      for (let c = 0; c < 4; c++) sum[c] += this.rows[b + c] - this.rows[a + c]
      count += right - left
    }
    if (!count) return undefined
    const rgb = sum.slice(0, 3).map(v => v / count)
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    return {
      rgb,
      luminance,
      deviation: Math.sqrt(Math.max(0, sum[3] / count - luminance * luminance)),
      count,
    }
  }
}

/** The same index, integrated per row on first use and bit-identical to
 * `RegularMaterialContext`: apertures touch a few dozen rows, so a new source
 * revision no longer pays for integrating every row up front. The WebGPU source
 * pipeline uses it; the Pixi renderer keeps the eager index unchanged. */
export class LazyRegularMaterialContext {
  // Variance subtracts two nearly equal second moments. Float32 prefix sums
  // fabricate visible context deviation even on a perfectly uniform source.
  private readonly data: Uint8ClampedArray
  private readonly rows: (Float64Array | undefined)[]
  readonly width: number
  readonly height: number
  constructor(image: Readonly<{ data: ArrayLike<number>; width: number; height: number }>) {
    this.width = image.width
    this.height = image.height
    // Own the pixels: integration is deferred, so a caller's buffer may be reused.
    this.data = new Uint8ClampedArray(image.data as ArrayLike<number>)
    this.rows = new Array(image.height)
  }
  get memoryBytes() {
    return this.data.byteLength + this.rows.reduce((n, row) => n + (row?.byteLength ?? 0), 0)
  }
  /** Per-row prefix sums of r, g, b and luminance squared; entry x holds columns [0, x). */
  prefixRow(y: number) {
    let row = this.rows[y]
    if (row) return row
    const width = this.width,
      data = this.data
    row = this.rows[y] = new Float64Array((width + 1) * 4)
    // Same operations in the same order as `row[i + 4] = row[i] + v`: bit-identical sums.
    let sr = 0,
      sg = 0,
      sb = 0,
      sl = 0
    for (let x = 0, src = y * width * 4, out = 4; x < width; x++, src += 4, out += 4) {
      const r = data[src] / 255,
        g = data[src + 1] / 255,
        b = data[src + 2] / 255
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      row[out] = sr = sr + r
      row[out + 1] = sg = sg + g
      row[out + 2] = sb = sb + b
      row[out + 3] = sl = sl + l * l
    }
    return row
  }
  sample(
    centerX: number,
    centerY: number,
    radius: number,
    visibleTop = 0,
    visibleBottom = this.height,
  ) {
    const sum = [0, 0, 0, 0]
    let count = 0
    for (
      let y = Math.max(0, Math.ceil(visibleTop - 0.5), Math.ceil(centerY - radius - 0.5));
      y < Math.min(this.height, visibleBottom - 0.5, centerY + radius - 0.5);
      y++
    ) {
      const dy = y + 0.5 - centerY,
        half = Math.sqrt(Math.max(0, radius * radius - dy * dy))
      const left = Math.max(0, Math.ceil(centerX - half - 0.5)),
        right = Math.min(this.width, Math.ceil(centerX + half - 0.5))
      if (right <= left) continue
      const row = this.prefixRow(y),
        a = left * 4,
        b = right * 4
      for (let c = 0; c < 4; c++) sum[c] += row[b + c] - row[a + c]
      count += right - left
    }
    if (!count) return undefined
    const rgb = sum.slice(0, 3).map(v => v / count)
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    return {
      rgb,
      luminance,
      deviation: Math.sqrt(Math.max(0, sum[3] / count - luminance * luminance)),
      count,
    }
  }
}
