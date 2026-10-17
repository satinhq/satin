/** Limits the glass devices request above WebGPU's defaults. A backdrop plane holds a scroll
 * view's whole content at device resolution: an 80-row list is about 3,500 pt, 10,500 px at 3x,
 * past the default 8,192 px texture side. Apple GPUs allow 16,384. Longer content still exceeds
 * the adapter and fails loudly as a GPU error. */
export function glassDeviceLimits(adapter: GPUAdapter): Record<string, number> {
  const side = adapter.limits?.maxTextureDimension2D
  return side ? { maxTextureDimension2D: side } : {}
}
