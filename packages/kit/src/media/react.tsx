import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createMediaStore } from './controller.ts'
import type { InternalMediaSnapshot, MediaPlayer, MediaSnapshot } from './types.ts'

const MediaContext = createContext<ReturnType<typeof createMediaStore> | null>(null)

/** Root-owned, inert until a command. The deferred release survives StrictMode effect replay. */
export function MediaPlayerRoot({
  children,
  onActivityChange,
}: {
  children: ReactNode
  onActivityChange?: (active: boolean) => void
}) {
  const [store] = useState(() => createMediaStore(undefined, onActivityChange))
  const lifetime = useRef(0)
  useEffect(() => {
    const generation = ++lifetime.current
    return () => {
      queueMicrotask(() => {
        if (lifetime.current === generation) store.dispose()
      })
    }
  }, [store])
  return <MediaContext value={store}>{children}</MediaContext>
}

/** Subscribe to the root-owned audio queue and system media commands. Video playback is not supported. */
export function useMediaPlayer(): MediaPlayer {
  const store = useContext(MediaContext)
  if (!store) throw new Error('useMediaPlayer must be called inside SatinRoot.')
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { controller: store.controller, state: publicMediaSnapshot(state) }
}

// All views observing one store version receive the same immutable public snapshot.
const publicSnapshots = new WeakMap<InternalMediaSnapshot, MediaSnapshot>()
function publicMediaSnapshot(state: InternalMediaSnapshot): MediaSnapshot {
  let snapshot = publicSnapshots.get(state)
  if (!snapshot) {
    const {
      generation: _generation,
      playIntent: _playIntent,
      pendingSeek: _pendingSeek,
      ...visible
    } = state
    snapshot = Object.freeze(visible)
    publicSnapshots.set(state, snapshot)
  }
  return snapshot
}
