import type { SVGProps } from 'react'
import { SymbolImage } from '../symbols/Symbol.tsx'
export type DisclosureIndicatorProps = SVGProps<SVGSVGElement>
/** Framework7 disclosure artwork; framework layout still owns the row aperture. */
export function DisclosureIndicator({ scale: _scale, ...props }: DisclosureIndicatorProps) {
  return (
    <SymbolImage
      {...props}
      name="chevron.right"
      weight="semibold"
      data-satin-settings-disclosure="true"
    />
  )
}
