import { SymbolImage } from '../symbols/Symbol.tsx'
import type { MenuSymbolName } from './menuSymbolMasks.ts'
/* Where a selection row's icon starts when its checkmark holds the leading aperture (iOS 27
 * native reference menu Picker of Labels: checkmark at 12 pt, icon 35-55 pt, title at 71 pt). */
const ICON_AFTER_CHECKMARK_LEFT_PT = 32

/** The menu keeps ownership of its leading aperture; artwork belongs to SymbolImage. In a selection
 * row the checkmark keeps the aperture and the symbol follows it. */
export function MenuSymbol({
  name,
  followsCheckmark = false,
}: {
  name: MenuSymbolName
  followsCheckmark?: boolean
}) {
  return (
    <SymbolImage
      name={name}
      data-satin-menu-symbol={name}
      data-satin-menu-symbol-follows-check={followsCheckmark ? 'true' : undefined}
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        left: followsCheckmark ? ICON_AFTER_CHECKMARK_LEFT_PT : 20,
        top: 9,
        fontSize: 20,
      }}
    />
  )
}
