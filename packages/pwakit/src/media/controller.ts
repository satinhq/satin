import { createSystemMedia } from './systemMedia.ts'
import type {
  MediaCommandResult,
  MediaController,
  MediaQueueEntry,
  MediaQueueOptions,
  InternalMediaSnapshot,
} from './types.ts'

type Pending = { id: number; resolve: (result: MediaCommandResult) => void }
// The audio controller owns the exclusive media element; subscribers never acquire it.
type AudioSlot = { owner: 'audio'; element: HTMLAudioElement }
const initialState: InternalMediaSnapshot = Object.freeze({
  queue: Object.freeze([]),
  playbackOrder: Object.freeze([]),
  currentEntryId: null,
  status: 'idle',
  playIntent: false,
  generation: 0,
  position: 0,
  duration: Object.freeze({ kind: 'unknown' }),
  seekable: Object.freeze([]),
  pendingSeek: null,
  repeat: 'off',
  shuffle: false,
  interruption: null,
  error: null,
})
const events = [
  'loadedmetadata',
  'durationchange',
  'progress',
  'timeupdate',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'seeking',
  'seeked',
  'ended',
  'error',
  'canplay',
  'ratechange',
  'emptied',
  'loadstart',
] as const

export function createMediaStore(
  createAudio: () => HTMLAudioElement = () => document.createElement('audio'),
  onActivityChange: (active: boolean) => void = () => {},
) {
  let state = initialState
  let slot: AudioSlot | null = null
  let expectedSource = ''
  let operation = 0
  let disposed = false
  let pendingPlay: Pending | null = null
  let pendingSeek: (Pending & { target: number; assigned: boolean }) | null = null
  // Only observed, uninterrupted playback can complete naturally. Pause/seek/load
  // revoke eligibility; a subsequent non-ended playback observation arms a new cycle.
  let completionArmed = false
  let awaitingPlayback = false
  let mediaActive = false
  let releaseActivity: ReturnType<typeof setTimeout> | undefined
  let systemMedia: ReturnType<typeof createSystemMedia> | null = null
  let removeVisibilityListener: (() => void) | undefined
  const listeners = new Set<() => void>()
  const result = (
    status: 'completed' | 'cancelled' | 'unavailable',
    id = ++operation,
  ): MediaCommandResult => Object.freeze({ status, operationId: id })
  const failure = (code: string, id = ++operation, cause?: unknown): MediaCommandResult =>
    Object.freeze({ status: 'failed', operationId: id, code, cause })
  function protectPlayback(active: boolean) {
    clearTimeout(releaseActivity)
    releaseActivity = undefined
    if (active) {
      if (mediaActive) return
      mediaActive = true
      onActivityChange(true)
    } else if (mediaActive) {
      // Observations can briefly report paused/ended while replacing a resource.
      // Only commands or terminal failures release safety, after one quiet second.
      // A new play request cancels this release before any suspended-update retry.
      releaseActivity = setTimeout(() => {
        releaseActivity = undefined
        mediaActive = false
        onActivityChange(false)
      }, 1000)
    }
  }
  function publish(patch: Partial<InternalMediaSnapshot>) {
    const keys = Object.keys(patch) as (keyof InternalMediaSnapshot)[]
    const changed = !keys.every(key => Object.is(patch[key], state[key]))
    if (changed) state = Object.freeze({ ...state, ...patch })
    systemMedia?.sync()
    if (!changed) return
    for (const listener of listeners) listener()
  }
  function cancelPlay() {
    pendingPlay?.resolve(result('cancelled', pendingPlay.id))
    pendingPlay = null
  }
  function cancelSeek() {
    pendingSeek?.resolve(result('cancelled', pendingSeek.id))
    pendingSeek = null
  }
  function coherent() {
    const element = slot?.element
    return element &&
      expectedSource &&
      (element.currentSrc === expectedSource ||
        (!element.currentSrc && element.error && element.src === expectedSource)) &&
      (element.readyState >= 1 || element.error !== null)
      ? element
      : null
  }
  function seekTarget(target: number, element: HTMLAudioElement) {
    let bounded = Math.max(0, target)
    if (Number.isFinite(element.duration)) bounded = Math.min(bounded, element.duration)
    if (element.seekable.length) {
      let closest = element.seekable.start(0)
      let distance = Math.abs(bounded - closest)
      for (let index = 0; index < element.seekable.length; index++) {
        const start = element.seekable.start(index)
        const end = element.seekable.end(index)
        if (bounded >= start && bounded <= end) return bounded
        for (const edge of [start, end]) {
          if (Math.abs(bounded - edge) < distance) {
            closest = edge
            distance = Math.abs(bounded - edge)
          }
        }
      }
      bounded = closest
    }
    return bounded
  }
  function applySeek(element: HTMLAudioElement) {
    if (!pendingSeek || pendingSeek.assigned) return
    const request = pendingSeek
    request.target = seekTarget(request.target, element)
    request.assigned = true
    publish({ pendingSeek: request.target })
    try {
      element.currentTime = request.target
    } catch (cause) {
      if (pendingSeek !== request) return
      pendingSeek = null
      publish({ pendingSeek: null })
      request.resolve(failure('seek-failed', request.id, cause))
    }
  }
  function reconcile(event?: Event) {
    const element = coherent()
    if (!element || disposed) return
    if (!element.error) applySeek(element)
    // TimeRanges objects need not retain identity. Compare their scalar bounds,
    // keeping the immutable snapshot array until an actual range changes.
    const observedRanges = element.seekable
    let ranges = state.seekable
    for (let index = 0; index < observedRanges.length; index++) {
      if (
        ranges.length !== observedRanges.length ||
        ranges[index]?.start !== observedRanges.start(index) ||
        ranges[index]?.end !== observedRanges.end(index)
      ) {
        ranges = Object.freeze(
          Array.from({ length: observedRanges.length }, (_, rangeIndex) =>
            Object.freeze({
              start: observedRanges.start(rangeIndex),
              end: observedRanges.end(rangeIndex),
            }),
          ),
        )
        break
      }
    }
    if (!observedRanges.length) ranges = initialState.seekable
    let duration = state.duration
    if (Number.isFinite(element.duration)) {
      if (duration.kind !== 'finite' || duration.seconds !== element.duration)
        duration = Object.freeze({ kind: 'finite', seconds: element.duration })
    } else {
      const kind = element.duration === Infinity ? 'live' : 'unknown'
      if (duration.kind !== kind) duration = Object.freeze({ kind })
    }
    const position = Number.isFinite(element.currentTime) ? element.currentTime : 0
    let status = state.status
    let interruption = state.interruption
    if (element.error) {
      awaitingPlayback = false
      protectPlayback(false)
      completionArmed = false
      const code =
        (
          { 1: 'aborted', 2: 'network', 3: 'decode', 4: 'unsupported-source' } as Record<
            number,
            string
          >
        )[element.error.code] ?? 'media-error'
      pendingPlay?.resolve(failure(code, pendingPlay.id))
      pendingSeek?.resolve(failure(code, pendingSeek.id))
      pendingPlay = null
      pendingSeek = null
      publish({
        status: 'error',
        playIntent: false,
        pendingSeek: null,
        error: state.error?.code === code ? state.error : Object.freeze({ code }),
      })
      return
    }
    if (!state.playIntent && !element.paused) {
      element.pause()
      return
    }
    if (element.seeking || pendingSeek) completionArmed = false
    const request = pendingSeek
    if (request?.assigned && !element.seeking && Math.abs(position - request.target) < 0.01) {
      pendingSeek = null
      request.resolve(result('completed', request.id))
    }
    if (element.ended && state.playIntent && completionArmed) {
      completionArmed = false
      const next = state.repeat === 'one' ? state.currentEntryId : adjacent(1)
      publish({ position, duration, seekable: ranges, status: 'ended', playIntent: Boolean(next) })
      if (next) void select(next, true)
      return
    }
    if (!element.paused && !element.ended) {
      awaitingPlayback = false
      if (
        !element.seeking &&
        !pendingSeek &&
        (!Number.isFinite(element.duration) || position < element.duration)
      )
        completionArmed = true
      status = element.readyState < 3 ? 'buffering' : 'playing'
      interruption = null
    } else if (element.ended) {
      // An end reached by scrubbing is a terminal cursor, not queue completion.
      // During an explicit replay, old ended observations cannot cancel the request.
      status =
        state.playIntent && (awaitingPlayback || pendingPlay || pendingSeek) ? 'loading' : 'ended'
    } else {
      if (state.playIntent && !pendingPlay && !awaitingPlayback) {
        completionArmed = false
        status = 'interrupted'
        interruption = 'unknown-system'
      } else status = state.playIntent ? 'loading' : 'paused'
    }
    // Event names are hints only. Queued events from a previous load cannot publish old data.
    if (
      (event?.type === 'waiting' || event?.type === 'stalled') &&
      !element.paused &&
      element.readyState < 3
    ) {
      status = 'buffering'
    }
    publish({
      position,
      duration,
      seekable: ranges,
      status,
      interruption,
      playIntent: status === 'interrupted' || status === 'ended' ? false : state.playIntent,
      pendingSeek: pendingSeek?.target ?? null,
    })
  }
  function acquire() {
    if (!slot) {
      const element = createAudio()
      element.preload = 'metadata'
      slot = { owner: 'audio', element }
      for (const name of events) element.addEventListener(name, reconcile)
      systemMedia = createSystemMedia(
        controller,
        () => state,
        () => coherent(),
      )
      const foreground = () => {
        if (document.hidden || disposed) return
        reconcile()
        if (coherent()?.paused && !state.playIntent) publish({ interruption: null })
        systemMedia?.sync(true)
      }
      document.addEventListener('visibilitychange', foreground)
      removeVisibilityListener = () => document.removeEventListener('visibilitychange', foreground)
    }
    return slot.element
  }
  function resetSource(
    entry: MediaQueueEntry | undefined,
    patch: Partial<InternalMediaSnapshot> = {},
    continuingPlayback = false,
  ) {
    if (continuingPlayback) protectPlayback(true)
    cancelPlay()
    cancelSeek()
    expectedSource = ''
    completionArmed = false
    awaitingPlayback = continuingPlayback
    publish({
      ...patch,
      generation: state.generation + 1,
      status: entry ? 'loading' : 'idle',
      playIntent: continuingPlayback,
      position: 0,
      duration: initialState.duration,
      seekable: initialState.seekable,
      pendingSeek: null,
      error: null,
      interruption: null,
    })
    const element = entry ? acquire() : slot?.element
    if (!element) return
    element.pause()
    element.removeAttribute('src')
    if (entry) {
      element.src = entry.src
      expectedSource = element.src
    }
    element.load()
    systemMedia?.sync()
  }
  function validEntries(entries: readonly MediaQueueEntry[]) {
    const ids = new Set<string>()
    return entries.every(entry => {
      if (!entry || !entry.entryId || !entry.mediaId || !entry.src || ids.has(entry.entryId))
        return false
      ids.add(entry.entryId)
      return true
    })
  }
  function freezeEntries(entries: readonly MediaQueueEntry[]) {
    return Object.freeze(
      entries.map(entry =>
        Object.freeze({
          ...entry,
          ...(entry.metadata ? { metadata: Object.freeze({ ...entry.metadata }) } : {}),
        }),
      ),
    )
  }
  function orderFor(queue: readonly MediaQueueEntry[]) {
    if (!state.shuffle) return Object.freeze(queue.map(entry => entry.entryId))
    const retained = state.playbackOrder.filter(id => queue.some(entry => entry.entryId === id))
    return Object.freeze([
      ...retained,
      ...queue.filter(entry => !retained.includes(entry.entryId)).map(entry => entry.entryId),
    ])
  }
  function adjacent(direction: number) {
    const index = state.playbackOrder.indexOf(state.currentEntryId ?? '')
    const target = index + direction
    if (target >= 0 && target < state.playbackOrder.length) return state.playbackOrder[target]
    if (state.repeat === 'all' && state.playbackOrder.length) {
      return state.playbackOrder[(target + state.playbackOrder.length) % state.playbackOrder.length]
    }
    return undefined
  }
  function select(entryId: string, autoplay: boolean, position?: number) {
    const changed = entryId !== state.currentEntryId
    if (changed || !expectedSource)
      resetSource(
        state.queue.find(entry => entry.entryId === entryId),
        { currentEntryId: entryId },
        autoplay,
      )
    const seek = position === undefined ? null : controller.seek(position)
    if (autoplay) return controller.play()
    return seek ?? Promise.resolve(result('completed'))
  }
  const controller: MediaController = Object.freeze({
    replaceQueue(entries: readonly MediaQueueEntry[], options: MediaQueueOptions = {}) {
      if (disposed) return Promise.resolve(result('unavailable'))
      if (
        !validEntries(entries) ||
        (options.currentEntryId !== undefined &&
          !entries.some(entry => entry.entryId === options.currentEntryId)) ||
        (options.position !== undefined &&
          (!Number.isFinite(options.position) || options.position < 0))
      ) {
        return Promise.resolve(failure('invalid-input'))
      }
      const old = state.queue.find(entry => entry.entryId === state.currentEntryId)
      const selected =
        options.currentEntryId ??
        (entries.some(entry => entry.entryId === state.currentEntryId)
          ? state.currentEntryId
          : entries[0]?.entryId) ??
        null
      const queue = freezeEntries(entries)
      const current = queue.find(entry => entry.entryId === selected)
      const changed =
        !old ||
        !current ||
        old.entryId !== current.entryId ||
        old.src !== current.src ||
        old.sourceRevision !== current.sourceRevision ||
        old.mimeType !== current.mimeType
      const patch = { queue, currentEntryId: selected, playbackOrder: orderFor(queue) }
      if (changed) resetSource(current, patch, options.autoplay === true)
      else publish(patch)
      if (!current) return Promise.resolve(result('completed'))
      if (options.autoplay === false) controller.pause()
      const seek = options.position === undefined ? null : controller.seek(options.position)
      if (options.autoplay) return controller.play()
      return seek ?? Promise.resolve(result('completed'))
    },
    play() {
      if (disposed || !state.currentEntryId) return Promise.resolve(result('unavailable'))
      protectPlayback(true)
      awaitingPlayback = true
      if (!expectedSource || state.status === 'error')
        resetSource(
          state.queue.find(entry => entry.entryId === state.currentEntryId),
          {},
          true,
        )
      cancelPlay()
      // HTML play can replay an ended resource. Rewind through the same seek owner
      // so it also works for repeat-all with one entry, without a source reload.
      if (coherent()?.ended && !pendingSeek) void controller.seek(0)
      const id = ++operation
      const generation = state.generation
      const element = acquire()
      const promise = new Promise<MediaCommandResult>(resolve => {
        pendingPlay = { id, resolve }
      })
      publish({ playIntent: true, error: null, interruption: null })
      const settle = (cause?: unknown) => {
        if (disposed || generation !== state.generation || pendingPlay?.id !== id) return
        const request = pendingPlay
        pendingPlay = null
        if (cause !== undefined) {
          awaitingPlayback = false
          protectPlayback(false)
          completionArmed = false
          const activation = cause instanceof Error && cause.name === 'NotAllowedError'
          publish({
            playIntent: false,
            status: activation ? 'paused' : 'error',
            error: Object.freeze({ code: activation ? 'needs-user-activation' : 'play-failed' }),
          })
          request.resolve(
            activation
              ? Object.freeze({ status: 'needs-user-activation', operationId: id })
              : failure('play-failed', id, cause),
          )
        } else {
          reconcile()
          request.resolve(
            coherent() && !element.paused ? result('completed', id) : result('cancelled', id),
          )
        }
      }
      try {
        element.play().then(() => settle(), settle)
      } catch (cause) {
        settle(cause)
      }
      return promise
    },
    pause() {
      if (disposed) return result('unavailable')
      cancelPlay()
      completionArmed = false
      awaitingPlayback = false
      publish({ playIntent: false, interruption: null })
      slot?.element.pause()
      reconcile()
      protectPlayback(false)
      return result('completed')
    },
    stop() {
      if (disposed) return result('unavailable')
      resetSource(undefined)
      protectPlayback(false)
      return result('completed')
    },
    seek(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0) return Promise.resolve(failure('invalid-input'))
      if (disposed || !state.currentEntryId) return Promise.resolve(result('unavailable'))
      if (!expectedSource)
        resetSource(state.queue.find(entry => entry.entryId === state.currentEntryId))
      cancelSeek()
      completionArmed = false
      const id = ++operation
      const promise = new Promise<MediaCommandResult>(resolve => {
        pendingSeek = { id, resolve, target: seconds, assigned: false }
      })
      publish({ pendingSeek: seconds })
      reconcile()
      return promise
    },
    next() {
      if (disposed) return Promise.resolve(result('unavailable'))
      const target = adjacent(1)
      return target ? select(target, state.playIntent) : Promise.resolve(result('unavailable'))
    },
    previous() {
      if (disposed) return Promise.resolve(result('unavailable'))
      const target = adjacent(-1)
      return target ? select(target, state.playIntent) : Promise.resolve(result('unavailable'))
    },
    append(entries: readonly MediaQueueEntry[]) {
      if (disposed) return result('unavailable')
      if (!validEntries([...state.queue, ...entries])) return failure('invalid-input')
      const queue = freezeEntries([...state.queue, ...entries])
      publish({ queue, playbackOrder: orderFor(queue) })
      if (!state.currentEntryId && queue.length) void select(queue[0]!.entryId, false)
      return result('completed')
    },
    insertNext(entries: readonly MediaQueueEntry[]) {
      if (disposed) return result('unavailable')
      if (!validEntries([...state.queue, ...entries])) return failure('invalid-input')
      const queue = [...state.queue]
      queue.splice(
        queue.findIndex(entry => entry.entryId === state.currentEntryId) + 1,
        0,
        ...entries,
      )
      const order = [...state.playbackOrder]
      order.splice(
        order.indexOf(state.currentEntryId ?? '') + 1,
        0,
        ...entries.map(entry => entry.entryId),
      )
      publish({ queue: freezeEntries(queue), playbackOrder: Object.freeze(order) })
      if (!state.currentEntryId && queue.length) void select(queue[0]!.entryId, false)
      return result('completed')
    },
    remove(entryId: string) {
      if (disposed) return result('unavailable')
      if (!state.queue.some(entry => entry.entryId === entryId)) return failure('invalid-input')
      const index = state.playbackOrder.indexOf(entryId)
      const order = state.playbackOrder.filter(id => id !== entryId)
      const queue = Object.freeze(state.queue.filter(entry => entry.entryId !== entryId))
      const active = state.currentEntryId === entryId
      if (active) controller.pause()
      const selected = active ? (order[index] ?? order[index - 1] ?? null) : state.currentEntryId
      const patch = { queue, playbackOrder: Object.freeze(order), currentEntryId: selected }
      if (active)
        resetSource(
          queue.find(entry => entry.entryId === selected),
          patch,
        )
      else publish(patch)
      return result('completed')
    },
    move(entryId: string, beforeEntryId: string | null) {
      if (disposed) return result('unavailable')
      const entry = state.queue.find(item => item.entryId === entryId)
      if (
        !entry ||
        (beforeEntryId !== null && !state.queue.some(item => item.entryId === beforeEntryId))
      )
        return failure('invalid-input')
      if (entryId === beforeEntryId) return result('completed')
      const queue = state.queue.filter(item => item.entryId !== entryId)
      queue.splice(
        beforeEntryId === null
          ? queue.length
          : queue.findIndex(item => item.entryId === beforeEntryId),
        0,
        entry,
      )
      publish({ queue: Object.freeze(queue), playbackOrder: orderFor(queue) })
      return result('completed')
    },
    setRepeat(repeat: InternalMediaSnapshot['repeat']) {
      if (disposed) return result('unavailable')
      if (!['off', 'one', 'all'].includes(repeat)) return failure('invalid-input')
      publish({ repeat })
      return result('completed')
    },
    setShuffle(shuffle: boolean) {
      if (disposed) return result('unavailable')
      if (typeof shuffle !== 'boolean') return failure('invalid-input')
      if (shuffle === state.shuffle) return result('completed')
      const order = state.queue.map(entry => entry.entryId)
      if (shuffle) {
        const rest = order.filter(id => id !== state.currentEntryId)
        for (let index = rest.length - 1; index > 0; index--) {
          const other = Math.floor(Math.random() * (index + 1))
          ;[rest[index], rest[other]] = [rest[other]!, rest[index]!]
        }
        order.splice(
          0,
          order.length,
          ...(state.currentEntryId ? [state.currentEntryId] : []),
          ...rest,
        )
      }
      publish({ shuffle, playbackOrder: Object.freeze(order) })
      return result('completed')
    },
  })
  return {
    controller,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelPlay()
      cancelSeek()
      expectedSource = ''
      removeVisibilityListener?.()
      systemMedia?.dispose()
      if (slot) {
        for (const name of events) slot.element.removeEventListener(name, reconcile)
        slot.element.pause()
        slot.element.removeAttribute('src')
        slot.element.load()
        slot = null
      }
      clearTimeout(releaseActivity)
      if (mediaActive) onActivityChange(false)
      mediaActive = false
      listeners.clear()
    },
  }
}
