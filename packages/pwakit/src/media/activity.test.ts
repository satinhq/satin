// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createMediaStore } from './controller.ts'

class Audio extends EventTarget {
  src = ''
  currentSrc = ''
  readyState = 0
  paused = true
  ended = false
  seeking = false
  currentTime = 0
  duration = 30
  playbackRate = 1
  error: { code: number } | null = null
  seekable = { length: 1, start: () => 0, end: () => 30 }
  resolvePlay = () => {}
  play() {
    return new Promise<void>(resolve => {
      this.resolvePlay = resolve
    })
  }
  pause() {
    this.paused = true
    this.emit('pause')
  }
  removeAttribute() {
    this.src = ''
  }
  load() {
    this.currentSrc = ''
    this.readyState = 0
    this.emit('emptied')
    this.emit('loadstart')
  }
  emit(name: string) {
    this.dispatchEvent(new Event(name))
  }
  ready() {
    this.currentSrc = this.src
    this.readyState = 4
    this.emit('loadedmetadata')
  }
}
afterEach(() => vi.useRealTimers())

it('never releases hidden-update protection in an ended/load/buffering handoff window', async () => {
  vi.useFakeTimers()
  const audio = new Audio()
  const activity = vi.fn()
  const store = createMediaStore(() => audio as unknown as HTMLAudioElement, activity)
  await store.controller.replaceQueue([
    { entryId: 'a', mediaId: 'a', src: 'https://example.test/a.mp3' },
    { entryId: 'b', mediaId: 'b', src: 'https://example.test/b.mp3' },
  ])
  audio.ready()
  const play = store.controller.play()
  audio.paused = false
  audio.emit('playing')
  audio.resolvePlay()
  await play
  audio.ended = true
  audio.paused = true
  audio.emit('ended')
  expect(store.getSnapshot().currentEntryId).toBe('b')
  // A resolved play request is not proof that the new resource has started.
  // Deliver a late ended observation before its first playing observation.
  audio.ready()
  audio.resolvePlay()
  await Promise.resolve()
  audio.emit('waiting')
  await vi.advanceTimersByTimeAsync(5000)
  expect(activity.mock.calls).toEqual([[true]])
  expect(store.getSnapshot().playIntent).toBe(true)
  audio.ended = false
  audio.paused = false
  audio.emit('playing')
  expect(store.getSnapshot().status).toBe('playing')
  store.controller.pause()
  expect(activity.mock.calls).toEqual([[true]])
  await vi.advanceTimersByTimeAsync(1000)
  expect(activity.mock.calls).toEqual([[true], [false]])
  store.dispose()
})

it('cancels a pending safety release when playback resumes and releases stop/error after settling', async () => {
  vi.useFakeTimers()
  const audio = new Audio()
  const activity = vi.fn()
  const store = createMediaStore(() => audio as unknown as HTMLAudioElement, activity)
  await store.controller.replaceQueue([
    { entryId: 'a', mediaId: 'a', src: 'https://example.test/a.mp3' },
  ])
  void store.controller.play()
  store.controller.pause()
  await vi.advanceTimersByTimeAsync(500)
  void store.controller.play()
  await vi.advanceTimersByTimeAsync(1500)
  expect(activity.mock.calls).toEqual([[true]])
  store.controller.stop()
  await vi.advanceTimersByTimeAsync(1000)
  expect(activity.mock.calls).toEqual([[true], [false]])
  void store.controller.play()
  audio.ready()
  audio.error = { code: 3 }
  audio.emit('error')
  await vi.advanceTimersByTimeAsync(1000)
  expect(activity.mock.calls).toEqual([[true], [false], [true], [false]])
  store.dispose()
})
