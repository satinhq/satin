import { useContext, type ReactNode } from 'react'
import { ListRow } from '../list-form/ListForm.tsx'
import { ListContext, ListRowContentContext } from '../list-form/listContext.ts'

/** A custom ListRow already owns its cell and insets. */
export function ControlRow({ children }: { children: ReactNode }) {
  const inList = useContext(ListContext)
  const inRow = useContext(ListRowContentContext)
  return inList && !inRow ? <ListRow>{children}</ListRow> : children
}
