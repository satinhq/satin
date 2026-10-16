/** Appearance-aware UIKit system palette. Explicit CSS colors remain supported. */
export type SystemColorName =
  | 'blue'
  | 'brown'
  | 'cyan'
  | 'gray'
  | 'gray2'
  | 'gray3'
  | 'gray4'
  | 'gray5'
  | 'gray6'
  | 'green'
  | 'indigo'
  | 'mint'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow'

/** A named system color as a CSS color that follows the appearance.
 * @example <Button tint={systemColor('orange')} onPress={start}>Start</Button> */
export function systemColor(name: SystemColorName): string {
  return `var(--satin-system-${name})`
}

const semanticColors = {
  label: '--satin-label',
  opaqueSeparator: '--satin-opaque-separator',
  quaternaryLabel: '--satin-quaternary-label',
  quaternarySystemFill: '--satin-quaternary-system-fill',
  secondaryLabel: '--satin-secondary-label',
  secondarySystemBackground: '--satin-secondary-system-background',
  secondarySystemFill: '--satin-secondary-system-fill',
  secondarySystemGroupedBackground: '--satin-secondary-system-grouped-background',
  separator: '--satin-separator',
  systemBackground: '--satin-system-background',
  systemFill: '--satin-system-fill',
  systemGroupedBackground: '--satin-system-grouped-background',
  tertiaryLabel: '--satin-tertiary-label',
  tertiarySystemBackground: '--satin-tertiary-system-background',
  tertiarySystemFill: '--satin-tertiary-system-fill',
  tertiarySystemGroupedBackground: '--satin-tertiary-system-grouped-background',
  tint: '--satin-tint',
} as const

/** UIKit's semantic colour names (`label`, `secondarySystemBackground`, …). */
export type SemanticColorName = keyof typeof semanticColors

/** UIKit semantic content colors, inherited by app content and portals. */
export function semanticColor(name: SemanticColorName): string {
  return `var(${semanticColors[name]})`
}
