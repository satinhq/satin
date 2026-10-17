import { readDeviceIdiom } from '../layout/deviceIdiom.ts'
import type { PropsWithChildren } from 'react'
import type { AppDefinition } from './definition.ts'

/** A fallback, never a screen-orientation lock. Geometry is supplied by SatinRoot. */
export function OrientationGuard({
  app,
  width,
  height,
  children,
}: PropsWithChildren<{
  app: AppDefinition
  width: number
  height: number
}>) {
  const policy =
    readDeviceIdiom() === 'pad' ? (app.orientations.ipad ?? app.orientations) : app.orientations
  const unsupported =
    policy.fallback !== 'responsive' &&
    !policy.supported.includes(width > height ? 'landscape' : 'portrait')
  return (
    <>
      <div style={{ display: 'contents' }} inert={unsupported ? true : undefined}>
        {children}
      </div>
      {unsupported && (
        <section data-satin-orientation-fallback="true" role="status">
          Rotate your device to continue.
        </section>
      )}
    </>
  )
}
