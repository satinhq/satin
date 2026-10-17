/** Each occurrence has its own entryId, including repeated songs. */
export type MediaQueueEntry = Readonly<{
  entryId: string
  mediaId: string
  src: string
  mimeType?: string
  sourceRevision?: string | number
  metadata?: Readonly<{ title?: string; artist?: string; album?: string; artwork?: string }>
}>
/** How a media command ended. `needs-user-activation` means WebKit wants a tap first. */
export type MediaCommandResult = Readonly<
  | {
      status: 'completed' | 'cancelled' | 'needs-user-activation' | 'unavailable'
      operationId: number
    }
  | { status: 'failed'; operationId: number; code: string; cause?: unknown }
>
/** The queue's repeat mode. */
export type MediaRepeat = 'off' | 'one' | 'all'
/** Everything the player shows: the queue, the current entry, status, position and modes. */
export type MediaSnapshot = Readonly<{
  queue: readonly MediaQueueEntry[]
  playbackOrder: readonly string[]
  currentEntryId: string | null
  status:
    'idle' | 'loading' | 'paused' | 'playing' | 'buffering' | 'ended' | 'interrupted' | 'error'
  position: number
  duration: Readonly<{ kind: 'unknown' | 'live' }> | Readonly<{ kind: 'finite'; seconds: number }>
  seekable: readonly Readonly<{ start: number; end: number }>[]
  repeat: MediaRepeat
  shuffle: boolean
  interruption: 'unknown-system' | null
  error: Readonly<{ code: string }> | null
}>
/** @internal Playback coordination fields, excluded from the application snapshot. */
export type InternalMediaSnapshot = MediaSnapshot &
  Readonly<{
    playIntent: boolean
    generation: number
    pendingSeek: number | null
  }>
/** Where a replaced queue starts, and whether it plays. */
export type MediaQueueOptions = Readonly<{
  currentEntryId?: string
  position?: number
  autoplay?: boolean
}>
/** Queue results acknowledge the transaction. Playback and seek results acknowledge observed completion. */
export interface MediaController {
  replaceQueue(
    entries: readonly MediaQueueEntry[],
    options?: MediaQueueOptions,
  ): Promise<MediaCommandResult>
  play(): Promise<MediaCommandResult>
  pause(): MediaCommandResult
  stop(): MediaCommandResult
  seek(seconds: number): Promise<MediaCommandResult>
  next(): Promise<MediaCommandResult>
  previous(): Promise<MediaCommandResult>
  append(entries: readonly MediaQueueEntry[]): MediaCommandResult
  insertNext(entries: readonly MediaQueueEntry[]): MediaCommandResult
  remove(entryId: string): MediaCommandResult
  move(entryId: string, beforeEntryId: string | null): MediaCommandResult
  setRepeat(repeat: MediaRepeat): MediaCommandResult
  setShuffle(shuffle: boolean): MediaCommandResult
}
/** `useMediaPlayer`'s result: the commands and the live state. */
export type MediaPlayer = Readonly<{ controller: MediaController; state: MediaSnapshot }>
