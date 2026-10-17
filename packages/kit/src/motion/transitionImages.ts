import {
  imageCapture,
  paintedImage,
  settleContentImage,
  emptyImageSource,
} from '../image/resource.ts'

/** A DOM clone is a new image consumer in WebKit, even when its URL is already cached.
 * Freeze responsive selection to the displayed resource and decode each copied node before
 * showing it. Keep the original nodes in their React tree throughout the transition. */
export function prepareClonedImages(source: HTMLElement, clone: HTMLElement) {
  const images = (root: HTMLElement) => [
    ...(root instanceof HTMLImageElement ? [root] : []),
    ...root.querySelectorAll<HTMLImageElement>('img'),
  ]
  const originals = images(source)
  const copies = images(clone)
  if (!copies.length) return undefined
  return Promise.all(
    copies.map(async (copy, index) => {
      const original = originals[index]!
      const pixels = await paintedImage(original)
      copy.removeAttribute('srcset')
      copy.removeAttribute('sizes')
      copy.loading = 'eager'
      copy.decoding = 'sync'
      copy.src = pixels ? original.currentSrc || original.src : emptyImageSource
      const decoded = await settleContentImage(copy.decode().then(() => copy))
      if (!decoded) copy.src = emptyImageSource
    }),
  ).then(() => {})
}

/** Covered routes may have lost their decoded pixels without changing URLs. Revalidate
 * the displayed nodes before a pop reveals them; a retained cache promise is insufficient. */
export async function prepareRevealedImages(root: HTMLElement) {
  const images = [
    ...(root instanceof HTMLImageElement ? [root] : []),
    ...root.querySelectorAll<HTMLImageElement>('img'),
  ]
  await Promise.all(
    images.map(async image => {
      // Hidden prewarm descendants do not contribute to the revealed route. Their
      // removal must not cancel its preparation. Stop at the route root: a covered
      // route itself may be hidden while its displayed images still need decode.
      for (
        let ancestor: HTMLElement | null = image;
        ancestor && ancestor !== root;
        ancestor = ancestor.parentElement
      ) {
        if (ancestor.hidden || getComputedStyle(ancestor).display === 'none') return
      }
      const capture = imageCapture(image)
      if (!capture) return
      const pixels = await settleContentImage(capture.ready)
      if (pixels) await settleContentImage(image.decode().then(() => image))
    }),
  )
}
