import { Component, createContext, useContext, type ReactNode } from 'react'

/** The nearest dismissal: a pushed screen pops itself, a presentation's root dismisses it. */
export const DismissContext = createContext<(() => void) | undefined>(undefined)

/**
 * Closes the screen or presentation that contains the caller.
 * In a pushed screen it pops that screen; at the root of a Sheet or FullScreenCover it dismisses the
 * presentation, even when interactive dismissal is disabled. Elsewhere it does nothing.
 */
export function useDismiss(): () => void {
  return useContext(DismissContext) ?? noDismissal
}
function noDismissal() {}

type BoundaryState = { failure: { error: unknown } | null }

/**
 * A render or effect error inside one presentation stays inside it. The app behind it keeps
 * running and the presentation can still be dismissed. React still reports the caught error.
 */
export class PresentationBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failure: null }
  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failure: { error } }
  }
  render() {
    const failure = this.state.failure
    if (!failure) return this.props.children
    const detail = failure.error instanceof Error ? failure.error.message : String(failure.error)
    return (
      <div role="alert" className="satin-presentation-failure">
        <p className="satin-presentation-failure-title">This content couldn’t be shown.</p>
        <p className="satin-presentation-failure-detail">{detail}</p>
      </div>
    )
  }
}
