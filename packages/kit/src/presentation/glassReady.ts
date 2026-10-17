import { VisibleDeadline } from '../glass/visibleDeadline.ts'
import { reportGlassError } from '../glass/errors.ts'
import { hold, releaseHold } from '../glass/presentationFrame.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { lagTraceEnabled } from '../glass/webgpu/lagTrace.ts'
import { glassNow, glassTiming } from '../glass/webgpu/profile.ts'

let nextShow = 0
/** Keep the whole surface together until this show's scene has been submitted.
 * Layout stays measurable while hidden; no replacement material is displayed. */
export function holdPresentationForGlass(
  panel: HTMLElement,
  dimmer: HTMLElement | null,
  animations: readonly Animation[],
  invalidate: () => void,
  onReady: () => void = () => {},
  canReveal: () => boolean = () => true,
  /** Native has no presented sheet before its presentation: nothing held is focusable or reachable
   * by assistive technology (a menu keeps its own inert state, menuPresenter.tsx). */
  {
    inert = false,
    revealStart,
    onFailure,
  }: {
    inert?: boolean
    revealStart?: () => Promise<number>
    /** Retire caller-owned visibility on failure instead of starting an unready entrance. */
    onFailure?: () => void
  } = {},
) {
  const generation = String(++nextShow)
  const requestedAt = lagTraceEnabled() ? glassNow() : 0
  const trace = (stage: string) => {
    if (lagTraceEnabled()) glassTiming(stage, requestedAt, generation)
  }
  trace('presentation-held')
  // Only this presentation's own materials gate it: a canvas owned directly by a glass region in
  // this dialog. A container's auxiliary canvas sits inside the sheet's region without being one,
  // and a nested dialog holds its own show (reference readiness contract). Glass that mounts during the
  // hold (a sheet's toolbar capsules are laid out after it opens) gates it too.
  const dialog = panel.closest('dialog')
  const gated = () =>
    [
      ...panel.querySelectorAll<HTMLCanvasElement>(
        'canvas[data-satin-glass-region-canvas]:not([data-satin-glass-lift])',
      ),
    ].filter(
      canvas =>
        canvas.parentElement?.hasAttribute('data-satin-glass-region-id') &&
        canvas.closest('dialog') === dialog,
    )
  // Glass on a presentation samples the presentation's own content. Nothing may show until the
  // renderer holds a backdrop measured during this hold (presentationFrame.ts) and the glass has
  // been drawn over it, or the glass would show the screen below and change once content arrives.
  let sourced = !panel.querySelector('[data-satin-presentation-content]')
  let show = generation
  const arm = (canvas: HTMLCanvasElement) => {
    canvas.dataset.satinGlassShow = show
    delete canvas.dataset.satinGlassPresented
    delete canvas.dataset.satinGlassPresentedShow
  }
  const targets = [panel, dimmer].filter((node): node is HTMLElement => node !== null)
  // The hold is marked with its show generation, so source preparation can read through this
  // framework hold while content an author hid stays hidden.
  for (const node of targets) hold(node, generation)
  const releaseEditor = keepFocusedEditor(panel)
  const releaseInert = inert ? holdInert(targets, panel) : (_refocus: boolean) => {}
  for (const animation of animations) {
    animation.pause()
    animation.currentTime = 0
  }
  gated().forEach(arm)
  let stopped = false
  let preparingMotion = false
  const observer = new MutationObserver(check)
  // The failure is reported loudly, then the presentation stops holding: an invisible modal would
  // trap the app. The entrance settles at its resting pose without the motion sampling hook.
  const deadline = new VisibleDeadline(10_000, () => {
    if (stopped) return
    trace('presentation-readiness-timeout')
    reportGlassError(
      'readiness-timeout',
      new Error('Presentation glass did not submit for the current show'),
      'presentation-first-show',
    )
    stopped = true
    observer.disconnect()
    if (!canReveal()) return
    if (onFailure) {
      // Menu callers own a separate visibility state. Dismiss it before releasing this hold;
      // treating failure as ready would start an entrance with no admitted glass.
      onFailure()
      reveal(true)
    } else {
      reveal()
      for (const animation of animations) animation.finish()
    }
  })
  deadline.start()
  function reveal(closing = false) {
    for (const node of targets) releaseHold(node, generation)
    releaseEditor()
    releaseInert(!closing)
  }
  function check() {
    if (stopped || preparingMotion) return
    const canvases = gated()
    if (!canvases.length) return
    const late = canvases.filter(canvas => canvas.dataset.satinGlassShow !== show)
    if (late.length) {
      late.forEach(arm)
      invalidate()
      return
    }
    if (!sourced) {
      if (panel.getAttribute('data-satin-glass-source') !== generation) return
      sourced = true
      trace('presentation-source-ready')
      // Draws from scenes posted before this backdrop are not this show's: count only receipts
      // for scenes that sample it.
      show = `${generation}:source`
      canvases.forEach(arm)
      invalidate()
      return
    }
    if (canvases.some(canvas => canvas.dataset.satinGlassPresentedShow !== show)) return
    const start = (epoch?: number) => {
      if (stopped) return
      // Motion admission is asynchronous. A control can register or lose its scene while the
      // outer material acquires its moving clock. Recheck the entire show before exposing it;
      // a replacement admission must acquire a fresh clock after every material is ready again.
      const current = gated()
      if (
        !current.length ||
        current.some(
          canvas =>
            canvas.dataset.satinGlassShow !== show ||
            canvas.dataset.satinGlassPresentedShow !== show,
        )
      ) {
        preparingMotion = false
        check()
        return
      }
      stopped = true
      observer.disconnect()
      deadline.cancel()
      // A retained dismissal can outlive its opening. Never revive its entrance.
      if (!canReveal()) return
      reveal()
      trace('presentation-shown')
      // Rebase a pending pause, using the renderer's admitted clock when it follows this run.
      for (const animation of animations) {
        animation.play()
        animation.startTime = epoch ?? document.timeline.currentTime
      }
      onReady()
    }
    if (revealStart) {
      preparingMotion = true
      void revealStart().then(start)
    } else start()
  }
  observer.observe(panel, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-satin-glass-presented-show', 'data-satin-glass-source'],
  })
  invalidate()
  return () => {
    stopped = true
    observer.disconnect()
    deadline.cancel()
    reveal(true)
    for (const canvas of gated()) {
      // Retire this generation before a pending scene can acknowledge it.
      if (canvas.dataset.satinGlassShow === show) {
        delete canvas.dataset.satinGlassShow
        delete canvas.dataset.satinGlassPresented
        delete canvas.dataset.satinGlassPresentedShow
      }
    }
  }
}

/**
 * The held nodes are inert, so the hold is invisible to focus and assistive technology as well as
 * to the eye. An editor the opening tap focused stays focusable (keepFocusedEditor): the nodes
 * beside its path are inert instead. A visible focus inside the panel (a dialog's initial focus
 * after a keyboard arrival) is given back at reveal. An `inert` the app set is left alone. The
 * attribute is not read by glass source measurement (mirrorExtents.ts), so it changes no capture.
 */
function holdInert(targets: readonly HTMLElement[], panel: HTMLElement) {
  const document = panel.ownerDocument
  const active = document.activeElement
  const focused = active instanceof HTMLElement && panel.contains(active) ? active : null
  const editor = focused?.matches(
    'input, textarea, [contenteditable]:not([contenteditable="false"])',
  )
    ? focused
    : null
  // A UA :focus-visible match may still be quieted after touch. Save the painted indicator
  // before inertness blurs the target and clears that suppression.
  const refocusable = focused !== editor && visibleFocus(focused) ? focused : null
  const inerted: Element[] = []
  const makeInert = (node: Element) => {
    if (node.hasAttribute('inert')) return
    node.setAttribute('inert', '')
    inerted.push(node)
  }
  for (const node of targets) {
    if (!editor || !node.contains(editor)) {
      makeInert(node)
      continue
    }
    for (let path: Element = editor; path !== node; path = path.parentElement!)
      for (const sibling of path.parentElement!.children) if (sibling !== path) makeInert(sibling)
  }
  let released = false
  return (refocus: boolean) => {
    if (released) return
    released = true
    for (const node of inerted) node.removeAttribute('inert')
    const now = document.activeElement
    if (refocus && refocusable?.isConnected && (!now || now === document.body))
      focusFromFramework(refocusable, { preventScroll: true })
  }
}
function visibleFocus(element: HTMLElement | null) {
  try {
    return !!element?.matches(':focus-visible') && !element.hasAttribute('data-satin-focus-quiet')
  } catch {
    return false
  }
}

/**
 * Measured on the iPad: an alert focuses its text field in the opening tap, the hold then hides
 * the panel, and WebKit ends editing at the next rendering update because a hidden element cannot
 * keep focus (focusout 3-12 ms after focusin, no keyboard). The focused editor stays focusable
 * and unpainted for the hold instead, so the keyboard the tap asked for still comes.
 */
function keepFocusedEditor(panel: HTMLElement) {
  const editor = panel.ownerDocument.activeElement
  if (!(editor instanceof HTMLElement) || !panel.contains(editor)) return () => {}
  if (!editor.matches('input, textarea, [contenteditable]:not([contenteditable="false"])'))
    return () => {}
  const { visibility, opacity } = editor.style
  editor.style.visibility = 'visible'
  editor.style.opacity = '0'
  let released = false
  return () => {
    if (released) return
    released = true
    editor.style.visibility = visibility
    editor.style.opacity = opacity
  }
}
