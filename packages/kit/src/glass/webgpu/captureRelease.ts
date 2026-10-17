import { traceStage, traceStageStart } from './profile.ts'

/** Release a throwaway capture canvas as soon as it has been consumed.
 *
 * WebKit keeps a GPU-process image for a canvas that was drawn into another canvas, and
 * destroying that image is a synchronous round trip to the GPU process. Left to the garbage
 * collector, the capture canvases of a preparation were swept together later, often in the
 * first frames of the next navigation: a main-thread stall of about 200 ms (sampled in the
 * Catalyst host: HTMLCanvasElement::~HTMLCanvasElement, ImageFrame::clearImage,
 * RemoteNativeImageProxy::platformImage, IPC::Connection::waitForSyncReply). Emptying the
 * canvas drops that image now, inside the preparation, which never runs during motion. */
export function releaseCaptureCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

/** Release every canvas of `canvases` and empty the list (so each is released exactly once,
 * whichever of the normal path or a failure path gets to it first). */
export function releaseCaptureCanvases(canvases: HTMLCanvasElement[]) {
  if (!canvases.length) return
  const started = traceStageStart()
  const released = canvases.length
  for (const canvas of canvases.splice(0)) releaseCaptureCanvas(canvas)
  traceStage('capture-release', started, () => `${released} canvases`)
}

/** A reply that never arrives must not keep capture canvases allocated for longer than this. */
export const CAPTURE_RELEASE_FALLBACK_MS = 5000

/** Release `canvases` when `settled` settles, fulfilled or rejected, or after `fallbackMs` when it
 * never does (a renderer that stopped answering). Whichever comes first releases them once. */
export function releaseCaptureCanvasesAfter(
  settled: Promise<unknown>,
  canvases: HTMLCanvasElement[],
  fallbackMs = CAPTURE_RELEASE_FALLBACK_MS,
) {
  if (!canvases.length) return
  const fallback = setTimeout(() => releaseCaptureCanvases(canvases), fallbackMs)
  const release = () => {
    clearTimeout(fallback)
    releaseCaptureCanvases(canvases)
  }
  settled.then(release, release)
}
