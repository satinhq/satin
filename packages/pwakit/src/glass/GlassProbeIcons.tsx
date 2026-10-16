import { MENU_ICON_SVG, TAB_ICON_SVG } from './lens/icons.ts'

// Probe-page glyphs for GlassPresentation (rim proof markers and the probe's menu and tab icons).

export function RimProofMarkers() {
  return (
    <span className="satin-lens-rim-proof-markers" aria-hidden="true">
      <i className="satin-lens-rim-proof-marker satin-lens-rim-proof-marker--top" />
      <i className="satin-lens-rim-proof-marker satin-lens-rim-proof-marker--bottom" />
    </span>
  )
}

export function MenuIcon({ name }: { name: keyof typeof MENU_ICON_SVG }) {
  return (
    <i
      className="satin-lens-glass-menu-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MENU_ICON_SVG[name] }}
    />
  )
}

export function TabIcon({ index }: { index: number }) {
  return (
    <i
      className="satin-lens-tab-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: TAB_ICON_SVG[index] }}
    />
  )
}
