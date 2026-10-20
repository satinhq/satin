// EXPERIMENTAL, PRIVATE. The sidebar drawer as two participants of the pane gesture scope.
//
// - `drawer-open` owns a leading-edge contact at the content's root. It waits on the back
//   swipe's failure and drives the content's own private native scroller (the one the back
//   swipe uses), so one native source per pane is assigned per contact by the scope.
// - `drawer-close` owns a horizontal contact on the drawer's dismissal strip or chrome. It
//   drives the drawer overlay's own private native scroller and catches a running settle at its
//   presented pose at touch-down.
//
// Both write the same axis (exclusive by construction), connect it to app-styled tracks through
// the axis presenter (ScrollTimeline while tracking, a sampled spring after release) and end
// in a release transaction that commits visibility at most once.

import { INTERACTIVE_POP_RECOGNIZER_ID } from '../gestures/existingCompetitors.ts'
import {
  deferGesture,
  failGesture,
  recognizeGesture,
  type GestureRecognizerContext,
} from '../gestures/arena.ts'
import { createAxisPresenter, type AxisTrack } from '../gestures/axisPresenter.ts'
import {
  createReleaseTransaction,
  type GestureParticipant,
  type GestureScope,
  type ReleaseTransaction,
  type ScopeContact,
} from '../gestures/ownership.ts'
import type { PaneContent } from '../gestures/scopeContext.ts'
import { recordMotionPreparation } from '../motionProbe.ts'
import {
  nativeScrubSourceLiveAt,
  releaseNativeScrubClamp,
  retireNativeScrubSource,
} from '../navigation/nativeScrubSource.ts'
import {
  createReleaseVelocityTracker,
  type ReleaseVelocityTracker,
} from '../navigation/releaseVelocity.ts'
import {
  PROVISIONAL_DRAWER_CLAIM_PX,
  PROVISIONAL_DRAWER_SETTLE,
  drawerReleaseOpens,
  drawerTrackValues,
  drawerWidth,
  inLeadingEdge,
  openingSign,
  type DrawerMotion,
  type LayoutDirection,
} from './drawerMotion.ts'

export const DRAWER_OPEN_RECOGNIZER_ID = 'drawer-open'
export const DRAWER_CLOSE_RECOGNIZER_ID = 'drawer-close'
/** The single motion output both drawer participants write. */
export const DRAWER_OUTPUT = 'drawer-axis'

export type DrawerElements = Readonly<{
  root: HTMLElement
  /** The drawer's own wrapper around the app content. */
  content: HTMLElement
  /** The overlay's private native scroller (close contacts bind to it). */
  overlaySource: HTMLElement
  scrim: HTMLElement
  panel: HTMLElement
}>

export type DrawerOptions = Readonly<{
  motion: DrawerMotion
  direction: LayoutDirection
  /** The app allows the leading edge to open the drawer at the content's root. */
  edgeOpen: boolean
  /** The committed visibility (the app's state). */
  open: boolean
  reducedMotion: boolean
}>

type DrawerContact = {
  kind: 'close' | 'open'
  source: HTMLElement
  origin: number
  base: number
  tracker: ReleaseVelocityTracker
  attached: boolean
  lastTime: number
  /** A settle this contact interrupted at touch-down, resumed if the contact never moves. */
  resume?: boolean
}

type PendingSettle = { transaction: ReleaseTransaction<boolean>; target: number }

export type DrawerController = ReturnType<typeof createDrawerController>

/** One touch-policy walk from the contact target up to the scroller it would pan. */
function touchPolicyAllowsPan(target: Element, source: HTMLElement, sign: 1 | -1) {
  for (let element: Element | null = target; element; element = element.parentElement) {
    const policy = getComputedStyle(element).touchAction || 'auto'
    const allows =
      policy === 'auto' ||
      policy === 'manipulation' ||
      policy.includes('pan-x') ||
      policy.includes(sign > 0 ? 'pan-right' : 'pan-left')
    if (!allows) return false
    if (element === source) return true
  }
  return true
}

/** A horizontal claim at the borrowed direction lock. `forward` accepts only logical opening
 * travel (the edge-open contract); otherwise either horizontal direction claims. */
function horizontalClaim(sign: () => 1 | -1, forwardOnly: boolean) {
  return (context: GestureRecognizerContext) => {
    if (context.sample.phase === 'end') return failGesture('released-before-claim')
    const absoluteX = Math.abs(context.deltaX)
    const absoluteY = Math.abs(context.deltaY)
    if (Math.max(absoluteX, absoluteY) < PROVISIONAL_DRAWER_CLAIM_PX) return deferGesture()
    if (absoluteY >= absoluteX) return failGesture('vertical-intent')
    if (forwardOnly && sign() * context.deltaX <= 0) return failGesture('closing-direction')
    return recognizeGesture('horizontal-claim')
  }
}

export function createDrawerController(input: {
  scope: GestureScope
  pane: () => PaneContent | null
  elements: () => DrawerElements | undefined
  options: () => DrawerOptions
  commit: (open: boolean) => void
}) {
  let width = 0
  let paneWidth = 0
  let contact: DrawerContact | undefined
  let pending: PendingSettle | undefined
  const sign = () => openingSign(input.options().direction)

  const tracks = (): AxisTrack[] => {
    const elements = input.elements()
    if (!elements) return []
    const { motion, direction } = input.options()
    const sample = (x: number) => drawerTrackValues(motion, direction, width, x)
    const result: AxisTrack[] = []
    const atRest = sample(0)
    if (atRest.panel !== undefined) {
      result.push({ element: elements.panel, property: 'transform', value: x => sample(x).panel! })
    }
    if (atRest.content !== undefined) {
      // Move the content without moving the scroller a contact may be panning.
      const movable = input.pane()?.movable ?? elements.content
      result.push({ element: movable, property: 'transform', value: x => sample(x).content! })
    }
    if (atRest.scrimTransform !== undefined) {
      result.push({
        element: elements.scrim,
        property: 'transform',
        value: x => sample(x).scrimTransform!,
      })
    }
    result.push({
      element: elements.scrim,
      property: 'opacity',
      value: x => sample(x).scrimOpacity,
    })
    return result
  }
  const presenter = createAxisPresenter(tracks)

  const markPresented = (presented: boolean) => {
    const root = input.elements()?.root
    if (!root) return
    if (presented) root.setAttribute('data-satin-drawer-presented', 'true')
    else root.removeAttribute('data-satin-drawer-presented')
  }

  const restAtCommitted = () => {
    const position = input.options().open ? width : 0
    presenter.rest(position)
    markPresented(position > 0)
  }

  /** Settles to `open` from `from`; commits once at the end when `commits` and it changes the
   * app's visibility. */
  const settleTo = (open: boolean, velocity: number, from: number, commits = true) => {
    const target = open ? width : 0
    const changes = open !== input.options().open
    const transaction = createReleaseTransaction({
      destination: open,
      outcome: commits && changes ? 'commit' : 'cancel',
      generation: input.scope.generation,
      currentGeneration: () => input.scope.generation,
      commit: input.commit,
    })
    pending?.transaction.supersede('replaced')
    const settle: PendingSettle = { transaction, target }
    pending = settle
    markPresented(true)
    const finish = () => {
      presenter.rest(target)
      markPresented(target > 0)
      if (pending === settle) pending = undefined
      const committed = transaction.settled()
      recordMotionPreparation(() => ({
        kind: 'drawer-settled',
        at: performance.now(),
        open,
        committed,
        state: transaction.state,
        supersededReason: transaction.supersededReason,
      }))
    }
    if (input.options().reducedMotion) {
      finish()
      return
    }
    presenter.settle({
      from,
      to: target,
      velocity,
      spring: PROVISIONAL_DRAWER_SETTLE,
      onFinish: finish,
    })
  }

  /** Catches a running settle at its presented pose (touch-down or a new request). */
  const catchSettle = () => {
    if (!pending) return undefined
    const caught = presenter.catch()
    pending.transaction.supersede('caught')
    pending = undefined
    return caught
  }

  const beginContact = (kind: DrawerContact['kind'], source: HTMLElement, sample: ScopeContact) => {
    releaseNativeScrubClamp(source)
    const resumed = kind === 'close' ? catchSettle() : undefined
    const tracker = createReleaseVelocityTracker()
    tracker.record(sign() * sample.clientX, sample.time)
    contact = {
      kind,
      source,
      origin: source.clientWidth * 2,
      base: resumed?.position ?? presenter.position,
      tracker,
      attached: false,
      lastTime: sample.time,
      resume: resumed !== undefined,
    }
  }

  const observe = (sample: ScopeContact) => {
    if (!contact) return undefined
    contact.tracker.record(sign() * sample.clientX, sample.time)
    contact.lastTime = sample.time
    return undefined
  }

  /** Binds the tracks to the contact's scroller with no jump: the axis starts at the contact's
   * base pose and then follows the scroller's travel 1:1. */
  const attach = () => {
    if (!contact) return
    const { source, origin, base } = contact
    markPresented(true)
    recordMotionPreparation(() => ({
      kind: 'drawer-scrub-owner',
      at: performance.now(),
      contact: contact?.kind,
      owner: 'scroll-timeline',
      base,
    }))
    presenter.attachScroll(source, {
      origin,
      base,
      sign: sign(),
      adjustment: -sign() * (origin - source.scrollLeft),
      extent: width,
    })
    contact.attached = true
  }

  const release = (cancelled: boolean, reason: string) => {
    const ended = contact
    contact = undefined
    if (!ended) return
    if (reason === 'geometry-changed' || reason === 'unbound' || reason === 'unregistered') {
      // The pose belongs to a retired geometry: no animation, no commit.
      restAtCommitted()
      retireNativeScrubSource(ended.source, ended.origin)
      return
    }
    if (!ended.attached) {
      // Nothing followed the scroller for this contact; return any range it consumed.
      if (ended.source.scrollLeft !== ended.origin)
        retireNativeScrubSource(ended.source, ended.origin)
      if (ended.resume) settleTo(input.options().open, 0, presenter.position)
      return
    }
    const position = presenter.scrollPosition() ?? presenter.position
    const velocity = ended.tracker.release(ended.lastTime)
    recordMotionPreparation(() => ({
      kind: 'drawer-release',
      at: performance.now(),
      contact: ended.kind,
      cancelled,
      reason,
      position,
      velocity,
      width,
    }))
    // Start the settle (retiring the scroll tracks) before recentring the scroller.
    if (cancelled) {
      // A cancelled contact returns to the committed state and never commits.
      settleTo(input.options().open, velocity, position, false)
    } else {
      const start = ended.kind === 'open' ? 'closed' : 'open'
      settleTo(drawerReleaseOpens(start, position, width, velocity), velocity, position)
    }
    retireNativeScrubSource(ended.source, ended.origin)
  }

  const openParticipant: GestureParticipant = {
    recognizer: {
      axis: 'horizontal',
      priority: 90,
      hysteresis: { claimDistance: PROVISIONAL_DRAWER_CLAIM_PX },
      evaluate: horizontalClaim(sign, true),
    },
    requiresFailureOf: [INTERACTIVE_POP_RECOGNIZER_ID],
    output: DRAWER_OUTPUT,
    multiTouch: 'cancel',
    admit(sample, event, foreign) {
      if (foreign) return 'foreign-contact'
      const elements = input.elements()
      const options = input.options()
      const content = input.pane()
      if (!elements || !options.edgeOpen) return 'edge-open-disabled'
      if (options.open || pending || presenter.position > 0) return 'drawer-presented'
      if (!sample.target || !elements.content.contains(sample.target)) return 'outside-content'
      if (event.touches.length !== 1) return 'multiple-contacts'
      if (!content?.atRoot()) return 'content-not-at-root'
      const bounds = elements.content.getBoundingClientRect()
      if (!inLeadingEdge(sample.clientX, bounds, options.direction)) return 'outside-edge-region'
      if (sample.target.closest('[data-satin-horizontal-drag]')) return 'horizontal-control'
      // Backend honesty: without the content's native scroller this contact would need a frame
      // loop. It is refused (toolbar opening still works), never driven from JavaScript.
      const source = content.source
      if (!source) return 'no-native-source'
      if (!nativeScrubSourceLiveAt(source, sample.time)) return 'native-source-retired'
      if (!touchPolicyAllowsPan(sample.target, source, sign()))
        return 'touch-policy-blocks-native-source'
      return undefined
    },
    begin(sample) {
      const source = input.pane()?.source
      if (source) beginContact('open', source, sample)
    },
    observe,
    recognized: attach,
    finish(_event, cancelled, reason) {
      release(cancelled, reason)
    },
  }

  const closeParticipant: GestureParticipant = {
    recognizer: {
      axis: 'horizontal',
      priority: 95,
      hysteresis: { claimDistance: PROVISIONAL_DRAWER_CLAIM_PX },
      evaluate: horizontalClaim(sign, false),
    },
    output: DRAWER_OUTPUT,
    multiTouch: 'cancel',
    admit(sample, event, foreign) {
      if (foreign) return 'foreign-contact'
      const elements = input.elements()
      if (!elements) return 'unmounted'
      if (!input.options().open && !pending && presenter.position === 0) return 'drawer-hidden'
      // Reveal and push leave the panel outside the overlay's scroller, and their scrim moves with
      // the content: no native source covers the dismissal strip without a feedback loop. The
      // scrim tap, Escape and the toolbar still close them (unqualified gesture, not hidden).
      if (input.options().motion !== 'overlay') return 'no-native-source-for-motion'
      if (!sample.target?.closest('[data-satin-drawer-close-zone]')) return 'outside-close-zone'
      if (!elements.overlaySource.contains(sample.target)) return 'outside-close-zone'
      if (event.touches.length !== 1) return 'multiple-contacts'
      const source = elements.overlaySource
      if (!nativeScrubSourceLiveAt(source, sample.time)) return 'native-source-retired'
      if (
        !touchPolicyAllowsPan(
          sample.target,
          source,
          openingSign(input.options().direction) === 1 ? -1 : 1,
        )
      )
        return 'touch-policy-blocks-native-source'
      return undefined
    },
    begin(sample) {
      const elements = input.elements()
      if (elements) beginContact('close', elements.overlaySource, sample)
    },
    observe,
    recognized: attach,
    finish(_event, cancelled, reason) {
      release(cancelled, reason)
    },
  }

  return {
    register() {
      const removeOpen = input.scope.register(DRAWER_OPEN_RECOGNIZER_ID, openParticipant)
      const removeClose = input.scope.register(DRAWER_CLOSE_RECOGNIZER_ID, closeParticipant)
      const removeExclusive = input.scope.exclusive([
        DRAWER_OPEN_RECOGNIZER_ID,
        DRAWER_CLOSE_RECOGNIZER_ID,
        INTERACTIVE_POP_RECOGNIZER_ID,
      ])
      return () => {
        removeExclusive()
        removeClose()
        removeOpen()
      }
    },
    /** Toolbar, scrim tap or Escape. Catches a running settle at its presented pose. */
    request(open: boolean) {
      input.scope.cancel('presentation-request')
      const caught = catchSettle()
      settleTo(open, caught?.velocity ?? 0, caught?.position ?? presenter.position)
    },
    /** The app changed visibility itself: present it without committing again. */
    syncCommitted(open: boolean) {
      const target = open ? width : 0
      if (contact) return
      if (pending?.target === target) return
      if (!pending && presenter.position === target) return
      const caught = catchSettle()
      settleTo(open, caught?.velocity ?? 0, caught?.position ?? presenter.position, false)
    },
    /** The pane's width. Any change (even one that keeps the drawer's width) retires the
     * geometry generation: a contact began against the old pane. */
    layout(nextPaneWidth: number) {
      if (nextPaneWidth === paneWidth) return
      const resized = paneWidth !== 0
      paneWidth = nextPaneWidth
      width = drawerWidth(nextPaneWidth)
      if (resized) {
        recordMotionPreparation(() => ({
          kind: 'drawer-geometry-retired',
          at: performance.now(),
          paneWidth: nextPaneWidth,
          activeContact: contact?.kind,
          pending: pending !== undefined,
        }))
        input.scope.invalidateGeometry()
        pending?.transaction.supersede('geometry-generation-retired')
        pending = undefined
      }
      restAtCommitted()
    },
    /** The navigator's idle clamp must yield while an open contact drives its scroller. */
    borrowsContentSource: () => contact?.kind === 'open',
    get width() {
      return width
    },
    get position() {
      return presenter.position
    },
    get driver() {
      return presenter.driver
    },
    /** Track elements changed (motion mode, direction or remounted content): re-rest. */
    refresh: restAtCommitted,
  }
}
