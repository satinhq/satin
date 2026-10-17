/** The names of the iOS system colours. Each has a light and a dark value. Plain CSS colours work
 * too. */
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

/** Returns a system colour as a CSS colour that follows light and dark appearance.
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

/** The names of the iOS semantic colours for text, fills, backgrounds, separators and tint
 * (`label`, `secondarySystemBackground`, …). */
export type SemanticColorName = keyof typeof semanticColors

/** Returns a semantic colour, such as `label` or `systemGroupedBackground`, as a CSS colour that
 * follows light and dark appearance. It also resolves inside portals. */
export function semanticColor(name: SemanticColorName): string {
  return `var(${semanticColors[name]})`
}
