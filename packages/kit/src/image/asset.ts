/** Produced by the Satin Vite plugin for imports ending in ?satin-image. */
export interface ImageAsset {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly srcSet: string
  /** A tiny, decoded colour image, suitable for reserving the artwork's frame. */
  readonly placeholder: string
}
