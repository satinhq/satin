import type { GlassInteraction } from '../glass/rendererContract.ts'
import { activateMenuAction } from '../actions/ActionMenu.tsx'
import { transitionRowFeedback, type RowFeedbackState } from '../press/stateMachine.ts'
import { ROW_HIGHLIGHT_DELAY_MS } from '../press/tokens.ts'
import { ownMenuCompatibilityClick } from '../press/contactReceipt.ts'
import { beginMenuPanelContact } from './menuPanelContact.ts'

export type MenuContactSample = {
  touchId?: number
  pointerId: number
  x: number
  y: number
  phase?: 'start' | 'move' | 'end' | 'cancel'
}

/** How long a contact rests on a submenu row before the submenu opens under it. Unmeasured:
 * the calibrated native contact held 900 ms and the submenu was open (submenus/SPEC.md). */
export const SUBMENU_DWELL_MS = 500

/** One contact owns selection and deformation, including an already recognized context hold. */
export function createMenuContact() {
  let emitLight: ((input: GlassInteraction) => void) | undefined
  let panel: HTMLElement | undefined
  let current: MenuContactSample | undefined
  let releaseOwnership: (() => void) | undefined
  let transferred = false
  let initialRow: HTMLButtonElement | undefined
  let moved = false
  let lightStarted = false
  let feedback: RowFeedbackState = 'idle'
  let timer: ReturnType<typeof setTimeout> | undefined
  let selected: HTMLButtonElement | undefined
  let deformation: ReturnType<typeof beginMenuPanelContact> | undefined
  let dwell: { row: HTMLButtonElement; timer: ReturnType<typeof setTimeout> } | undefined
  /** This contact opened a submenu by resting on its row. */
  let openedSubmenu = false
  const light = (phase: GlassInteraction['phase'], contact = current) => {
    const glass = panel?.querySelector<HTMLElement>('[data-satin-glass-region-id]')
    if (!glass || !emitLight) return
    const point = contact && deformation?.localPoint(glass, contact.x, contact.y)
    if (contact && !point) return
    if (!lightStarted) {
      if (phase === 'rest' || phase === 'releasing') return
      // Recognition transfers a finger still resting on the source row. That
      // contact owns selection, but only lights the glass after entering it.
      if (
        transferred &&
        point &&
        (point.x < 0 || point.y < 0 || point.x > glass.offsetWidth || point.y > glass.offsetHeight)
      )
        return
      phase = 'pressed'
      lightStarted = true
    }
    emitLight({
      regionId: glass.dataset.satinGlassRegionId!,
      phase,
      epoch: performance.timeOrigin + performance.now(),
      contact: point,
    })
  }
  const highlight = (next?: HTMLButtonElement) => {
    if (selected === next) return
    selected?.removeAttribute('data-satin-drag-selected')
    selected = next
    selected?.setAttribute('data-satin-drag-selected', 'true')
  }
  const hit = (sample: MenuContactSample) => {
    const row = panel?.ownerDocument
      .elementFromPoint(sample.x, sample.y)
      ?.closest<HTMLButtonElement>(':is([role="menuitem"], [role="menuitemradio"])')
    return row &&
      panel?.contains(row) &&
      !row.disabled &&
      row.getAttribute('aria-disabled') !== 'true'
      ? row
      : undefined
  }
  // Resting on a submenu row opens it, so one contact can travel into nested menus.
  const dwellOn = (row?: HTMLButtonElement) => {
    if (dwell?.row === row) return
    clearTimeout(dwell?.timer)
    dwell = undefined
    if (!row || row.getAttribute('aria-haspopup') !== 'menu') return
    if (row.getAttribute('aria-expanded') === 'true') return
    dwell = {
      row,
      timer: setTimeout(() => {
        dwell = undefined
        if (!current || selected !== row) return
        openedSubmenu = true
        activateMenuAction(row)
      }, SUBMENU_DWELL_MS),
    }
  }
  const update = () => {
    if (current && feedback === 'pressed') highlight(hit(current))
    dwellOn(current ? selected : undefined)
  }
  /** Lifting off the row a rest just opened (or the new submenu's title, now under the finger)
   * leaves the submenu open. */
  const keepsSubmenu = (row: HTMLButtonElement) =>
    openedSubmenu && row.getAttribute('aria-expanded') === 'true'
  const cancel = () => {
    if (lightStarted) light('rest')
    lightStarted = false
    releaseOwnership?.()
    releaseOwnership = undefined
    clearTimeout(timer)
    dwellOn()
    current = undefined
    feedback = transitionRowFeedback(feedback, 'cancel')
    highlight()
    deformation?.cancel()
    deformation = undefined
  }
  const begin = (sample: MenuContactSample, held = false) => {
    cancel()
    current = sample
    transferred = held
    initialRow = hit(sample)
    moved = false
    openedSubmenu = false
    feedback = transitionRowFeedback('idle', 'down')
    if (panel) deformation = beginMenuPanelContact(panel, sample.x, sample.y)
    light('pressed')
    if (held) {
      feedback = transitionRowFeedback(feedback, 'hold')
      update()
    } else
      timer = setTimeout(() => {
        feedback = transitionRowFeedback(feedback, 'hold')
        update()
      }, ROW_HIGHLIGHT_DELAY_MS)
  }
  const sample = (next: MenuContactSample) => {
    if (!current || next.pointerId !== current.pointerId) return
    current = next
    if (next.phase === 'end' || next.phase === 'cancel') {
      light(next.phase === 'end' ? 'releasing' : 'rest', next)
      const row = next.phase === 'end' ? hit(next) : undefined
      releaseOwnership?.()
      releaseOwnership = undefined
      clearTimeout(timer)
      dwellOn()
      feedback = transitionRowFeedback(feedback, next.phase === 'end' ? 'release' : 'cancel')
      current = undefined
      highlight()
      if (next.phase === 'end') deformation?.release()
      else deformation?.cancel()
      const nativeTap =
        !transferred &&
        !moved &&
        !openedSubmenu &&
        row === initialRow &&
        row?.hasAttribute('data-satin-sensory-button')
      if (!nativeTap) {
        if (panel) ownMenuCompatibilityClick(panel.ownerDocument)
        if (row && !keepsSubmenu(row)) activateMenuAction(row)
      }
      return
    }
    moved ||= hit(next) !== initialRow
    deformation?.move(next.x, next.y)
    light('dragging', next)
    update()
  }
  const controller = {
    begin,
    transfer(sample: MenuContactSample, source: HTMLElement) {
      begin(sample, true)
      const document = source.ownerDocument
      const consume = (event: Event) => {
        let x: number
        let y: number
        if (sample.touchId !== undefined) {
          const touch = [...(event as TouchEvent).changedTouches].find(
            value => value.identifier === sample.touchId,
          )
          if (!touch) return
          x = touch.clientX
          y = touch.clientY
        } else {
          const pointer = event as PointerEvent
          if (pointer.pointerId !== sample.pointerId) return
          x = pointer.clientX
          y = pointer.clientY
        }
        if (event.cancelable) event.preventDefault()
        event.stopPropagation()
        controller.sample({
          ...sample,
          x,
          y,
          phase:
            event.type.endsWith('end') || event.type.endsWith('up')
              ? 'end'
              : event.type.endsWith('cancel')
                ? 'cancel'
                : 'move',
        })
      }
      const events =
        sample.touchId === undefined
          ? ['pointermove', 'pointerup', 'pointercancel']
          : ['touchmove', 'touchend', 'touchcancel']
      for (const event of events)
        document.addEventListener(event, consume, { capture: true, passive: false })
      releaseOwnership = () => {
        for (const event of events) document.removeEventListener(event, consume, true)
      }
    },
    get active() {
      return !!current
    },
    sample,
    cancel,
    attach(element: HTMLElement, sendLight?: (input: GlassInteraction) => void) {
      panel = element
      emitLight = sendLight
      const document = panel.ownerDocument
      const scroll = panel.matches('[data-satin-menu-scroll]')
        ? panel
        : panel.querySelector<HTMLElement>('[data-satin-menu-scroll]')
      const menu = panel.querySelector<HTMLElement>('[data-satin-action-menu]')
      const touchPolicy = () => {
        if (menu)
          menu.style.touchAction =
            scroll && scroll.scrollHeight > scroll.clientHeight + 1 ? 'pan-y' : 'none'
      }
      touchPolicy()
      const resize = new ResizeObserver(touchPolicy)
      if (menu) resize.observe(menu)
      if (current) {
        deformation = beginMenuPanelContact(panel, current.x, current.y)
        light('pressed')
      }
      const down = (event: PointerEvent) => {
        if (current || !event.isPrimary || event.button !== 0) return
        begin({ pointerId: event.pointerId, x: event.clientX, y: event.clientY })
        // Preserve WebKit label activation for a direct tap.
        event.stopImmediatePropagation()
      }
      const pointer = (event: PointerEvent) => {
        if (transferred || event.pointerId !== current?.pointerId) return
        sample({
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          phase:
            event.type === 'pointerup' ? 'end' : event.type === 'pointercancel' ? 'cancel' : 'move',
        })
        if (event.type === 'pointercancel' || moved) event.preventDefault()
        event.stopImmediatePropagation()
      }
      const blur = () => cancel()
      const visibility = () => {
        if (document.hidden) cancel()
      }
      document.defaultView?.addEventListener('blur', blur)
      document.addEventListener('visibilitychange', visibility)
      panel.addEventListener('pointerdown', down, true)
      for (const type of ['pointermove', 'pointerup', 'pointercancel'])
        document.addEventListener(type, pointer as EventListener, true)
      return () => {
        cancel()
        emitLight = undefined
        document.defaultView?.removeEventListener('blur', blur)
        document.removeEventListener('visibilitychange', visibility)
        resize.disconnect()
        element.removeEventListener('pointerdown', down, true)
        for (const type of ['pointermove', 'pointerup', 'pointercancel'])
          document.removeEventListener(type, pointer as EventListener, true)
        panel = undefined
      }
    },
  }
  return controller
}
