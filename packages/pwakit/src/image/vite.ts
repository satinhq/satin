import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import sharp from 'sharp'
import type { Plugin } from 'vite'

const suffix = '?satin-image'

/** Explicit image imports remain ordinary Vite assets and enter the shell precache. */
export function imageAssets(): Plugin {
  let development = false
  return {
    name: 'satin:image-assets',
    enforce: 'pre',
    configResolved(config) {
      development = config.command === 'serve'
    },
    async resolveId(source, importer) {
      if (!source.endsWith(suffix)) return
      const resolved = await this.resolve(source.slice(0, -suffix.length), importer, {
        skipSelf: true,
      })
      if (!resolved || resolved.external) throw Error(`Cannot resolve Satin image: ${source}`)
      return resolved.id + suffix
    },
    async load(id) {
      if (!id.endsWith(suffix)) return
      const path = id.slice(0, -suffix.length)
      this.addWatchFile(path)
      const input = await readFile(path)
      const decoder = sharp(input, { limitInputPixels: 4096 * 4096 })
      const metadata = await decoder.metadata()
      if (metadata.pages! > 1) throw Error('Satin Image assets must be still images')
      const image = decoder.rotate()
      const { info, data } = await image.png().toBuffer({ resolveWithObject: true })
      const { width, height } = info
      // The full-size variant is the original file, so it shows the same pixels as native.
      // Downscales are resampled anyway: lossy sources get high-quality lossy WebP.
      const lossless = metadata.format === 'png' || metadata.format === 'gif'
      const widths = [160, 320, 640, 960, 1280].filter(size => size < width)
      const variants = await Promise.all(
        [...widths, width].map(async size => {
          const original = size === width
          const bytes = original
            ? input
            : await sharp(data)
                .resize({ width: size })
                .webp(lossless ? { lossless: true } : { quality: 85 })
                .toBuffer()
          const name = original ? basename(path) : `${basename(path)}-${size}.webp`
          const type = original ? `image/${metadata.format}` : 'image/webp'
          const url = development
            ? JSON.stringify(`data:${type};base64,${bytes.toString('base64')}`)
            : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: 'asset', name, source: bytes })}`
          return { width: size, url }
        }),
      )
      const placeholder = await sharp(data).resize(1, 1).png().toBuffer()
      return `const variants = [${variants.map(v => `{width:${v.width},url:${v.url}}`).join(',')}];
export default {src:variants.at(-1).url,width:${width},height:${height},
srcSet:variants.map(v => v.url+' '+v.width+'w').join(', '),
placeholder:${JSON.stringify('data:image/png;base64,' + placeholder.toString('base64'))}};`
    },
  }
}
