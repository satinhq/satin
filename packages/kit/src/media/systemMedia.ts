import type { MediaController, MediaQueueEntry, InternalMediaSnapshot } from './types.ts'

const owners = new WeakMap<MediaSession, symbol>()
const actions = [
  'play',
  'pause',
  'nexttrack',
  'previoustrack',
  'seekto',
  'seekforward',
  'seekbackward',
] as const

/** Media Session is document-global. A retired root must not clear its successor. */
export function createSystemMedia(
  controller: MediaController,
  readState: () => InternalMediaSnapshot,
  readElement: () => HTMLAudioElement | null,
) {
  const session = typeof navigator === 'undefined' ? undefined : navigator.mediaSession
  const owner = Symbol('satin-media-session')
  if (session) owners.set(session, owner)
  const installed = new Map<MediaSessionAction, { generation: number; enabled: boolean }>()
  const unavailable = new Set<string>()
  let metadataEntry: MediaQueueEntry | undefined
  let positionKey: string | undefined
  let playbackState: MediaSessionPlaybackState | undefined
  let disposed = false
  const ownsSession = () => session && !disposed && owners.get(session) === owner

  function attempt(feature: string, write: () => void) {
    if (unavailable.has(feature)) return
    try {
      write()
    } catch (error) {
      unavailable.add(feature)
      console.warn(`Satin system media ${feature} is unavailable.`, error)
    }
  }
  function available(action: MediaSessionAction, state: InternalMediaSnapshot) {
    if (!state.currentEntryId || state.status === 'idle') return false
    const index = state.playbackOrder.indexOf(state.currentEntryId)
    if (action === 'nexttrack')
      return index + 1 < state.playbackOrder.length || state.repeat === 'all'
    if (action === 'previoustrack') return index > 0 || state.repeat === 'all'
    if (
      (action === 'seekforward' || action === 'seekbackward') &&
      (available('nexttrack', state) || available('previoustrack', state))
    )
      return false
    if (action.startsWith('seek'))
      return (
        state.seekable.length > 0 ||
        (state.duration.kind === 'finite' && state.duration.seconds > 0)
      )
    return true
  }
  function dispatch(details: MediaSessionActionDetails) {
    const state = readState()
    switch (details.action) {
      case 'play':
        void controller.play()
        break
      case 'pause':
        controller.pause()
        break
      case 'nexttrack':
        void controller.next()
        break
      case 'previoustrack':
        void controller.previous()
        break
      case 'seekto':
        if (details.seekTime !== undefined) void controller.seek(details.seekTime)
        break
      case 'seekforward':
      case 'seekbackward': {
        const offset = details.seekOffset ?? 10
        if (!Number.isFinite(offset) || offset < 0) break
        const direction = details.action === 'seekforward' ? 1 : -1
        void controller.seek(Math.max(0, state.position + direction * offset))
        break
      }
    }
  }
  function artwork(src: string | undefined): MediaImage[] {
    if (!src) return []
    try {
      return [{ src: new URL(src, document.baseURI).href, sizes: 'any' }]
    } catch {
      // A bad catalog image must not suppress the title or future track metadata.
      if (!unavailable.has('artwork')) {
        console.warn('Satin system media artwork URL is invalid.')
        unavailable.add('artwork')
      }
      return []
    }
  }
  function sync(force = false) {
    if (!ownsSession()) return
    const state = readState()
    const element = readElement()
    for (const action of actions) {
      const enabled = available(action, state)
      const previous = installed.get(action)
      if (previous?.generation === state.generation && previous.enabled === enabled) continue
      const generation = state.generation
      attempt(action, () => {
        session!.setActionHandler(
          action,
          enabled
            ? details => {
                if (!ownsSession() || readState().generation !== generation) return
                if (available(action, readState())) dispatch(details)
              }
            : null,
        )
      })
      installed.set(action, { generation, enabled })
    }
    const entry = element
      ? state.queue.find(item => item.entryId === state.currentEntryId)
      : undefined
    const metadata = entry?.metadata
    if (force || entry !== metadataEntry) {
      metadataEntry = entry
      attempt('metadata', () => {
        session!.metadata =
          entry && typeof MediaMetadata !== 'undefined'
            ? new MediaMetadata({
                title: metadata?.title ?? '',
                artist: metadata?.artist ?? '',
                album: metadata?.album ?? '',
                // The API accepts unspecified intrinsic sizes. Do not claim resized
                // artwork exists when the app supplies only one original image URL.
                artwork: artwork(metadata?.artwork),
              })
            : null
      })
    }
    const observedPlayback: MediaSessionPlaybackState = !element
      ? 'none'
      : element.paused || element.ended
        ? 'paused'
        : 'playing'
    if (force || observedPlayback !== playbackState) {
      playbackState = observedPlayback
      attempt('playbackState', () => {
        session!.playbackState = observedPlayback
      })
    }
    const rate = element?.playbackRate ?? 1
    const position =
      element &&
      state.duration.kind === 'finite' &&
      state.duration.seconds > 0 &&
      Number.isFinite(state.duration.seconds) &&
      Number.isFinite(rate) &&
      rate > 0
        ? {
            duration: state.duration.seconds,
            position: Math.min(state.duration.seconds, Math.max(0, state.position)),
            playbackRate: rate,
          }
        : undefined
    const nextPositionKey = position
      ? `${state.generation}:${position.duration}:${position.position}:${position.playbackRate}:${observedPlayback}`
      : 'clear'
    if (force || nextPositionKey !== positionKey) {
      positionKey = nextPositionKey
      attempt('position', () => {
        session!.setPositionState?.(position)
      })
    }
  }
  return {
    sync,
    dispose() {
      if (ownsSession()) {
        for (const action of actions) {
          // Unsupported actions can also reject null. Clear each independently.
          try {
            session!.setActionHandler(action, null)
          } catch {
            /* Already unavailable. */
          }
        }
        attempt('metadata', () => {
          session!.metadata = null
        })
        attempt('playbackState', () => {
          session!.playbackState = 'none'
        })
        attempt('position', () => {
          session!.setPositionState?.()
        })
        owners.delete(session!)
      }
      disposed = true
    },
  }
}
