import { createContext } from 'react'

/** Shared by controls that adopt native row presentation inside a List or Form. */
export const ListContext = createContext(false)

/** Inside custom ListRow content: the row owns its insets and cell, so fields inside are plain. */
export const ListRowContentContext = createContext(false)
