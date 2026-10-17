import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { registerRowMoves, stopRowMoves } from './rowMotion.ts'

type Row = { identity: string; element: HTMLElement }
type Group = Map<string, Row>

/** A List owns identity across sections. Repeated IDs remain local to their group. */
function createScope() {
  const groups = new Map<Group, number>()
  let nextGroup = 0
  let unregister: (() => void) | undefined
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
    settle() {
      unregister?.()
      unregister = groups.size ? registerRowMoves(readRows) : undefined
    },
    add(group: Group) {
      groups.set(group, nextGroup++)
      unregister ??= registerRowMoves(readRows)
      return () => {
        stopRowMoves(new Map([...group].map(([key, row]) => [key, row.element])))
        groups.delete(group)
        if (!groups.size) {
          unregister?.()
          unregister = undefined
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
  return { rows: rows.current, settle: scope.settle }
}
