// @vitest-environment happy-dom
import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useRefreshAction } from './refreshable.ts'
import { RefreshControl } from './RefreshControl.tsx'

it('holds refresh until the action settles and blocks a second pull and a dismissed result', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  let finish!: () => void
  let signal!: AbortSignal
  let active = true
  let request = 0
  function Screen() {
    const [value, setValue] = useState('Original')
    const refresh = useRefreshAction(async (currentSignal, commit) => {
      signal = currentSignal
      const version = ++request
      await new Promise<void>(resolve => {
        finish = resolve
      })
      commit(() => setValue(`Updated ${version}`))
    }, active)
    return (
      <>
        <button onClick={refresh.run}>Refresh</button>
        <span>{value}</span>
        {refresh.running && <div role="progressbar" aria-label="Refreshing" />}
      </>
    )
  }
  try {
    act(() => root.render(<Screen />))
    act(() => element.querySelector('button')!.click())
    const firstFinish = finish
    act(() => element.querySelector('button')!.click())
    expect(finish).toBe(firstFinish)
    expect(element.querySelector('[role="progressbar"]')).not.toBeNull()
    await act(async () => finish())
    expect(element.textContent).toContain('Updated 1')
    expect(element.querySelector('[role="progressbar"]')).toBeNull()
    act(() => element.querySelector('button')!.click())
    active = false
    act(() => root.render(<Screen />))
    expect(signal.aborted).toBe(true)
    await act(async () => finish())
    expect(element.textContent).toContain('Updated 1')
    expect(element.querySelector('[role="progressbar"]')).toBeNull()
  } finally {
    act(() => root.unmount())
    element.remove()
  }
})

it('does not refresh on a tap after a cancelled threshold-crossing pull', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const element = document.createElement('div')
  document.body.append(element)
  const root = createRoot(element)
  function Screen() {
    const surface = useRef<HTMLDivElement>(null)
    const content = useRef<HTMLDivElement>(null)
    const [refreshes, setRefreshes] = useState(0)
    return (
      <div ref={surface}>
        <RefreshControl
          surface={surface}
          content={content}
          action={async () => {
            setRefreshes(value => value + 1)
            await new Promise<void>(() => {})
          }}
        />
        <div ref={content}>
          <span>Refreshes: {refreshes}</span>
        </div>
      </div>
    )
  }
  try {
    act(() => root.render(<Screen />))
    const surface = element.firstElementChild as HTMLDivElement
    const start = () => {
      const event = new Event('touchstart')
      Object.defineProperty(event, 'touches', { value: [{}] })
      surface.dispatchEvent(event)
    }
    act(() => {
      start()
      surface.scrollTop = -350
      surface.dispatchEvent(new Event('scroll'))
      expect(surface.querySelector('svg')!.style.opacity).toBe('1')
      surface.dispatchEvent(new Event('touchcancel'))
      surface.scrollTop = 0
      start()
      surface.dispatchEvent(new Event('touchend'))
    })
    expect(element.textContent).toBe('Refreshes: 0')
  } finally {
    act(() => root.unmount())
    element.remove()
  }
})

it('commits the refresh spacer once and gives only the content transform to WAAPI', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let finishTask!: () => void
  const cancel = vi.fn()
  const animate = vi.spyOn(HTMLElement.prototype, 'animate').mockReturnValue({
    cancel,
    finished: new Promise(() => {}),
  } as unknown as Animation)
  function Probe() {
    const surface = useRef<HTMLDivElement>(null)
    const content = useRef<HTMLDivElement>(null)
    return (
      <div ref={surface}>
        <RefreshControl
          surface={surface}
          content={content}
          action={async () => {
            await new Promise<void>(resolve => {
              finishTask = resolve
            })
          }}
        />
        <div ref={content} data-content="true">
          Content
        </div>
      </div>
    )
  }
  try {
    act(() => root.render(<Probe />))
    const surface = host.firstElementChild as HTMLDivElement
    const spacer = surface.firstElementChild as HTMLDivElement
    const content = surface.querySelector<HTMLElement>('[data-content]')!
    vi.spyOn(content, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: Number.parseFloat(spacer.style.height),
        }) as DOMRect,
    )
    act(() => {
      const start = new Event('touchstart')
      Object.defineProperty(start, 'touches', { value: [{}] })
      surface.dispatchEvent(start)
      surface.scrollTop = -350
      surface.dispatchEvent(new Event('scroll'))
      surface.dispatchEvent(new Event('touchend'))
    })
    expect(spacer.style.height).toBe('60px')
    await act(async () => finishTask())
    expect(spacer.style.height).toBe('0px')
    expect(animate).toHaveBeenCalledOnce()
    expect(animate.mock.instances[0]).toBe(content)
    const keyframes = animate.mock.calls[0]![0] as Keyframe[]
    expect(keyframes[0]!.transform).toBe('translateY(60px)')
    expect(keyframes.at(-1)!.transform).toBe('translateY(0px)')
    expect(keyframes.every(frame => Object.keys(frame).sort().join() === 'offset,transform')).toBe(
      true,
    )
  } finally {
    act(() => root.unmount())
    expect(cancel).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
    host.remove()
  }
})
