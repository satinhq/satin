import { createContext, type ReactNode } from 'react'
import {
  imageRequestKey,
  imageDecodeFailed,
  peekDecodedImage,
  decodedImage,
  retainDecodedImage,
  type ImageRequest,
} from './resource.ts'

/** A replacement owns its requests until it commits or a newer replacement retires it.
 * Failure is a settled content outcome: Image renders its placeholder, not an error boundary. */
export class ImagePreparation {
  private active = false
  private committed = false
  private requests = new Map<
    string,
    {
      source: string
      request: ImageRequest
      release?: () => void
      image?: HTMLImageElement
      failed: boolean
      settled: Promise<void>
    }
  >()

  read(source: string, request: ImageRequest): HTMLImageElement | null {
    const key = imageRequestKey(source, request)
    let selected = this.requests.get(key)
    if (!selected) {
      const failed = imageDecodeFailed(source, request)
      selected = {
        source,
        request,
        image: peekDecodedImage(source, request),
        failed,
        settled: failed
          ? Promise.resolve()
          : decodedImage(source, request).then(
              image => {
                selected!.image = image
              },
              () => {
                selected!.failed = true
              },
            ),
      }
      this.requests.set(key, selected)
      if (this.active && !failed) {
        const retained = retainDecodedImage(source, request)
        void retained.ready.catch(() => {})
        selected.release = retained.release
      }
    }
    if (selected.failed) return null
    if (selected.image) return selected.image
    throw selected.settled
  }

  activate() {
    if (this.committed) return
    this.active = true
    for (const selected of this.requests.values()) {
      if (selected.failed || selected.release) continue
      const retained = retainDecodedImage(selected.source, selected.request)
      void retained.ready.catch(() => {})
      selected.release = retained.release
    }
  }

  commit() {
    this.committed = true
    this.release()
  }

  release() {
    this.active = false
    for (const selected of this.requests.values()) {
      selected.release?.()
      selected.release = undefined
    }
  }
}

export const ContentImageContext = createContext(false)

/** Enable image-only admission without scheduling surrounding content. Nested
 * screen/scroll boundaries carry the same policy; controls always commit urgently. */
export function ContentAdmission({ children }: { children: ReactNode }) {
  return <ContentImageContext value={true}>{children}</ContentImageContext>
}
