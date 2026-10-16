import sharp from 'sharp'
/** Build-only conversion. No image library enters the app bundle. */
export async function generateAppIcons(source: Uint8Array) {
  const image = sharp(source, { limitInputPixels: 4096 * 4096 })
  const metadata = await image.metadata()
  if (!metadata.width || metadata.width !== metadata.height || metadata.width < 512)
    throw new Error('App icon source must be square and at least 512 pixels wide')
  return new Map(
    await Promise.all(
      [180, 192, 512].map(
        async size =>
          [
            size,
            await image.clone().resize(size, size).toColourspace('srgb').png().toBuffer(),
          ] as const,
      ),
    ),
  )
}

/** Build-only native launch cover; alpha must survive the WebClip image cache. */
export async function generateStartupImage(
  source: Uint8Array,
  width: number,
  height: number,
  ratio: number,
  background: string | null,
) {
  const size = 68 * ratio
  const radius = 15 * ratio
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="white"/></svg>`,
  )
  const icon = await sharp(source)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toBuffer()
}
