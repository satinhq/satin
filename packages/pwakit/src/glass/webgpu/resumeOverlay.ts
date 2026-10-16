/**
 * Resume diagnostics on screen, for device checks where no probe can attach (the owner's
 * iPhone). Opt-in with `<html data-satin-debug-resume>`. It shows what the page and the
 * renderer hold for the tab bar's minimize transaction and the bottom accessory's run, and
 * marks STALE any run-owned state that outlives its run. One screenshot answers the question.
 */
export type ResumeReadout = {
  lifecycle: { hides: number; resumes: number; hidden: boolean }
  compact: boolean
  minimize: {
    active: boolean
    direction: string | null
    compactLayout: boolean
    accessoryRun: boolean
    timelineOffset: number
    accessory: {
      run: boolean
      motion: boolean
      ink: string | null
      width: string | null
      readyInk: number | null
      reach: string | null
      animations: number
    } | null
  } | null
  renderer: {
    visible: boolean | null
    tracks: unknown
    duplicatePresenters: [string, number][]
    presenters: number
  }
}

export function resumeDebugEnabled() {
  return document.documentElement.hasAttribute('data-satin-debug-resume')
}

/** Run-owned state still present while no run is (each entry names one). */
export function staleResumeState(readout: ResumeReadout) {
  const stale: string[] = []
  const minimize = readout.minimize
  const accessory = minimize?.accessory
  if (minimize && !minimize.active && accessory) {
    if (minimize.accessoryRun || accessory.run) stale.push('accessory run')
    if (accessory.motion) stale.push('accessory motion')
    if (accessory.ink === 'true') stale.push('ink hidden')
    if (accessory.width) stale.push(`width ${accessory.width}`)
  }
  // Within a frame or two the clocks normally agree; right after a resume the timeline can hold
  // the last frame's time for a moment (Catalyst: -177 ms before the first frame).
  if (minimize && Math.abs(minimize.timelineOffset) > 1000)
    stale.push(`timeline ${minimize.timelineOffset} ms`)
  if (readout.renderer.duplicatePresenters.length) stale.push('duplicate presenters')
  return stale
}

let shown = false
/**
 * Shows the overlay for the rest of the page's life (once per document). It reads whichever
 * runtime is current (`__SATIN_WEBGPU__`): a runtime is torn down and rebuilt on rebinds.
 */
export function showResumeOverlay() {
  if (shown) return
  shown = true
  const read = () =>
    (globalThis as unknown as { __SATIN_WEBGPU__?: { resume?: () => Promise<ResumeReadout> } })
      .__SATIN_WEBGPU__!.resume!()
  const panel = document.createElement('pre')
  panel.dataset.satinResumeOverlay = ''
  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '2147483647',
    top: 'calc(env(safe-area-inset-top) + 4px)',
    left: '4px',
    right: '4px',
    margin: '0',
    padding: '4px 6px',
    font: '10px/1.25 ui-monospace, Menlo, monospace',
    whiteSpace: 'pre-wrap',
    color: '#fff',
    background: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '6px',
    pointerEvents: 'none',
  })
  document.body.append(panel)
  let timer = 0
  const update = async () => {
    clearTimeout(timer)
    // React may replace the body's children; keep the panel attached.
    if (!panel.isConnected) document.body.append(panel)
    try {
      const readout = await read()
      const stale = staleResumeState(readout)
      const m = readout.minimize,
        a = m?.accessory
      panel.style.background = stale.length ? 'rgba(160, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.6)'
      panel.textContent = [
        `${stale.length ? 'STALE: ' + stale.join(', ') : 'ok'} · hides ${readout.lifecycle.hides} resumes ${readout.lifecycle.resumes}`,
        `minimize ${m?.active ? 'running ' + m.direction : 'idle'} · compact ${readout.compact} layout ${m?.compactLayout} · timeline ${m?.timelineOffset ?? '?'} ms`,
        `accessory run ${a?.run} motion ${a?.motion} ink ${a?.ink} width ${a?.width} ready ${a?.readyInk} anims ${a?.animations}`,
        `renderer visible ${readout.renderer.visible} tracks ${JSON.stringify(readout.renderer.tracks)} presenters ${readout.renderer.presenters}`,
      ].join('\n')
    } catch (error) {
      panel.textContent = `resume readout failed: ${String(error)}`
    }
    if (!document.hidden) timer = setTimeout(update, 1000) as unknown as number
  }
  document.addEventListener('visibilitychange', () => void update())
  void update()
}
