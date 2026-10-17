import { PendingSurfaceInput, type SurfaceInput } from './pendingSurfaceInput.ts'

/** The worker's menu-lift input path ('surface-input' requests for the … trigger's press lift). */
export type MenuLiftRequest = SurfaceInput & Readonly<{ id: string }>
export type MenuLiftSurface = Readonly<{
  first: Readonly<{ halfWidth: number; halfHeight: number }>
}>
export type MenuLiftTarget = Readonly<{
  /** The installed menu-lift surface, or undefined before its source is installed. */
  surface: () => MenuLiftSurface | undefined
  apply: (input: SurfaceInput, surface: MenuLiftSurface) => void
  fail: (error: Error) => void
}>

/** Orders input by time, applies it to the installed surface, and holds a contact that arrives
 * before the source (see PendingSurfaceInput). The worker calls `sourceInstalled` after every
 * layer install and `clear` when it is hidden or its layers detach. */
export class MenuLiftInput {
  private at = -Infinity
  private readonly pending: PendingSurfaceInput<SurfaceInput>
  private readonly target: MenuLiftTarget
  constructor(target: MenuLiftTarget, waitMs = 3000) {
    this.target = target
    this.pending = new PendingSurfaceInput(waitMs, queued =>
      target.fail(
        Error(
          `Menu lift source was not installed within ${waitMs} ms of a held press (${queued.length} input(s))`,
        ),
      ),
    )
  }
  get held() {
    return this.pending.size
  }
  input(request: MenuLiftRequest) {
    if (request.id !== 'menu-lift') throw Error('Unknown interactive glass surface ' + request.id)
    if (request.at < this.at) return
    this.at = request.at
    const surface = this.target.surface()
    if (surface) this.target.apply(request, surface)
    else this.pending.hold(request)
  }
  sourceInstalled() {
    if (!this.pending.size) return
    const surface = this.target.surface()
    if (surface) for (const input of this.pending.release()) this.target.apply(input, surface)
  }
  clear() {
    this.pending.clear()
  }
}
