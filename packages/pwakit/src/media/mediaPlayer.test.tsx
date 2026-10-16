// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useMediaPlayer, type MediaPlayer, type MediaQueueEntry } from '../index.ts'
import { MediaPlayerRoot } from './react.tsx'

// Behavioral transport: commands request work, the test independently delivers observations.
class Transport extends EventTarget {
  src = ''
  currentSrc = ''
  readyState = 0
  paused = true
  ended = false
  seeking = false
  currentTime = 0
  duration = NaN
  playbackRate = 1
  preload = ''
  error: { code: number } | null = null
  seekable = { length: 1, start: () => 0, end: () => 120 }
  plays: { resolve: () => void; reject: (error: Error) => void }[] = []
  load() {
    this.currentSrc = ''
    this.readyState = 0
    this.ended = false
    this.currentTime = 0
  }
  removeAttribute() {
    this.src = ''
  }
  pause() {
    this.paused = true
    this.emit('pause')
  }
  play() {
    return new Promise<void>((resolve, reject) => this.plays.push({ resolve, reject }))
  }
  ready() {
    this.currentSrc = this.src
    this.readyState = 4
    this.duration = 120
    this.emit('loadedmetadata')
  }
  playing() {
    this.paused = false
    this.emit('playing')
    this.plays.at(-1)!.resolve()
  }
  emit(name: string) {
    this.dispatchEvent(new Event(name))
  }
}
let root: Root | undefined
let transport: Transport
const views = new Map<string, MediaPlayer>()
function View({ name }: { name: string }) {
  const player = useMediaPlayer()
  views.set(name, player)
  return (
    <output>
      {name}:{player.state.currentEntryId}:{player.state.status}:{player.state.position}
    </output>
  )
}
async function mount() {
  transport = new Transport()
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) =>
    tag === 'audio'
      ? (transport as unknown as HTMLAudioElement)
      : create(tag, options)) as typeof document.createElement)
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root!.render(
      <StrictMode>
        <MediaPlayerRoot>
          <View name="mini" />
          <View name="full" />
        </MediaPlayerRoot>
      </StrictMode>,
    ),
  )
  return views.get('mini')!.controller
}
const entries: readonly MediaQueueEntry[] = [
  { entryId: 'a', mediaId: 'song', src: 'https://example.test/a.mp3' },
  { entryId: 'b', mediaId: 'other', src: 'https://example.test/b.mp3' },
  { entryId: 'a-again', mediaId: 'song', src: 'https://example.test/a.mp3' },
]
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  views.clear()
  document.body.replaceChildren()
})

it('shares observed playback between views and retains the root queue when Now Playing closes', async () => {
  const controller = await mount()
  expect(transport.src).toBe('')
  await act(async () => {
    await controller.replaceQueue(entries)
    transport.ready()
  })
  let play!: ReturnType<typeof controller.play>
  await act(async () => {
    play = controller.play()
    transport.playing()
    await play
  })
  expect(views.get('mini')!.state).toBe(views.get('full')!.state)
  expect(views.get('full')!.state.status).toBe('playing')
  const snapshot = views.get('mini')!.state
  await act(async () => transport.emit('timeupdate'))
  expect(views.get('mini')!.state).toBe(snapshot)
  await act(async () =>
    root!.render(
      <StrictMode>
        <MediaPlayerRoot>
          <View name="mini" />
        </MediaPlayerRoot>
      </StrictMode>,
    ),
  )
  expect(views.get('mini')!.controller).toBe(controller)
  expect(transport.paused).toBe(false)
  await act(async () => {
    transport.currentTime = 42
    transport.emit('timeupdate')
  })
  expect(document.body.textContent).toContain('mini:a:playing:42')
  await act(async () => root!.unmount())
  root = undefined
  expect(transport.paused).toBe(true)
  expect(controller.pause().status).toBe('unavailable')
})

it('cancels A/B play requests on replacement and pause without publishing a late rejection or event', async () => {
  const controller = await mount()
  let first!: ReturnType<typeof controller.play>
  let second!: ReturnType<typeof controller.play>
  await act(async () => {
    await controller.replaceQueue(entries)
    transport.ready()
    first = controller.play()
    second = controller.replaceQueue(entries, { currentEntryId: 'b', autoplay: true })
    transport.ready()
    controller.pause()
    transport.plays[0]!.reject(new Error('late A failure'))
    transport.plays[1]!.resolve()
    transport.emit('ended')
    transport.emit('playing')
  })
  expect((await first).status).toBe('cancelled')
  expect((await second).status).toBe('cancelled')
  expect(views.get('mini')!.state).toMatchObject({
    currentEntryId: 'b',
    status: 'paused',
    error: null,
  })
  await act(async () => {
    transport.paused = false
    transport.emit('playing')
  })
  expect(transport.paused).toBe(true)
  expect(views.get('mini')!.state.status).toBe('paused')
})

it('preserves duplicate entry identity through queue edits and cancels superseded seeks and source events', async () => {
  const controller = await mount()
  await act(async () => {
    await controller.replaceQueue(entries, { currentEntryId: 'a-again' })
    transport.ready()
  })
  await act(async () => {
    controller.move('a-again', 'a')
  })
  await act(async () => {
    await controller.replaceQueue(
      views.get('mini')!.state.queue.map(entry => ({ ...entry, metadata: { title: 'Edited' } })),
    )
  })
  expect(views.get('mini')!.state.currentEntryId).toBe('a-again')
  let first!: ReturnType<typeof controller.seek>
  let second!: ReturnType<typeof controller.seek>
  await act(async () => {
    transport.seeking = true
    first = controller.seek(25)
    second = controller.seek(60)
    transport.currentTime = 25
    transport.seeking = false
    transport.emit('seeked')
  })
  expect((await first).status).toBe('cancelled')
  await act(async () => {
    transport.currentTime = 60
    transport.emit('seeked')
    await second
  })
  expect((await second).status).toBe('completed')
  let replaced!: ReturnType<typeof controller.seek>
  await act(async () => {
    transport.seeking = true
    replaced = controller.seek(80)
    controller.remove('a-again')
    transport.currentSrc = entries[2]!.src
    transport.emit('ended')
  })
  expect((await replaced).status).toBe('cancelled')
  expect(views.get('mini')!.state).toMatchObject({
    currentEntryId: 'a',
    position: 0,
  })
  await act(async () => {
    transport.seeking = false
    transport.ready()
    controller.setShuffle(true)
  })
  const order = views.get('mini')!.state.playbackOrder
  await act(async () => controller.setShuffle(true))
  expect(views.get('mini')!.state.playbackOrder).toBe(order)
  await act(async () => {
    controller.setShuffle(false)
    controller.setRepeat('one')
    const play = controller.play()
    transport.playing()
    await play
  })
  await act(async () => {
    transport.ended = true
    transport.paused = true
    transport.emit('ended')
  })
  expect(views.get('mini')!.state.currentEntryId).toBe('a')
  await act(async () => {
    controller.pause()
    await controller.next()
    transport.ready()
  })
  expect(views.get('mini')!.state.currentEntryId).toBe('b')
  const beforeInvalid = views.get('mini')!.state
  await act(async () =>
    expect((await controller.replaceQueue([entries[0]!, entries[0]!])).status).toBe('failed'),
  )
  expect(views.get('mini')!.state).toBe(beforeInvalid)
  let revisionSeek!: ReturnType<typeof controller.seek>
  await act(async () => {
    transport.seeking = true
    revisionSeek = controller.seek(95)
    await controller.replaceQueue(
      entries.map(entry => ({ ...entry, sourceRevision: 2 })),
      { currentEntryId: 'b' },
    )
    transport.emit('seeked')
  })
  expect((await revisionSeek).status).toBe('cancelled')
  expect(views.get('mini')!.state.position).toBe(0)
  let failedSeek!: ReturnType<typeof controller.seek>
  await act(async () => {
    failedSeek = controller.seek(10)
    transport.error = { code: 4 }
    transport.emit('error')
  })
  expect(await failedSeek).toMatchObject({ status: 'failed', code: 'unsupported-source' })
  expect(views.get('mini')!.state.status).toBe('error')
})

it('keeps pause and seek intent ahead of late completion observations', async () => {
  const controller = await mount()
  await act(async () => {
    await controller.replaceQueue(entries)
    transport.ready()
    const play = controller.play()
    transport.playing()
    await play
    controller.pause()
    transport.currentTime = transport.duration
    transport.ended = true
    transport.emit('seeked')
    transport.emit('ended')
  })
  expect(views.get('mini')!.state).toMatchObject({ currentEntryId: 'a' })
  // A paused scrub completes without starting another queue entry.
  await act(async () => {
    transport.seeking = true
    const seek = controller.seek(120)
    transport.seeking = false
    transport.emit('seeked')
    expect((await seek).status).toBe('completed')
  })
  expect(views.get('mini')!.state).toMatchObject({
    currentEntryId: 'a',
  })
  // Resume from an interior position, then seek to the end while playing.
  await act(async () => {
    transport.ended = false
    await controller.seek(40)
    const play = controller.play()
    transport.playing()
    await play
    transport.seeking = true
    const seek = controller.seek(120)
    transport.seeking = false
    transport.emit('seeked')
    expect((await seek).status).toBe('completed')
    transport.emit('timeupdate')
    // ended can become observable after the seeked/timeupdate notifications.
    transport.ended = true
    transport.paused = true
    transport.emit('ended')
  })
  expect(views.get('mini')!.state).toMatchObject({
    currentEntryId: 'a',
    status: 'ended',
  })
  // Pause wins even if transport reached the end before its queued notification.
  await act(async () => {
    transport.ended = false
    await controller.seek(50)
    const play = controller.play()
    transport.playing()
    await play
    transport.currentTime = transport.duration
    transport.ended = true
    transport.paused = true
    controller.pause()
    transport.emit('timeupdate')
    transport.emit('ended')
  })
  expect(views.get('mini')!.state).toMatchObject({ currentEntryId: 'a' })
  await act(async () => {
    transport.ended = false
    await controller.seek(60)
    const play = controller.play()
    transport.playing()
    await play
    transport.currentTime = transport.duration
    transport.ended = true
    transport.paused = true
    transport.emit('pause')
    transport.emit('ended')
  })
  expect(views.get('mini')!.state).toMatchObject({ currentEntryId: 'b' })
})

it('completes each observed same-source repeat or replay cycle once', async () => {
  const controller = await mount()
  await act(async () => {
    await controller.replaceQueue([entries[0]!])
    transport.ready()
    controller.setRepeat('all')
    const play = controller.play()
    transport.playing()
    await play
  })
  for (let cycle = 0; cycle < 2; cycle++) {
    await act(async () => {
      transport.currentTime = transport.duration
      transport.paused = true
      transport.ended = true
      transport.emit('timeupdate')
      transport.emit('ended')
    })
    expect(transport.currentTime).toBe(0)
    expect(views.get('mini')!.state).toMatchObject({
      currentEntryId: 'a',
    })
    await act(async () => {
      // Rewind/play requests do not manufacture successful playback observations.
      transport.ended = false
      transport.playing()
    })
    expect(views.get('mini')!.state.status).toBe('playing')
    const snapshot = views.get('mini')!.state
    await act(async () => transport.emit('ended'))
    expect(views.get('mini')!.state).toBe(snapshot)
  }
  await act(async () => controller.setRepeat('off'))
  for (let cycle = 0; cycle < 2; cycle++) {
    await act(async () => {
      transport.currentTime = transport.duration
      transport.paused = true
      transport.ended = true
      transport.emit('ended')
    })
    expect(views.get('mini')!.state).toMatchObject({
      status: 'ended',
    })
    const completed = views.get('mini')!.state
    await act(async () => transport.emit('timeupdate'))
    expect(views.get('mini')!.state).toBe(completed)
    await act(async () => {
      const play = controller.play()
      expect(transport.currentTime).toBe(0)
      transport.ended = false
      transport.playing()
      expect((await play).status).toBe('completed')
    })
    expect(views.get('mini')!.state.status).toBe('playing')
  }
})

function systemMedia(unsupported?: MediaSessionAction) {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
  let position: MediaPositionState | undefined
  const session = {
    metadata: null as MediaMetadata | null,
    playbackState: 'none',
    setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
      if (action === unsupported) throw new Error('Unsupported action')
      handlers.set(action, handler)
    },
    setPositionState(value?: MediaPositionState) {
      position = value
    },
  }
  vi.stubGlobal(
    'MediaMetadata',
    class {
      constructor(value: MediaMetadataInit) {
        Object.assign(this, value)
      }
    },
  )
  vi.stubGlobal('navigator', { mediaSession: session })
  return { session, handlers, position: () => position }
}

it('routes system transport through the current queue and retires stale source handlers', async () => {
  const system = systemMedia()
  const controller = await mount()
  const queue = entries.map(entry => ({
    ...entry,
    metadata: { title: entry.entryId, artist: 'Artist', album: 'Album', artwork: '/art.png' },
  }))
  await act(async () => {
    await controller.replaceQueue(queue)
    transport.ready()
  })
  expect(system.session.metadata).toMatchObject({ title: 'a', artist: 'Artist', album: 'Album' })
  expect(system.session.metadata!.artwork[0]).toMatchObject({
    src: new URL('/art.png', document.baseURI).href,
  })
  const staleSeek = system.handlers.get('seekto')!
  await act(async () => {
    system.handlers.get('play')!({ action: 'play' })
    transport.playing()
  })
  expect(system.session.playbackState).toBe('playing')
  await act(async () => {
    system.handlers.get('nexttrack')!({ action: 'nexttrack' })
    transport.ready()
    transport.playing()
  })
  expect(views.get('mini')!.state.currentEntryId).toBe('b')
  expect(system.session.metadata!.title).toBe('b')
  await act(async () => {
    staleSeek({ action: 'seekto', seekTime: 90 })
    transport.emit('timeupdate')
  })
  expect(views.get('mini')!.state.position).toBe(0)
  await act(async () => {
    system.handlers.get('seekto')!({ action: 'seekto', seekTime: 42 })
    transport.emit('seeked')
  })
  expect(system.position()).toEqual({ duration: 120, position: 42, playbackRate: 1 })
  await act(async () => {
    transport.playbackRate = 1.5
    transport.emit('ratechange')
    system.handlers.get('pause')!({ action: 'pause' })
  })
  expect(system.session.playbackState).toBe('paused')
  expect(system.position()!.playbackRate).toBe(1.5)
  await act(async () => system.handlers.get('previoustrack')!({ action: 'previoustrack' }))
  await act(async () => transport.ready())
  expect(system.session.metadata!.title).toBe('a')
  expect(system.handlers.get('previoustrack')).toBeNull()
  expect(system.handlers.get('seekforward')).toBeNull()
  expect(system.handlers.get('seekbackward')).toBeNull()
  await act(async () => {
    await controller.replaceQueue([queue[0]!])
    transport.ready()
  })
  await act(async () => {
    system.handlers.get('seekforward')!({ action: 'seekforward', seekOffset: 10 })
    transport.emit('seeked')
    system.handlers.get('seekbackward')!({ action: 'seekbackward', seekOffset: 4 })
    transport.emit('seeked')
  })
  expect(views.get('mini')!.state.position).toBe(6)
  await act(async () => root!.unmount())
  root = undefined
  expect(system.session.metadata).toBeNull()
  expect([...system.handlers.values()].every(handler => handler === null)).toBe(true)
  expect(system.position()).toBeUndefined()
})

it('clears the previous system scrubber for unknown media while unsupported actions leave UI usable', async () => {
  const system = systemMedia('seekforward')
  const controller = await mount()
  await act(async () => {
    await controller.replaceQueue(entries)
    transport.ready()
  })
  expect(system.position()!.duration).toBe(120)
  await act(async () => {
    await controller.next()
    transport.ready()
    transport.duration = NaN
    transport.seekable = { length: 0, start: () => 0, end: () => 0 }
    transport.emit('durationchange')
  })
  expect(system.position()).toBeUndefined()
  expect(system.handlers.get('seekto')).toBeNull()
  await act(async () => {
    const playing = controller.play()
    transport.playing()
    expect((await playing).status).toBe('completed')
    controller.pause()
  })
  expect(views.get('mini')!.state.status).toBe('paused')
})
