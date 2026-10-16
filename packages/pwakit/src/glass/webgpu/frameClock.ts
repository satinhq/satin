import type { Envelope } from '../worker/protocol.ts'

/** Epoch milliseconds from the document's animation frame, shared with WAAPI. */
export interface FrameClock {
  request(callback: (at: number) => void): number
  cancel(token: number): void
}

export const documentFrameClock: FrameClock = {
  request: callback =>
    requestAnimationFrame(timestamp => callback(performance.timeOrigin + timestamp)),
  cancel: token => cancelAnimationFrame(token),
}

type FrameRequest = { glassFrame: { token: number; cancel?: boolean } }

/** The experimental worker renderer asks the page for one frame at a time.
 * Worker rAF can run faster than the page and is not a presentation clock. */
export class WorkerFrameClock implements FrameClock {
  private sequence = 0
  private pending?: { token: number; callback: (at: number) => void }
  private emit: (message: FrameRequest) => void
  constructor(emit: (message: FrameRequest) => void) {
    this.emit = emit
  }
  request(callback: (at: number) => void) {
    const token = ++this.sequence
    this.pending = { token, callback }
    this.emit({ glassFrame: { token } })
    return token
  }
  cancel(token: number) {
    if (this.pending?.token !== token) return
    this.pending = undefined
    this.emit({ glassFrame: { token, cancel: true } })
  }
  receive(frame: { token: number; at: number }) {
    if (this.pending?.token !== frame.token || !Number.isFinite(frame.at)) return
    const { callback } = this.pending
    this.pending = undefined
    callback(frame.at)
  }
}

/** Page half of the worker clock. Tokens reject frames already in transit at hide. */
export class PageFrameHost {
  private pending?: { token: number; handle: number }
  receive(message: Partial<FrameRequest>, post: (message: Envelope) => void) {
    const frame = message.glassFrame
    if (!frame) return false
    if (frame.cancel) {
      if (this.pending?.token === frame.token) this.cancel()
    } else {
      this.cancel()
      const handle = documentFrameClock.request(at => {
        this.pending = undefined
        post({ id: 0, request: { type: 'page-frame', token: frame.token, at } })
      })
      this.pending = { token: frame.token, handle }
    }
    return true
  }
  cancel() {
    if (this.pending) documentFrameClock.cancel(this.pending.handle)
    this.pending = undefined
  }
}
