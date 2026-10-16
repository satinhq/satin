import { useContext, useLayoutEffect, useRef, useState } from 'react'
import { RestoredScreenMountContext } from '../public/presentationContext.ts'

/** Reconcile old scene-stored flags without ever mounting a presentation. */
export function useColdLaunchPresentation(
  isPresented: boolean,
  onPresentedChange: (presented: boolean) => void,
): boolean {
  const restoredMount = useContext(RestoredScreenMountContext)
  const [suppressed, setSuppressed] = useState(() => restoredMount && isPresented)
  const reconciled = useRef(false)
  // Keep a stale controlled true closed until the owner acknowledges false.
  // A layout effect alone would already have mounted the renderer and animated.
  if (suppressed && !isPresented) setSuppressed(false)
  useLayoutEffect(() => {
    if (!suppressed || reconciled.current) return
    reconciled.current = true
    onPresentedChange(false)
  }, [suppressed, onPresentedChange])
  return isPresented && !suppressed
}
