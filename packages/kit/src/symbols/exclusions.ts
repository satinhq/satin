/** This mark is excluded from Satin's bundled and named custom symbols. */
export function isExcludedSymbolName(name: string): boolean {
  return name === 'logo.apple' || name === 'logo.apple.fill'
}
