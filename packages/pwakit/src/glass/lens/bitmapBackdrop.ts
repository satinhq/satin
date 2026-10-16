/** Measurement fixtures share a decoded bitmap between DOM and GPU sources. */
export type BitmapBackdropMode = `bitmap-${string}`
type Fixture = {
  url: string
  widthPt: number
  heightPt: number
  image?: HTMLImageElement
  loading?: Promise<void>
}
const fixtures = new Map<BitmapBackdropMode, Fixture>()

export function registerGlassBitmapBackdrop(
  id: BitmapBackdropMode,
  fixture: Pick<Fixture, 'url' | 'widthPt' | 'heightPt'>,
) {
  if (
    !/^bitmap-[a-z0-9-]+$/.test(id) ||
    ![fixture.widthPt, fixture.heightPt].every(value => Number.isFinite(value) && value > 0)
  )
    throw new Error('Invalid glass bitmap fixture')
  if (fixtures.has(id)) throw new Error(`Duplicate glass bitmap fixture: ${id}`)
  fixtures.set(id, { ...fixture })
}
export function isBitmapBackdrop(value: string | null): value is BitmapBackdropMode {
  return value !== null && fixtures.has(value as BitmapBackdropMode)
}
export function prepareGlassBitmapBackdrop(value: string): Promise<void> {
  if (!isBitmapBackdrop(value)) return Promise.resolve()
  const fixture = fixtures.get(value)!
  if (!fixture.loading) {
    fixture.loading = (async () => {
      const image = new Image()
      image.src = fixture.url
      await image.decode()
      fixture.image = image
    })().catch(error => {
      fixture.loading = undefined
      throw error
    })
  }
  return fixture.loading
}
export function drawGlassBitmapBackdrop(
  context: CanvasRenderingContext2D,
  value: BitmapBackdropMode,
) {
  const fixture = fixtures.get(value)
  if (!fixture?.image) throw new Error(`Glass bitmap fixture is not decoded: ${value}`)
  context.drawImage(fixture.image, 0, 0, fixture.widthPt, fixture.heightPt)
}
