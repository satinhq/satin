import type { NavigationReleaseDecision } from './releaseDecision.ts'
import type { ComponentType } from 'react'
import type { ScrollSnapshot } from '../scroll/types.ts'

declare const screenParamsType: unique symbol

export type PresentationKind = 'push'

/** Where a screen is in a navigation transition: `entering`, `exiting` or `settled`. */
export type TransitionPhase = 'settled' | 'entering' | 'exiting'

export type TransitionOperation = 'pop' | 'popToRoot' | 'push' | 'replace'

/** Whether a pushed screen shows its back button. `automatic` shows it; `hidden` removes it. */
export type NavigationBackButtonBehavior = 'automatic' | 'hidden'

/** How a screen title is drawn: `inline` in the bar, `large` below it, `inlineLarge` large inside
 * the bar row, or `none`. */
export type TitleDisplayMode = 'inline' | 'large' | 'inlineLarge' | 'none'

/** Whether the navigation bar shows. A hidden bar reserves no row. */
export type Visibility = 'automatic' | 'visible' | 'hidden'

export type NavigationBarDefinition<Params = unknown> = Readonly<{
  backButton?: NavigationBackButtonBehavior
  display?: TitleDisplayMode
  visibility?: Visibility
  title: string | ((params: Params) => string)
  /** A line under the title, inline or large. */
  subtitle?: string
}>

export type TransitionControllerContext = Readonly<{
  interactive: boolean
  operation: TransitionOperation
}>

export type TransitionBinding = Readonly<{
  /** Transform-only mask for the fixed back control during depth changes. */
  backButtonMask?: HTMLElement
  backButtonFromVisible?: boolean
  backButtonToVisible?: boolean
  /** Counter-transformed visual that keeps the masked control stationary. */
  backButtonVisual?: HTMLElement
  direction: 'pop' | 'push'
  /** Current route/source/region draw admission for an automatic push. */
  glassReady?: Promise<void>
  /** The nested layer that owns this screen's incoming or outgoing motion. */
  primary: HTMLElement
  /** The framework chrome title paired with the primary screen. */
  primaryTitle?: HTMLElement
  /** The primary entry's bar toolbar slots (faded, never switched, by the transition). */
  primaryToolbar?: readonly HTMLElement[]
  /** The outer layer that owns parallax when this screen is revealed. */
  secondary?: HTMLElement
  /** Transparent sheet pages expose only the rear area left of the front page. */
  occludeSecondary?: boolean
  /** The revealed screen's dim layer, animated independently from transforms. */
  secondaryDim?: HTMLElement
  /** The framework chrome title paired with the secondary screen. */
  secondaryTitle?: HTMLElement
  /** The secondary title's clipping box and its counter-moved content: the rear title is covered
   * by the front page (iOS 27), so it is clipped at that page's left edge. */
  secondaryTitleClip?: HTMLElement
  secondaryTitleContent?: HTMLElement
  /** The secondary entry's bar toolbar slots. */
  secondaryToolbar?: readonly HTMLElement[]
  width: number
}>

export interface TransitionController {
  readonly progress: number
  readonly interactionPhase?: 'held' | 'completing' | 'cancelling'
  /** Transfers the visible destination into a subsequent push. */
  finishForPush?(): void
  /** Relinquish the exposed page while the departing page keeps completing. */
  yieldForPop?(): number | undefined
  /** Resume a cancelling pop at its presented pose. */
  resumeInteractive?(): void
  /** Re-arm the shared native input source without ending a completing pop. */
  prepareForNextGesture?(): void
  /** Starts controller-owned work after the transition state has been published. */
  start?(): void
  /** Binds compositor work to the screen containers after React commits them. */
  bind?(binding: TransitionBinding): () => void
  /** Direct manipulation updates progress without publishing Navigator state. */
  setProgress?(progress: number): void
  /** Internal installed experiment: native scrolling supplies compositor progress. */
  scrubFromScroll?(source: HTMLElement, origin: number, adjustment: number): void
  /** Resolves completion from delivered statistics and progress. A busy native
   * continuation retains that endpoint while its presented pose advances. */
  resolveInteractive?(
    velocityPointsPerSecond: number,
    finalRawProgress: number,
    cancelled: boolean,
    decision?: NavigationReleaseDecision,
    /** The lift's event time (performance.now() clock): the release clock starts there. */
    liftAt?: number,
  ): void
  /** Resolves an interactive transition while preserving forward velocity. */
  completeInteractive?(velocityPointsPerSecond: number, finalRawProgress?: number): void
  /** Returns an interactive transition to its pre-gesture state. */
  cancelInteractive?(velocityPointsPerSecond: number, finalRawProgress?: number): void
  /** The leading page's presented offset as a fraction of the width (a pop's progress), read
   * when a gesture takes this transition over: an interrupted push turns around there. */
  presentedPose?(): number | undefined
  finish(): void
  cancel(): void
}

export type TransitionCompletion = {
  changed?(): void
  finish(): void
  cancel(): void
}

export type TransitionControllerFactory = (
  completion: TransitionCompletion,
  context: TransitionControllerContext,
) => TransitionController

export type EntryTransition = Readonly<{
  controller: TransitionController
  phase: TransitionPhase
}>

export type ScreenDefinition<Id extends string = string, Params = unknown> = Readonly<{
  component: ComponentType
  restoration?: import('./routeCodec.ts').RouteSchema<Params>
  id: Id
  navigation?: NavigationBarDefinition<Params>
  /** Semantic sidebar row identity, derived from this registered destination. */
  splitSelection?: string | ((params: Params) => string)
  [screenParamsType]?: Params
}>

export type AnyScreenDefinition = ScreenDefinition<string, any>

export type ScreenEntry<Id extends string = string, Params = unknown> = Readonly<{
  key: string
  params: Params
  presentation: PresentationKind
  screenId: Id
  scrollSnapshot?: ScrollSnapshot
  transition: EntryTransition
}>

export type NavigatorState<Entry extends ScreenEntry = ScreenEntry> = Readonly<{
  entries: readonly Entry[]
}>

/** Whether a screen is covered by another, and the phase of its current transition. */
export type ScreenLifecycle = Readonly<{
  isCovered: boolean
  phase: TransitionPhase
}>

/** The `appear` and `disappear` callbacks for `useScreenLifecycle`. */
export type ScreenLifecycleCallbacks = Readonly<{
  appear?: () => void
  disappear?: () => void
}>
