import { afterEach, expect, it, vi } from 'vitest'
import recording from './ownerRelease.fixture.json'
import { createReleaseVelocityTracker } from './releaseVelocity.ts'
import { createAnimatedTransitionController } from './motion.ts'

/** A native scrub source fake with its original horizontal overflow policy. */
function scrubSourceFake() {
  const attributes = new Map<string, string>()
  return {
    style: { overflowX: 'scroll' },
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  }
}
/** Before reset or after restoration, the original overflow policy is intact. */
function expectRetired(source: HTMLElement, retired: boolean) {
  expect(source.getAttribute('data-satin-scrub-retired')).toBe(retired ? 'true' : null)
  expect(source.style.overflowX).toBe('scroll')
}

afterEach(() => vi.unstubAllGlobals())

it.each(
  recording.cases.flatMap(trace =>
    ['none', 'pending', 'playing'].map(rearm => ({ ...trace, rearm })),
  ),
)(
  'replays owner touch samples through the scroll/release handoff at $handoffAt, next gesture $rearm',
  trace => {
    const velocity = createReleaseVelocityTracker()
    for (const sample of trace.touchSamples) {
      if (sample.type === 'touchend') continue
      velocity.record(sample.x, sample.at)
    }
    const deliveredVelocity = velocity.release(trace.touchSamples.at(-1)!.at)
    expect(deliveredVelocity).toBeCloseTo(trace.fingerVelocity, 8)
    // Before: every complete owner handoff applied exactly this extra gain.
    expect(trace.oldAmplifiedVelocity / deliveredVelocity).toBeCloseTo(4.25, 10)

    let now = trace.handoffAt
    const callbacks: FrameRequestCallback[] = []
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('document', { timeline: {} })
    vi.stubGlobal('window', {
      ScrollTimeline: class {},
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callbacks.push(callback)
        return callbacks.length
      },
      cancelAnimationFrame: (id: number) => {
        callbacks.splice(id - 1, 1)
      },
    })
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m41 = trace.from * recording.width
      },
    )
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1,0,0,1,0,0)' }))
    const tracks: {
      frames: Keyframe[]
      options: KeyframeAnimationOptions
      animation: Animation
    }[] = []
    const elements = Array.from(
      { length: 5 },
      () =>
        ({
          style: { removeProperty: vi.fn() },
          animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => {
            const animation = {
              cancel: vi.fn(),
              effect: {},
              onfinish: null,
              startTime: null,
            } as unknown as Animation
            tracks.push({ frames, options, animation })
            return animation
          },
        }) as unknown as HTMLElement,
    )
    const finish = vi.fn()
    const controller = createAnimatedTransitionController(
      { finish, cancel: vi.fn() },
      { interactive: true, operation: 'pop' },
    )
    controller.bind!({
      direction: 'pop',
      width: recording.width,
      primary: elements[0]!,
      primaryTitle: elements[1],
      secondary: elements[2],
      secondaryTitle: elements[3],
      secondaryDim: elements[4],
    })
    const source = {
      ...scrubSourceFake(),
      scrollLeft: trace.source.x,
      clientWidth: recording.width,
      scrollWidth: recording.width * 5,
    } as HTMLElement
    controller.scrubFromScroll!(source, trace.source.origin, trace.source.adjustment)
    tracks.splice(0)
    // The owner's iPhone delivers the lift about 21 ms after it happened.
    const liftAt = now - 21
    controller.resolveInteractive!(
      deliveredVelocity,
      trace.raw,
      false,
      {
        averageVelocity: deliveredVelocity / recording.width,
        averageAcceleration: 0,
        edgeFlick: true,
      },
      liftAt,
    )
    // The release hands off in the touchend task: every track transfers on one document epoch
    // with no reconciliation frame between the lift and the release. Retirement stops
    // native momentum across a rendering update before the next contact.
    expect(tracks).toHaveLength(5)
    expect(elements[0]!.style.transform).toBe(`translate3d(${trace.from * 100}%, 0, 0)`)
    expect(Number(elements[4]!.style.opacity)).toBeCloseTo(0.1 * (1 - trace.from))
    expect(source.scrollLeft).toBe(trace.source.origin)
    expectRetired(source, true)
    if (trace.rearm !== 'none') controller.prepareForNextGesture!()
    callbacks.shift()!(now + 8)
    callbacks.shift()!(now + 24)
    expectRetired(source, false)
    source.style.overflowX = 'auto' // Next gesture owns the shared source now.
    const front = tracks[0]!
    const duration = Number(front.options.duration)
    const x = (frame: Keyframe) =>
      (parseFloat(String(frame.transform).slice('translate3d('.length)) * recording.width) / 100
    expect(duration).toBeCloseTo(trace.settleMs, 8)
    expect(duration).toBeLessThan(trace.nextTouchAfterMs)
    expect(Math.max(...front.frames.map(x))).toBeCloseTo(recording.width, 9)
    expect(x(front.frames[0]!)).toBeCloseTo(trace.from * recording.width, 8)
    const first = front.frames[1]!
    expect(
      (x(first) - x(front.frames[0]!)) / ((Number(first.offset) * duration) / 1000),
    ).toBeCloseTo(deliveredVelocity, 6)
    for (const expected of trace.firstSteps) {
      const offset = Math.min(1, expected.atMs / duration)
      const hi = front.frames.findIndex(frame => Number(frame.offset) >= offset)
      const right = front.frames[hi]!,
        left = front.frames[Math.max(0, hi - 1)]!
      const fraction = (offset - Number(left.offset)) / (Number(right.offset) - Number(left.offset))
      const actual = hi === 0 ? x(right) : x(left) + (x(right) - x(left)) * fraction
      // Independent analytic reference versus 240 Hz compositor interpolation.
      expect(Math.abs(actual - expected.x)).toBeLessThan(0.25)
    }
    for (const track of tracks) {
      expect(track.animation.startTime).toBe(now)
      expect(track.options.duration).toBe(duration)
      expect(track.frames.map(frame => frame.offset)).toEqual(
        front.frames.map(frame => frame.offset),
      )
    }
    expect(finish).not.toHaveBeenCalled()
    now += duration
    front.animation.onfinish?.call(front.animation, {} as AnimationPlaybackEvent)
    expect(finish).toHaveBeenCalledOnce()
    expect(controller.progress).toBe(1)
    expect(source.style.overflowX).toBe('auto')
    expect(tracks.every(track => vi.mocked(track.animation.cancel).mock.calls.length === 1)).toBe(
      true,
    )
  },
)
