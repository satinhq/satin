/** Synchronous ownership of a menu transition. React renders its snapshot;
 * event handlers use this model so two events in one task cannot both submit.
 * Completion tokens prevent an interrupted window's timer settling its successor.
 */
export type MenuInteractionPhase = 'closed' | 'opening' | 'open' | 'closing'
export class MenuInteraction {
  phase: MenuInteractionPhase = 'closed'
  private generation = 0

  private contentContactBeganOpen = false

  /** Existing momentum may continue behind a newly presented native menu.
   * Only a new content contact begun while presented requests dismissal. */
  contentContact() {
    this.contentContactBeganOpen = this.phase === 'opening' || this.phase === 'open'
  }

  contentScroll() {
    return this.contentContactBeganOpen && (this.phase === 'opening' || this.phase === 'open')
  }

  request(open: boolean) {
    if (open === (this.phase === 'opening' || this.phase === 'open')) return undefined
    // A prior dismissing pan is now existing momentum, not a new contact
    // against this presentation.
    if (open) this.contentContactBeganOpen = false
    this.phase = open ? 'opening' : 'closing'
    return ++this.generation
  }

  complete(generation: number) {
    if (generation !== this.generation || (this.phase !== 'opening' && this.phase !== 'closing'))
      return false
    this.phase = this.phase === 'opening' ? 'open' : 'closed'
    return true
  }

  reset(open = false) {
    ++this.generation
    this.contentContactBeganOpen = false
    this.phase = open ? 'open' : 'closed'
  }
}
