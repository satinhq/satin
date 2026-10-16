# Symbols, images and the app icon

## Symbols

Use the framework's symbol catalogue for interface icons: tab items, toolbar buttons, row icons,
empty states. Its symbols match the weight and size of the text beside them and follow the tint.

- `Button symbol="plus"`, tab declarations with `symbol: 'house'`, and `<SymbolImage name="..." />`.
- A tab's selected state picks the `.fill` variant on its own.
- Check names in `node_modules/@satinhq/kit/dist/docs/symbols.md`. An unknown name renders a visible
  question-mark placeholder.
- Use one symbol per idea, consistently: the same symbol for "add" everywhere.
- Prefer outline symbols in toolbars and rows; filled symbols for selected states and small badges.
- `RowIcon` puts a symbol on a colored rounded tile, the way Settings rows do. Use it for lists of
  categories or settings, not for every row.

Don't use emoji as interface icons, and don't mix in another icon set beside the catalogue unless a
brand direction asks for one. If you need a glyph the catalogue lacks, draw an original one and
supply it through `SymbolProvider`.

## Images

Photos and artwork are content: show them edge to edge in grids or at the top of a detail screen,
with rounded corners when they sit inside a list. Use `AsyncImage` for remote images so loading and
failure have their own states.

## The app icon

The icon is the first thing people see. A good default:

- one simple, recognisable glyph or shape, centered;
- a solid single-color background, filling the whole square (iOS applies the mask; don't round
  the corners yourself or leave transparent edges);
- no text, no photos, no fine detail that vanishes at small sizes;
- provide the sizes in `defineApp` `icons` (180, 192 and 512 pixel PNGs).

iOS 27 can render Home Screen icons dark, clear or tinted, and builds those versions from your one
icon. A solid background with a simple glyph converts cleanly; busy artwork does not.

A brand's own icon always wins over this default.
