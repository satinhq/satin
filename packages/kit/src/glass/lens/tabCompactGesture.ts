/* A captured pointer survives restoration of the semantic tab row. The iOS
 * 26.5 reference keeps a stationary hold compact; lateral movement restores and
 * continues selection in the same contact. UP alone restores the selected tab.
 */
export class TabCompactGesture {
  private pointer?: { id: number; startX: number; dragging: boolean }
  private actions: {
    restore(dragging: boolean): void
    begin(x: number): void
    move(x: number): void
    end(cancelled: boolean): void
  }
  constructor(actions: {
    restore(dragging: boolean): void
    begin(x: number): void
    move(x: number): void
    end(cancelled: boolean): void
  }) {
    this.actions = actions
  }
  get active() {
    return Boolean(this.pointer)
  }
  down(id: number, x: number) {
    if (this.pointer) return false
    this.pointer = { id, startX: x, dragging: false }
    return true
  }
  move(id: number, x: number) {
    const p = this.pointer
    if (!p || p.id !== id) return
    // Existing 7n drag slop; the new native threshold bracket is retained in notes.
    if (!p.dragging && Math.abs(x - p.startX) > 3) {
      p.dragging = true
      this.actions.restore(true)
      this.actions.begin(p.startX)
    }
    if (p.dragging) this.actions.move(x)
  }
  up(id: number, x: number, cancelled = false) {
    const p = this.pointer
    if (!p || p.id !== id) return false
    if (!cancelled) this.move(id, x)
    this.pointer = undefined
    if (p.dragging) this.actions.end(cancelled)
    else if (!cancelled) this.actions.restore(false)
    return true
  }
  cancel() {
    if (this.pointer) this.up(this.pointer.id, this.pointer.startX, true)
  }
}
