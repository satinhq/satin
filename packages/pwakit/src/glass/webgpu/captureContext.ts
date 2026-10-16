// Capture canvases are CPU-backed (willReadFrequently). An accelerated (IOSurface) canvas that WebKit
// has snapshotted for an upload or drawImage is copied whole by the GPU process when it is redrawn
// or released (CoreGraphics copy-on-write, CA::CG::AccelDataProvider::detach): about 52 ms for an
// 880x1912 capture, which held the page's rendering updates (Catalyst Time Profiler, Oct 4). They
// are only rastered and read back, so they need no GPU backing.
export const CAPTURE_CONTEXT: CanvasRenderingContext2DSettings = { willReadFrequently: true }
