import { resolveInteractivePopDirectionLock } from './interactivePop.ts'

/** Installed-only architecture experiment. No application navigation is
 * replaced. The nested vertical surface uses the production ScrollSurface
 * policy, including scroll-chain containment.
 */
export function createNativeScrubExperiment(record: (value: unknown) => void) {
  const root = document.createElement('section')
  root.hidden = true
  root.setAttribute('data-satin-motion-probe', 'true')
  Object.assign(root.style, {
    position: 'fixed',
    top: '180px',
    left: '60px',
    width: '280px',
    background: '#17212e',
    color: 'white',
    zIndex: '20000',
    padding: '8px',
  })
  const label = document.createElement('p')
  label.textContent =
    'Nested native scrub experiment: drag right across the striped surface. Then try 40° and 50° diagonals. Reports retain native scroll and touch coordinates.'
  const select = document.createElement('select')
  for (const value of ['nested-contained', 'nested-chain', 'horizontal-only', 'claim-at-10']) {
    const option = document.createElement('option')
    option.value = option.textContent = value
    select.append(option)
  }
  const x = document.createElement('div'),
    track = document.createElement('div'),
    y = document.createElement('div'),
    content = document.createElement('div')
  Object.assign(x.style, {
    position: 'relative',
    width: '280px',
    height: '160px',
    overflowX: 'scroll',
    overflowY: 'hidden',
    touchAction: 'pan-y pan-right pinch-zoom',
    overscrollBehaviorX: 'contain',
    background: '#345',
  })
  Object.assign(track.style, { width: '840px', height: '160px', position: 'relative' })
  Object.assign(y.style, {
    position: 'absolute',
    left: '280px',
    width: '280px',
    height: '160px',
    overflowY: 'auto',
    overflowX: 'hidden',
    touchAction: 'pan-y pan-right pinch-zoom',
    overscrollBehavior: 'contain',
  })
  Object.assign(content.style, {
    width: '280px',
    height: '600px',
    background: 'repeating-linear-gradient(0deg,#345 0px,#345 39px,#fff 40px,#345 41px)',
  })
  content.textContent = 'Native vertical content'
  y.setAttribute('data-satin-scroll', 'native-scrub-experiment')
  const button = document.createElement('button')
  button.textContent = 'Press target'
  content.append(button)
  y.append(content)
  track.append(y)
  x.append(track)
  const dot = document.createElement('div')
  Object.assign(dot.style, { width: '8px', height: '8px', background: '#ffbd42', marginTop: '4px' })
  let animation: Animation | undefined
  const reset = () => {
    y.style.overflow = select.value === 'horizontal-only' ? 'visible' : ''
    if (select.value !== 'horizontal-only') {
      y.style.overflowY = 'auto'
      y.style.overflowX = 'hidden'
    }
    content.style.height = select.value === 'horizontal-only' ? '160px' : '600px'
    y.style.overscrollBehavior = select.value === 'nested-chain' ? 'auto' : 'contain'
    x.scrollLeft = 280
    y.scrollTop = 200
    animation?.cancel()
    const Timeline = (
      window as unknown as {
        ScrollTimeline?: new (options: { source: Element; axis: string }) => AnimationTimeline
      }
    ).ScrollTimeline
    if (Timeline)
      animation = dot.animate(
        [{ transform: 'translateX(280px)' }, { transform: 'translateX(-280px)' }],
        { timeline: new Timeline({ source: x, axis: 'x' }), fill: 'both' },
      )
  }
  const events: unknown[] = []
  let startX = 0,
    startY = 0,
    claimed = false
  const sample = (type: string, touch?: Touch) => {
    const dx = touch ? touch.clientX - startX : undefined,
      dy = touch ? touch.clientY - startY : undefined
    events.push({
      type,
      at: performance.now(),
      x: x.scrollLeft,
      y: y.scrollTop,
      dx,
      dy,
      lock: dx === undefined ? undefined : resolveInteractivePopDirectionLock(dx, dy!),
      claimed,
    })
    if (events.length > 600) events.shift()
  }
  x.addEventListener(
    'touchstart',
    event => {
      events.length = 0
      claimed = false
      startX = event.touches[0]!.clientX
      startY = event.touches[0]!.clientY
      sample('touchstart', event.touches[0])
    },
    { passive: true },
  )
  x.addEventListener(
    'touchmove',
    event => {
      const t = event.touches[0]!
      if (
        select.value === 'claim-at-10' &&
        resolveInteractivePopDirectionLock(t.clientX - startX, t.clientY - startY) ===
          'claim-horizontal'
      )
        claimed = true
      if (claimed && event.cancelable) event.preventDefault()
      sample('touchmove', t)
    },
    { passive: false },
  )
  for (const type of ['touchend', 'touchcancel'])
    x.addEventListener(
      type,
      event => {
        sample(type, (event as TouchEvent).changedTouches[0])
        setTimeout(() => {
          record({
            kind: 'nested-native-scrub',
            mode: select.value,
            timeline: Boolean(animation),
            events: [...events],
          })
          reset()
        }, 700)
      },
      { passive: true },
    )
  for (const type of ['pointercancel', 'pointerup', 'click'])
    button.addEventListener(type, () => sample(type))
  x.addEventListener('scroll', () => sample('scroll-x'), { passive: true })
  y.addEventListener('scroll', () => sample('scroll-y'), { passive: true })
  select.onchange = reset
  const resetButton = document.createElement('button')
  resetButton.textContent = 'Reset native scrub'
  resetButton.onclick = reset
  root.append(label, select, resetButton, x, dot)
  const close = document.createElement('button')
  close.textContent = 'Close native scrub'
  close.onclick = () => {
    root.hidden = true
  }
  root.append(close)
  const launcher = document.createElement('button')
  launcher.textContent = 'Open nested scrub experiment'
  launcher.onclick = () => {
    root.hidden = false
    reset()
  }
  const controls = document.createElement('div')
  controls.append(launcher, root)
  return controls
}
