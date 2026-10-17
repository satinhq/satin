/** Full drawable attachment area in queue-accepted command buffers. This is not
 * compositor scanout: screen cadence is measured independently by the recorder. */
const pending = new WeakMap<GPUCommandEncoder, Map<object, number>>()
const totals = { submittedPixels: 0, submittedCommandBuffers: 0 }

export function trackCanvasWrite(encoder: GPUCommandEncoder, canvas: object, pixels: number) {
  let canvases = pending.get(encoder)
  if (!canvases) {
    canvases = new Map()
    pending.set(encoder, canvases)
  }
  canvases.set(canvas, pixels)
}

export function submitCanvasCommands(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  commands: GPUCommandBuffer,
) {
  device.queue.submit([commands])
  const canvases = pending.get(encoder)
  pending.delete(encoder)
  if (!canvases?.size) return
  totals.submittedPixels += [...canvases.values()].reduce((sum, pixels) => sum + pixels, 0)
  totals.submittedCommandBuffers++
}

export const canvasSubmissionCosts = () => ({ ...totals })
