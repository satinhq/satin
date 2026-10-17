import { SymbolImage } from '../symbols/Symbol.tsx'
/** Draws the sidebar's `gearshape` or `sidebar.left` icon with `SymbolImage`. The artwork is from
 * Framework7 Icons (MIT). */
export function SidebarSymbol({ name }: { name: 'gearshape' | 'sidebar.left' }) {
  return <SymbolImage name={name} data-satin-sidebar-symbol={name} />
}
