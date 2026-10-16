import { SymbolImage } from '../symbols/Symbol.tsx'
/** Framework7 Icons (MIT), through the shared SymbolImage renderer. */
export function SidebarSymbol({ name }: { name: 'gearshape' | 'sidebar.left' }) {
  return <SymbolImage name={name} data-satin-sidebar-symbol={name} />
}
