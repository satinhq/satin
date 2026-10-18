import {
  Component,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { LIST_MOVE_ANIMATION, registerRowMoves, stopRowMoves } from './rowMotion.ts'

import { isLayoutTransaction } from '../motion/layoutTransaction.ts'

type Row = { identity: string; element: HTMLElement }
type Group = Map<string, Row>

/** A List owns identity across sections. Repeated IDs remain local to their group. */
function createScope() {
  const groups = new Map<Group, number>()
  let nextGroup = 0
  let motion: ReturnType<typeof registerRowMoves> | undefined
  let pending: ReturnType<ReturnType<typeof registerRowMoves>['capture']> | undefined
  const readRows = () => {
    const counts = new Map<string, number>()
    for (const group of groups.keys()) {
      for (const row of group.values()) {
        counts.set(row.identity, (counts.get(row.identity) ?? 0) + 1)
      }
    }
    const rows = new Map<string, HTMLElement>()
    for (const [group, groupID] of groups) {
      for (const [key, row] of group) {
        const identity =
          counts.get(row.identity) === 1
            ? JSON.stringify(['item', row.identity])
            : JSON.stringify(['group', groupID, key])
        rows.set(identity, row.element)
      }
    }
    return rows
  }
  return {
    capture() {
      // React runs every snapshot before mutating any group's DOM. One List snapshot
      // covers all sections, including groups being mounted or removed in this commit.
      if (isLayoutTransaction() || pending || !motion) return
      pending = motion.capture()
    },
    complete() {
      const complete = pending
      if (!complete) return
      // Finish after every sibling's refs and layout effects have registered its rows.
      queueMicrotask(() => {
        if (pending !== complete) return
        pending = undefined
        complete(LIST_MOVE_ANIMATION)
      })
    },
    add(group: Group) {
      groups.set(group, nextGroup++)
      motion ??= registerRowMoves(readRows, () => {
        // An explicit transaction supersedes any automatic snapshot awaiting completion.
        pending = undefined
      })
      return () => {
        stopRowMoves(new Map([...group].map(([key, row]) => [key, row.element])))
        groups.delete(group)
        if (!groups.size) {
          motion?.dispose()
          motion = undefined
          pending = undefined
        }
      }
    },
  }
}

const RowMotionContext = createContext<ReturnType<typeof createScope> | null>(null)

export function RowMotionScope({ children }: { children: ReactNode }) {
  const scope = useMemo(createScope, [])
  return <RowMotionContext value={scope}>{children}</RowMotionContext>
}

export function useRowMotionGroup(enabled: boolean) {
  const inherited = useContext(RowMotionContext)
  const local = useMemo(createScope, [])
  const rows = useRef<Group>(new Map())
  const scope = inherited ?? local
  useLayoutEffect(() => {
    if (enabled) return scope.add(rows.current)
  }, [enabled, scope])
  return { rows: rows.current, scope }
}

/** The snapshot lifecycle reads committed DOM, never speculative render geometry. */
export class RowMotionCommit extends Component<{
  scope: ReturnType<typeof createScope>
  order: string
  children: ReactNode
}> {
  getSnapshotBeforeUpdate(previous: Readonly<RowMotionCommit['props']>) {
    if (previous.order !== this.props.order) this.props.scope.capture()
    return null
  }

  componentDidUpdate() {
    this.props.scope.complete()
  }

  render() {
    return this.props.children
  }
}
