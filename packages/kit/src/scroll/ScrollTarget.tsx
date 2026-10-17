import { createContext, useCallback, useContext, type HTMLAttributes } from 'react'

export const ScrollTargetContext = createContext<
  ((id: string, element: HTMLDivElement | null) => void) | null
>(null)

/** Marks content a vertical `ScrollView` can scroll to by `id`. */
export function ScrollTarget({ id, ...props }: HTMLAttributes<HTMLDivElement> & { id: string }) {
  const register = useContext(ScrollTargetContext)
  if (!register)
    throw new Error('ScrollTarget requires a vertical ScrollView with positioning enabled.')
  const ref = useCallback((element: HTMLDivElement | null) => register(id, element), [id, register])
  return <div {...props} ref={ref} data-satin-scroll-target={id} />
}
