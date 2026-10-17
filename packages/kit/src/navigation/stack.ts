import type { NavigatorState, ScreenEntry, TransitionController, TransitionPhase } from './types.ts'
import type { ScrollSnapshot } from '../scroll/types.ts'

export function isEntryCovered(entries: readonly ScreenEntry[], entryIndex: number) {
  return entries.slice(entryIndex + 1).some(entry => entry.transition.phase === 'settled')
}

/**
 * A multi-screen pop (popToRoot) animates only its topmost outgoing screen over
 * the destination. Outgoing screens beneath it on the same controller must not
 * paint, or the animation reveals them instead of the destination and then cuts
 * to it (owner phone, 2026-09-24: page 6 → page 5 → cut to root). Concurrent
 * single pops each own their controller and keep painting.
 */
export function hiddenByMultiPop(
  entries: readonly { transition: { phase: string; controller?: unknown } }[],
  index: number,
) {
  const entry = entries[index]
  if (!entry || entry.transition.phase !== 'exiting') return false
  for (let above = index + 1; above < entries.length; above++) {
    const other = entries[above]!
    if (
      other.transition.phase === 'exiting' &&
      other.transition.controller === entry.transition.controller
    )
      return true
  }
  return false
}

export function shouldRestoreOnUncover(wasCovered: boolean | undefined, isCovered: boolean) {
  return !isCovered && wasCovered !== false
}

export function scrollSnapshotsEqual(
  left: ScrollSnapshot | undefined,
  right: ScrollSnapshot | undefined,
) {
  if (left === right) return true
  if (!left || !right || left.size !== right.size) return false

  for (const [id, leftOffset] of left) {
    const rightOffset = right.get(id)
    if (!rightOffset || leftOffset.x !== rightOffset.x || leftOffset.y !== rightOffset.y) {
      return false
    }
  }

  return true
}

export function setEntryScrollSnapshot<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  entryKey: string,
  scrollSnapshot: ScrollSnapshot,
): NavigatorState<Entry> {
  let changed = false
  const entries = state.entries.map(entry => {
    if (entry.key !== entryKey || scrollSnapshotsEqual(entry.scrollSnapshot, scrollSnapshot)) {
      return entry
    }

    changed = true
    return { ...entry, scrollSnapshot } as Entry
  })

  return changed ? { entries } : state
}

function setTransition<Entry extends ScreenEntry>(
  entry: Entry,
  phase: TransitionPhase,
  controller: TransitionController,
): Entry {
  return {
    ...entry,
    transition: { controller, phase },
  }
}

export function pushStack<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  entry: Entry,
): NavigatorState<Entry> {
  return { entries: [...state.entries, entry] }
}

export function popStack<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  controller: TransitionController,
): NavigatorState<Entry> {
  if (state.entries.length <= 1) return state

  let targetIndex = -1
  for (let index = state.entries.length - 1; index > 0; index -= 1) {
    if (state.entries[index]?.transition.phase !== 'exiting') {
      targetIndex = index
      break
    }
  }
  if (targetIndex === -1) return state

  return {
    entries: state.entries.map((entry, index) =>
      index === targetIndex ? setTransition(entry, 'exiting', controller) : entry,
    ),
  }
}

export function popToRootStack<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  controller: TransitionController,
): NavigatorState<Entry> {
  if (state.entries.length <= 1) return state

  return {
    entries: state.entries.map((entry, index) =>
      index === 0 || entry.transition.phase === 'exiting'
        ? entry
        : setTransition(entry, 'exiting', controller),
    ),
  }
}

export function replaceStack<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  entry: Entry,
  controller: TransitionController,
): NavigatorState<Entry> {
  if (state.entries.length === 0) return { entries: [entry] }

  const topIndex = state.entries.length - 1
  return {
    entries: [
      ...state.entries.map((existingEntry, index) =>
        index === topIndex ? setTransition(existingEntry, 'exiting', controller) : existingEntry,
      ),
      entry,
    ],
  }
}

export function finishStackTransition<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  controller: TransitionController,
): NavigatorState<Entry> {
  let changed = false
  const entries: Entry[] = []

  for (const entry of state.entries) {
    if (entry.transition.controller !== controller) {
      entries.push(entry)
      continue
    }

    if (entry.transition.phase === 'exiting') {
      changed = true
      continue
    }

    if (entry.transition.phase === 'entering') {
      entries.push(setTransition(entry, 'settled', controller))
      changed = true
      continue
    }

    entries.push(entry)
  }

  return changed ? { entries } : state
}

export function cancelStackTransition<Entry extends ScreenEntry>(
  state: NavigatorState<Entry>,
  controller: TransitionController,
): NavigatorState<Entry> {
  let changed = false
  const entries: Entry[] = []

  for (const entry of state.entries) {
    if (entry.transition.controller !== controller) {
      entries.push(entry)
      continue
    }

    if (entry.transition.phase === 'entering') {
      changed = true
      continue
    }

    if (entry.transition.phase === 'exiting') {
      entries.push(setTransition(entry, 'settled', controller))
      changed = true
      continue
    }

    entries.push(entry)
  }

  return changed ? { entries } : state
}
