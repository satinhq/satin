/** Name-only catalogue. Glyph drawing stays in the symbol generator. */
export function renderSymbolCatalogue(names) {
  const sorted = [...names].sort((left, right) => left.localeCompare(right, 'en'))
  return `# Available symbols

Satin bundles ${sorted.length} symbol names. Use these names in Symbol, Button,
ToolbarItem and tab declarations. They are semantic aliases for redistributable
Framework7 artwork, not Apple SF Symbols artwork.

A name absent from this list renders the visible question-mark placeholder unless
your SymbolProvider supplies an original or redistributable glyph. SymbolName
accepts custom strings, so TypeScript does not check catalogue membership.
Selected symbols use the corresponding .fill name when it exists.

This page is generated from the shipped catalogue during each package build.

| Name |
| --- |
${sorted.map(name => `| \`${name}\` |`).join('\n')}
`
}
