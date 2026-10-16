import { createNativeScrubExperiment } from './navigation/nativeScrubExperiment.ts'
/** Opt-in diagnostics, including an explicitly enabled native navigation experiment. */
export function createMotionOwnershipControls(record: (result: unknown) => void) {
  const section = document.createElement('section')
  const title = document.createElement('p')
  title.textContent =
    'Ownership control: play, then compare the three dots during a deliberate 300 ms main-thread block. This is excluded from gesture costs.'
  const play = document.createElement('button')
  play.textContent = 'Run ownership control'
  const rows = ['Document WAAPI', 'rAF transform', 'rAF WAAPI seek'].map(label => {
    const row = document.createElement('div'),
      dot = document.createElement('span')
    row.textContent = label
    Object.assign(row.style, { height: '30px', position: 'relative', width: '250px' })
    Object.assign(dot.style, {
      position: 'absolute',
      left: '0',
      bottom: '0',
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#61dcff',
    })
    row.append(dot)
    return { row, dot }
  })
  play.onclick = () => {
    if (play.disabled) return
    play.disabled = true
    const start = performance.now(),
      samples: number[] = []
    const keys = [{ transform: 'translateX(0px)' }, { transform: 'translateX(240px)' }]
    const auto = rows[0]!.dot.animate(keys, { duration: 1000, fill: 'both', easing: 'linear' })
    const seek = rows[2]!.dot.animate(keys, { duration: 1000, fill: 'both', easing: 'linear' })
    seek.pause()
    seek.currentTime = 0
    const tick = (now: number) => {
      const elapsed = Math.min(1000, now - start)
      samples.push(now)
      rows[1]!.dot.style.transform = `translateX(${elapsed * 0.24}px)`
      seek.currentTime = elapsed
      if (elapsed < 1000) requestAnimationFrame(tick)
      else {
        record({
          kind: 'ownership-block',
          start,
          end: performance.now(),
          samples,
          deliberateBlockMs: 300,
          interpretation:
            'Compare recorded motion. Seeking a paused WAAPI animation still needs every JS update.',
        })
        auto.cancel()
        seek.cancel()
        play.disabled = false
      }
    }
    requestAnimationFrame(tick)
    setTimeout(() => {
      const until = performance.now() + 300
      while (performance.now() < until) {
        /* controlled stall */
      }
    }, 250)
  }
  section.append(title, play, ...rows.map(r => r.row))
  const prompt = document.createElement('p')
  prompt.textContent =
    'Drag each strip right from its centre. First preserves Navigator touch-action; second permits native horizontal scroll. Native scroll may cancel the pointer stream.'
  section.append(prompt)
  for (const policy of ['pan-y pan-right pinch-zoom', 'pan-x']) {
    const scroller = document.createElement('div'),
      content = document.createElement('div')
    Object.assign(scroller.style, {
      width: '250px',
      height: '48px',
      overflowX: 'scroll',
      touchAction: policy,
      background: '#345',
      marginTop: '8px',
    })
    Object.assign(content.style, {
      width: '750px',
      height: '48px',
      background: 'repeating-linear-gradient(90deg,#345 0px,#345 49px,#fff 50px,#345 51px)',
    })
    scroller.setAttribute('data-satin-ownership-scroll', 'true')
    content.textContent = policy
    scroller.append(content)
    section.append(scroller)
    const events: { type: string; at: number; scroll: number }[] = []
    for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup', 'scroll'])
      scroller.addEventListener(
        type,
        () => {
          events.push({ type, at: performance.now(), scroll: scroller.scrollLeft })
          if (events.length > 300) events.shift()
          if (type === 'pointerup' || type === 'pointercancel')
            setTimeout(
              () =>
                record({
                  kind: 'native-scroll-arbitration',
                  policy,
                  scroll: scroller.scrollLeft,
                  events: [...events],
                }),
              500,
            )
        },
        { passive: true },
      )
    requestAnimationFrame(() => {
      scroller.scrollLeft = 300
    })
  }
  section.prepend(createNativeScrubExperiment(record))
  if ('ScrollTimeline' in window) {
    const block = document.createElement('button')
    block.textContent = 'Block next native scrub'
    block.onclick = () => {
      sessionStorage.setItem('satin:probe-native-block', '1')
      block.textContent = 'Block armed'
    }
    section.prepend(block)
  }
  return section
}
