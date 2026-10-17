import { VisibleDeadline } from '../visibleDeadline.ts'
/** Where a pending menu surface is: waiting for a preparation, in its capture and raster, or
 * installed and waiting for the worker's acknowledgement. Diagnostic only. */
export type MenuSurfaceStage = 'prepare' | 'raster' | 'install-ack'

/** A menu surface that is not installed never draws, so a menu run must never be dropped silently.
 * A run while the menu surface is disabled is a glass error at once. Otherwise one watchdog per
 * pending menu runs from its first held run until its surface is installed and acknowledged by the
 * worker, with a fixed budget of visible time (time while the document is hidden does not count;
 * nothing else pauses it). When the budget is spent it is a loud glass error naming the stage. */
export class MenuSurfaceGuard {
  private readonly deadline: VisibleDeadline
  private fail: (error: Error) => void
  constructor(budgetMs: number, stage: () => MenuSurfaceStage, fail: (error: Error) => void) {
    this.fail = fail
    this.deadline = new VisibleDeadline(budgetMs, () =>
      this.fail(
        Error(
          `Menu glass surface was not presented within ${budgetMs / 1000} s of visible time (pending: ${stage()})`,
        ),
      ),
    )
  }
  disabled() {
    this.fail(Error('Menu glass surface is not enabled: the menu ran with no glass surface'))
  }
  start() {
    this.deadline.start()
  }
  cancel() {
    this.deadline.cancel()
  }
  get pending() {
    return this.deadline.pending
  }
}
