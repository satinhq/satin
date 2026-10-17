/** The edge a view moves through, resolved against its own layout direction. */
export type TransitionEdge = 'top' | 'bottom' | 'leading' | 'trailing'
type Effect = Readonly<
  { kind: 'opacity' } | { kind: 'scale'; scale: number } | { kind: 'move'; edge: TransitionEdge }
>

/** How a view enters and leaves: opacity, scale and move effects. `withAnimation` sets the
 * timing. */
export type Transition = Readonly<{ insertion: readonly Effect[]; removal: readonly Effect[] }>

function effects(insertion: readonly Effect[], removal = insertion): Transition {
  return Object.freeze({
    insertion: Object.freeze(insertion.map(effect => Object.freeze({ ...effect }))),
    removal: Object.freeze(removal.map(effect => Object.freeze({ ...effect }))),
  })
}
function move(edge: TransitionEdge): Transition {
  return effects([{ kind: 'move', edge }])
}
function scale(value = 0): Transition {
  if (!Number.isFinite(value) || value < 0)
    throw new Error('Transition scale must be finite and non-negative.')
  return effects([{ kind: 'scale', scale: value }])
}
function asymmetric(insertion: Transition, removal: Transition): Transition {
  return effects(insertion.insertion, removal.removal)
}
function combined(...transitions: readonly Transition[]): Transition {
  return effects(
    transitions.flatMap(value => value.insertion),
    transitions.flatMap(value => value.removal),
  )
}
const opacity = effects([{ kind: 'opacity' }])
/** Builds transitions: `identity`, `opacity`, `move`, `scale`, `slide`, `push` and their
 * combinations. Each returns a new value. */
export const Transition = Object.freeze({
  identity: effects([]),
  opacity,
  move,
  scale,
  slide: asymmetric(move('leading'), move('trailing')),
  push: (edge: TransitionEdge): Transition => {
    const opposite = {
      top: 'bottom',
      bottom: 'top',
      leading: 'trailing',
      trailing: 'leading',
    } as const
    return combined(opacity, asymmetric(move(edge), move(opposite[edge])))
  },
  asymmetric,
  combined,
})

export type TransitionPose = Readonly<{ x: number; y: number; scale: number; opacity: number }>
export const identityPose: TransitionPose = { x: 0, y: 0, scale: 1, opacity: 1 }
export function transitionPose(
  transition: Transition,
  phase: 'insertion' | 'removal',
  width: number,
  height: number,
  rtl: boolean,
): TransitionPose {
  let x = 0,
    y = 0,
    scale = 1,
    opacity = 1
  for (const effect of transition[phase]) {
    if (effect.kind === 'opacity') opacity = 0
    else if (effect.kind === 'scale') scale *= effect.scale
    else if (effect.edge === 'top') y -= height
    else if (effect.edge === 'bottom') y += height
    else x += (effect.edge === 'leading' ? -1 : 1) * (rtl ? -1 : 1) * width
  }
  return { x, y, scale, opacity }
}
