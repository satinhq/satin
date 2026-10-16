// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SampledMotion } from './sampledMotion.ts'

afterEach(() => vi.restoreAllMocks())

function fixture() {
  const element = document.createElement('div')
  const animations: Animation[] = []
  element.animate = vi.fn(() => {
    const animation = {
      cancel: vi.fn(),
      startTime: null,
      currentTime: 0,
      playState: 'running',
      pending: false,
    } as unknown as Animation
    animations.push(animation)
    return animation
  })
  vi.spyOn(performance, 'now').mockReturnValue(100)
  return { element, animations, motion: new SampledMotion() }
}

describe('menu sampled motion lifecycle', () => {
  it('replaces only the named motion so a reversal cannot compete with its preceding animation', () => {
    const { element, animations, motion } = fixture()
    try {
      motion.play('opening', element, [{ opacity: 0 }, { opacity: 1 }], 200, 10)
      motion.play(
        'position',
        element,
        [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }],
        200,
        10,
      )
      motion.play('opening', element, [{ opacity: 1 }, { opacity: 0 }], 200, 50)
      expect(animations[0]!.cancel).toHaveBeenCalledOnce()
      expect(animations[1]!.cancel).not.toHaveBeenCalled()
      expect(animations[2]!.cancel).not.toHaveBeenCalled()
      expect(
        motion.report().animations.map(animation => [animation.name, animation.startTime]),
      ).toEqual([
        ['opening', 50],
        ['position', 10],
      ])
    } finally {
      motion.dispose()
    }
  })

  it('cancels every active effect on disposal and allows the same constant to be submitted again', () => {
    const { element, animations, motion } = fixture()
    motion.play('opacity', element, [{ opacity: 1 }, { opacity: 1 }], 100, 0)
    motion.play(
      'position',
      element,
      [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }],
      100,
      0,
    )
    motion.dispose()
    expect(animations[0]!.cancel).toHaveBeenCalledOnce()
    expect(animations[1]!.cancel).toHaveBeenCalledOnce()
    expect(motion.report().animations).toEqual([])
    motion.dispose()
    expect(animations[0]!.cancel).toHaveBeenCalledOnce()
    motion.play('opacity', element, [{ opacity: 1 }, { opacity: 1 }], 100, 100)
    expect(element.animate).toHaveBeenCalledTimes(3)
    motion.dispose()
    expect(animations[2]!.cancel).toHaveBeenCalledOnce()
  })

  it('rejects custom-property motion without cancelling a valid effect or submitting another', () => {
    const { element, animations, motion } = fixture()
    try {
      motion.play('opening', element, [{ opacity: 0 }, { opacity: 1 }], 100, 0)
      expect(() =>
        motion.play('opening', element, [{ '--progress': '0' }, { '--progress': '1' }], 100, 0),
      ).toThrow('concrete CSS properties')
      expect(element.animate).toHaveBeenCalledOnce()
      expect(animations[0]!.cancel).not.toHaveBeenCalled()
      expect(motion.report().animations).toHaveLength(1)
    } finally {
      motion.dispose()
    }
  })
})
