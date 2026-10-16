import { describe, expect, it } from 'vitest'
import {
  NAVIGATION_DIRECTION_LOCK_PX,
  NAVIGATION_HORIZONTAL_INTENT_PX,
} from '../navigation/motion.ts'
import { PRESSABLE_RETENTION_OFFSET_PX } from '../press/tokens.ts'
import {
  createGestureArena,
  deferGesture,
  failGesture,
  recognizeGesture,
  recognizerState,
  reduceGestureArena,
  type GestureArenaDefinition,
  type GestureArenaSession,
  type GestureRecognizerDeclaration,
  type NormalizedPointerSample,
} from './arena.ts'
import {
  INTERACTIVE_POP_RECOGNIZER_ID,
  NATIVE_SCROLL_RECOGNIZER_ID,
  PRESS_RECOGNIZER_ID,
  createExistingCompetitorArena,
  interactivePopReleaseTarget,
  interactivePopRecognizer,
  interactivePopVisualProgress,
  pressRecognizer,
} from './existingCompetitors.ts'

const bounds = { bottom: 874, left: 0, right: 402, top: 0 }

function pointer(
  phase: NormalizedPointerSample['phase'],
  x: number,
  y: number,
  options: Readonly<{
    isPrimary?: boolean
    pointerId?: number
    time?: number
  }> = {},
): NormalizedPointerSample {
  return {
    isPrimary: options.isPrimary ?? true,
    kind: 'pointer',
    phase,
    pointerId: options.pointerId ?? 7,
    time: options.time ?? 0,
    x,
    y,
  }
}

function start(arena: GestureArenaDefinition, x = 100, y = 300): GestureArenaSession {
  return reduceGestureArena(arena, undefined, pointer('start', x, y)).session!
}

function declaration(
  id: string,
  priority: number,
  evaluate: GestureRecognizerDeclaration['evaluate'],
  extra: Partial<GestureRecognizerDeclaration> = {},
): GestureRecognizerDeclaration {
  return {
    axis: 'any',
    evaluate,
    hysteresis: {},
    id,
    priority,
    region: { kind: 'all' },
    ...extra,
  }
}

describe('gesture arena lifecycle and validation', () => {
  it('enters began then possible and activates a declared preview synchronously', () => {
    const arena = createGestureArena({
      bounds,
      recognizers: [
        declaration('preview', 0, () => deferGesture(), {
          previewWhilePossible: true,
        }),
      ],
    })

    const step = reduceGestureArena(arena, undefined, pointer('start', 40, 80))

    expect(step.transitions).toEqual([
      {
        reason: 'sequence-started',
        recognizerId: 'preview',
        to: 'began',
      },
      {
        from: 'began',
        reason: 'eligible',
        recognizerId: 'preview',
        to: 'possible',
      },
    ])
    expect(step.previews).toEqual([{ active: true, recognizerId: 'preview' }])
    expect(recognizerState(step.session!, 'preview')).toMatchObject({
      previewActive: true,
      state: 'possible',
    })
  })

  it('applies named system-edge exclusions at sequence start', () => {
    const arena = createGestureArena({
      bounds,
      exclusions: [
        {
          id: 'system-left-edge',
          recognizerIds: ['custom-drag'],
          region: { edge: 'left', kind: 'edge', size: 16 },
        },
      ],
      recognizers: [declaration('custom-drag', 0, () => deferGesture())],
    })

    const session = start(arena, 8, 200)
    expect(recognizerState(session, 'custom-drag').state).toBe('failed')
  })

  it('rejects cyclic failure requirements and one-sided simultaneity', () => {
    expect(() =>
      createGestureArena({
        bounds,
        recognizers: [
          declaration('first', 0, () => deferGesture(), {
            requiresFailureOf: ['second'],
          }),
          declaration('second', 0, () => deferGesture(), {
            requiresFailureOf: ['first'],
          }),
        ],
      }),
    ).toThrow(/failure requirements contain a cycle/)

    expect(() =>
      createGestureArena({
        bounds,
        recognizers: [
          declaration('first', 0, () => deferGesture(), {
            simultaneousWith: ['second'],
          }),
          declaration('second', 0, () => deferGesture()),
        ],
      }),
    ).toThrow(/simultaneity must be mutual/)
  })
})

describe('gesture arena ordering and relationships', () => {
  it('lets priority, then declaration order, resolve exclusive recognizers', () => {
    const recognizesOnMove = declaration('low', 1, context =>
      context.sample.phase === 'move' ? recognizeGesture() : deferGesture(),
    )
    const arena = createGestureArena({
      bounds,
      recognizers: [
        recognizesOnMove,
        declaration('high', 10, context =>
          context.sample.phase === 'move' ? recognizeGesture() : deferGesture(),
        ),
      ],
    })

    const step = reduceGestureArena(arena, start(arena), pointer('move', 120, 300, { time: 16 }))

    expect(recognizerState(step.session!, 'high').state).toBe('recognized')
    expect(recognizerState(step.session!, 'low').state).toBe('canceled')
    expect(step.transitions.map(({ recognizerId, to }) => [recognizerId, to])).toEqual([
      ['high', 'recognized'],
      ['low', 'canceled'],
    ])

    const tiedArena = createGestureArena({
      bounds,
      recognizers: [
        declaration('declared-first', 5, context =>
          context.sample.phase === 'move' ? recognizeGesture() : deferGesture(),
        ),
        declaration('declared-second', 5, context =>
          context.sample.phase === 'move' ? recognizeGesture() : deferGesture(),
        ),
      ],
    })
    const tied = reduceGestureArena(
      tiedArena,
      start(tiedArena),
      pointer('move', 120, 300, { time: 16 }),
    )
    expect(recognizerState(tied.session!, 'declared-first').state).toBe('recognized')
    expect(recognizerState(tied.session!, 'declared-second').state).toBe('canceled')
  })

  it('holds a ready recognizer until its failure requirement fails', () => {
    const arena = createGestureArena({
      bounds,
      recognizers: [
        declaration('interactive-pop', 10, context =>
          context.deltaX < 0 ? failGesture('leftward') : deferGesture(),
        ),
        declaration(
          'swipe-action',
          20,
          context => (context.sample.phase === 'move' ? recognizeGesture() : deferGesture()),
          {
            requiresFailureOf: ['interactive-pop'],
          },
        ),
      ],
    })
    const waiting = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 110, 300, { time: 16 }),
    )

    expect(recognizerState(waiting.session!, 'swipe-action')).toMatchObject({
      ready: true,
      state: 'possible',
    })

    const unblocked = reduceGestureArena(
      arena,
      waiting.session,
      pointer('move', 90, 300, { time: 32 }),
    )
    expect(unblocked.transitions.map(({ recognizerId, to }) => [recognizerId, to])).toEqual([
      ['interactive-pop', 'failed'],
      ['swipe-action', 'recognized'],
    ])
  })

  it('recognizes an explicit simultaneous set and cancels its conflicts', () => {
    const recognizeOnMove = (
      context: Parameters<NonNullable<GestureRecognizerDeclaration['evaluate']>>[0],
    ) => (context.sample.phase === 'move' ? recognizeGesture() : deferGesture())
    const arena = createGestureArena({
      bounds,
      recognizers: [
        declaration('pan', 20, recognizeOnMove, { simultaneousWith: ['preview'] }),
        declaration('conflict', 15, recognizeOnMove),
        declaration('preview', 10, recognizeOnMove, { simultaneousWith: ['pan'] }),
      ],
    })

    const result = reduceGestureArena(arena, start(arena), pointer('move', 130, 300, { time: 16 }))

    expect(recognizerState(result.session!, 'pan').state).toBe('recognized')
    expect(recognizerState(result.session!, 'preview').state).toBe('recognized')
    expect(recognizerState(result.session!, 'conflict').state).toBe('canceled')
  })

  it('does not treat cancellation as satisfying a failure requirement', () => {
    const recognizeOnMove = (
      context: Parameters<NonNullable<GestureRecognizerDeclaration['evaluate']>>[0],
    ) => (context.sample.phase === 'move' ? recognizeGesture() : deferGesture())
    const arena = createGestureArena({
      bounds,
      recognizers: [
        declaration('winner', 20, recognizeOnMove, {
          simultaneousWith: ['dependent'],
        }),
        declaration('required', 15, () => deferGesture()),
        declaration('dependent', 10, recognizeOnMove, {
          requiresFailureOf: ['required'],
          simultaneousWith: ['winner'],
        }),
      ],
    })

    const result = reduceGestureArena(arena, start(arena), pointer('move', 120, 300, { time: 16 }))
    expect(recognizerState(result.session!, 'winner').state).toBe('recognized')
    expect(recognizerState(result.session!, 'required').state).toBe('canceled')
    expect(recognizerState(result.session!, 'dependent')).toMatchObject({
      ready: true,
      state: 'possible',
    })
  })

  it('keeps a simultaneous recognizer possible until it is ready later', () => {
    const arena = createGestureArena({
      bounds,
      recognizers: [
        declaration(
          'pan',
          20,
          context => (context.deltaX >= 10 ? recognizeGesture() : deferGesture()),
          { simultaneousWith: ['long-press'] },
        ),
        declaration(
          'long-press',
          10,
          context => (context.elapsed >= 500 ? recognizeGesture() : deferGesture()),
          { simultaneousWith: ['pan'] },
        ),
      ],
    })
    const pan = reduceGestureArena(arena, start(arena), pointer('move', 110, 300, { time: 20 }))
    expect(recognizerState(pan.session!, 'long-press').state).toBe('possible')

    const together = reduceGestureArena(
      arena,
      pan.session,
      pointer('move', 112, 300, { time: 520 }),
    )
    expect(recognizerState(together.session!, 'pan').state).toBe('recognized')
    expect(recognizerState(together.session!, 'long-press').state).toBe('recognized')
  })
})

describe('synchronous cancellation and pointer identity', () => {
  it('returns winner, loser cancellation, and preview clearing in one reduction', () => {
    const arena = createExistingCompetitorArena(bounds)
    const began = reduceGestureArena(arena, undefined, pointer('start', 100, 300))
    expect(recognizerState(began.session!, PRESS_RECOGNIZER_ID).previewActive).toBe(true)

    const resolved = reduceGestureArena(
      arena,
      began.session,
      pointer('move', 110, 300, { time: 16 }),
    )

    expect(recognizerState(resolved.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe(
      'recognized',
    )
    expect(recognizerState(resolved.session!, PRESS_RECOGNIZER_ID)).toMatchObject({
      previewActive: false,
      state: 'canceled',
    })
    expect(resolved.previews).toEqual([{ active: false, recognizerId: PRESS_RECOGNIZER_ID }])
    expect(resolved.transitions.map(({ recognizerId, to }) => [recognizerId, to])).toEqual([
      [INTERACTIVE_POP_RECOGNIZER_ID, 'recognized'],
      [PRESS_RECOGNIZER_ID, 'canceled'],
    ])
  })

  it('ignores a second pointer until the tracked primary identifier ends', () => {
    const arena = createExistingCompetitorArena(bounds)
    const primary = start(arena)
    const secondDown = reduceGestureArena(
      arena,
      primary,
      pointer('start', 220, 300, { isPrimary: false, pointerId: 8, time: 10 }),
    )
    expect(secondDown.ignored).toBe('foreign-pointer')
    expect(secondDown.session?.activePointerIds).toEqual([7, 8])

    const secondMove = reduceGestureArena(
      arena,
      secondDown.session,
      pointer('move', 300, 300, { isPrimary: false, pointerId: 8, time: 20 }),
    )
    expect(secondMove.ignored).toBe('foreign-pointer')
    expect(recognizerState(secondMove.session!, PRESS_RECOGNIZER_ID).previewActive).toBe(true)

    const secondEnd = reduceGestureArena(
      arena,
      secondMove.session,
      pointer('end', 300, 300, { isPrimary: false, pointerId: 8, time: 30 }),
    )
    expect(secondEnd.session?.activePointerIds).toEqual([7])

    const primaryEnd = reduceGestureArena(
      arena,
      secondEnd.session,
      pointer('end', 100, 300, { time: 40 }),
    )
    expect(primaryEnd.session?.status).toBe('ended')
    expect(recognizerState(primaryEnd.session!, PRESS_RECOGNIZER_ID).state).toBe('recognized')
  })
})

describe('current pop, press, and native-scroll regressions', () => {
  it('uses the measured constants as arena hysteresis parameters', () => {
    expect(interactivePopRecognizer.hysteresis).toEqual({
      activationDistance: NAVIGATION_HORIZONTAL_INTENT_PX,
      claimDistance: NAVIGATION_DIRECTION_LOCK_PX,
    })
    expect(pressRecognizer.hysteresis.retentionDistance).toBe(PRESSABLE_RETENTION_OFFSET_PX)
  })

  it('keeps a tap possible below 10 points and activates Pressable on release', () => {
    const arena = createExistingCompetitorArena(bounds)
    const moved = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 109.9, 300, { time: 20 }),
    )
    expect(recognizerState(moved.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe('possible')
    expect(recognizerState(moved.session!, PRESS_RECOGNIZER_ID).state).toBe('possible')

    const released = reduceGestureArena(
      arena,
      moved.session,
      pointer('end', 109.9, 300, { time: 40 }),
    )
    expect(recognizerState(released.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe('failed')
    expect(recognizerState(released.session!, PRESS_RECOGNIZER_ID).state).toBe('recognized')
  })

  it('claims 15 through 40 degree paths at 10 points and rejects a 50 degree control', () => {
    const arena = createExistingCompetitorArena(bounds)
    for (const angle of [15, 22, 30, 40]) {
      const radians = (angle * Math.PI) / 180
      const result = reduceGestureArena(
        arena,
        start(arena, 100, 300),
        pointer('move', 110, 300 + Math.tan(radians) * 10, { time: 16 }),
      )
      expect(
        recognizerState(result.session!, INTERACTIVE_POP_RECOGNIZER_ID).state,
        `${angle} degrees`,
      ).toBe('recognized')
    }

    const verticalControl = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 110, 300 + Math.tan((50 * Math.PI) / 180) * 10, { time: 16 }),
    )
    expect(recognizerState(verticalControl.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe(
      'failed',
    )
  })

  it('owns horizontal intent at 10 points but keeps motion hidden until 30 points', () => {
    const arena = createExistingCompetitorArena(bounds)
    const claimed = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 110, 300, { time: 16 }),
    )
    expect(interactivePopVisualProgress(claimed.session!, 402)).toBe(0)

    const hidden = reduceGestureArena(
      arena,
      claimed.session,
      pointer('move', 129, 300, { time: 32 }),
    )
    expect(interactivePopVisualProgress(hidden.session!, 402)).toBe(0)

    const visible = reduceGestureArena(
      arena,
      hidden.session,
      pointer('move', 130, 300, { time: 48 }),
    )
    expect(interactivePopVisualProgress(visible.session!, 402)).toBe(30 / 402)
  })

  it('preserves the measured position and average-velocity release brackets', () => {
    const arena = createExistingCompetitorArena(bounds)
    const claimedForPosition = reduceGestureArena(
      arena,
      start(arena, 0, 300),
      pointer('move', 10, 300, { time: 20 }),
    )
    const positionComplete = reduceGestureArena(
      arena,
      claimedForPosition.session,
      pointer('end', 402 * 0.55, 300, { time: 1_000 }),
    )
    expect(interactivePopReleaseTarget(positionComplete.session!, 402)).toBe('complete')

    const claimedForVelocity = reduceGestureArena(
      arena,
      start(arena, 0, 300),
      pointer('move', 10, 300, { time: 20 }),
    )
    const velocityComplete = reduceGestureArena(
      arena,
      claimedForVelocity.session,
      pointer('end', 31.7, 300, { time: 100 }),
    )
    expect(interactivePopReleaseTarget(velocityComplete.session!, 402)).toBe('complete')

    const claimedForCancel = reduceGestureArena(
      arena,
      start(arena, 0, 300),
      pointer('move', 10, 300, { time: 20 }),
    )
    const canceled = reduceGestureArena(
      arena,
      claimedForCancel.session,
      pointer('end', 31.6, 300, { time: 100 }),
    )
    expect(interactivePopReleaseTarget(canceled.session!, 402)).toBe('cancel')
  })

  it('cedes a vertical sequence to native scroll only after observing its win', () => {
    const arena = createExistingCompetitorArena(bounds)
    const vertical = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 106, 312, { time: 16 }),
    )
    expect(recognizerState(vertical.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe('failed')
    expect(recognizerState(vertical.session!, PRESS_RECOGNIZER_ID).state).toBe('possible')
    expect(recognizerState(vertical.session!, NATIVE_SCROLL_RECOGNIZER_ID).state).toBe('possible')

    const nativeWon = reduceGestureArena(arena, vertical.session, {
      kind: 'external-recognition',
      pointerId: 7,
      recognizerId: NATIVE_SCROLL_RECOGNIZER_ID,
      time: 20,
    })
    expect(recognizerState(nativeWon.session!, NATIVE_SCROLL_RECOGNIZER_ID).state).toBe(
      'recognized',
    )
    expect(recognizerState(nativeWon.session!, PRESS_RECOGNIZER_ID)).toMatchObject({
      previewActive: false,
      state: 'canceled',
    })
  })

  it('lets an observed native win override an earlier JavaScript prediction', () => {
    const arena = createExistingCompetitorArena(bounds)
    const locallyClaimed = reduceGestureArena(
      arena,
      start(arena, 100, 300),
      pointer('move', 110, 302, { time: 16 }),
    )
    expect(recognizerState(locallyClaimed.session!, NATIVE_SCROLL_RECOGNIZER_ID).state).toBe(
      'possible',
    )

    const webKitWon = reduceGestureArena(arena, locallyClaimed.session, {
      kind: 'external-recognition',
      pointerId: 7,
      recognizerId: NATIVE_SCROLL_RECOGNIZER_ID,
      time: 20,
    })
    expect(recognizerState(webKitWon.session!, NATIVE_SCROLL_RECOGNIZER_ID).state).toBe(
      'recognized',
    )
    expect(recognizerState(webKitWon.session!, INTERACTIVE_POP_RECOGNIZER_ID).state).toBe(
      'canceled',
    )
  })
})
