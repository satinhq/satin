# Layout, scrolling and input

## The framework owns the document

Satin keeps the root and scroll surfaces full height, tracks the live safe area, and moves
content for the keyboard. App CSS must not fight it.

- Never set `height: 100vh`, `100dvh` or fixed heights on `html`, `body` or the app root.
- Never read `env(safe-area-inset-*)`. Use `useSafeAreaInsets()` in code, or let `List`, `Form`,
  `ScrollView`, toolbars and `SafeAreaInset` apply insets for you.
- Never cache the first viewport height or hard-code a status bar height. The viewport changes
  after launch, on rotation and with the keyboard.
- Never add a global reset (`* { margin: 0 }`, `user-select: none` on everything, document-wide
  `touchmove` listeners).
- Let backgrounds paint to the screen edges; inset only interactive content.

## One scroller per screen

Each screen has one primary `List`, `Form` or `ScrollView`, with a stable `id`. That scroller owns
the large title collapse, the scroll edge effect under the bars, pull to refresh, keyboard dismissal
and scroll position across tab switches.

- No `overflow: scroll` or `overflow: auto` containers. Nested horizontal carousels use
  `ScrollView` with a horizontal axis.
- Don't wrap a `List` in extra padding; lists already own their insets, separators and row spacing.

## Attaching things to edges

| Need | Use |
| --- | --- |
| A composer, accessory or button bar pinned to the bottom | `SafeAreaInset edge="bottom"` |
| Content floating over a scroller without changing its frame | `Overlay alignment="bottom"` around the scroller |
| An accessory under the navigation bar | `SafeAreaInset edge="top"` |
| Extra inset for the content below | `SafeAreaPadding`, `ContentMargins` |
| A background that runs under the bars | `IgnoresSafeArea` |
| A bar of controls above the tab bar | `TabView` `bottomAccessory` |

Bottom chrome must join the inset chain so it stays above the home indicator and the keyboard.
Never place it with `position: fixed`. For a growing message composer, follow
`node_modules/@satinhq/kit/dist/docs/messaging-scroll.md`: a bottom `SafeAreaInset` with
`TextEditor minLines/maxLines`, and no keyboard-height padding of your own.

## Text input

- `TextField` with `prompt` and `kind` (`email`, `url`, `number`, and so on) picks the right
  keyboard. Values are strings while editing; parse on save.
- `SecureField` for secrets, `TextEditor` for multi-line notes (Return stays a newline).
- `useFocusChain` moves focus between fields in visual order.
- Keep inputs at 16px or larger, or iOS zooms the page.
- Put fields in the screen's declared scroller and let the keyboard adapter move them. Never move
  the page yourself.
- Raw `<input>` and `<button>` are flagged by lint. Use the framework controls.

## Custom layout

Plain React and semantic HTML are fine for content. For stacks, prefer `VStack`, `HStack`,
`ZStack`, `Spacer` and `Divider`; `padding` with no value is the standard 16-point inset. For
custom CSS, `node_modules/@satinhq/kit/dist/docs/tokens.md` lists the supported geometry and theme
properties, and `semanticColor(name)` names the color properties (`--satin-label`,
`--satin-secondary-label`, `--satin-tint` and so on). Read those; every other `--satin-*` property is an
implementation detail. Never override any of them.

- On wide screens, constrain prose to a readable column instead of stretching a phone layout.
- Choose layout by size class (`useHorizontalSizeClass()`), never by window width. A wide iPhone
  can have a regular width without being an iPad.
- `GeometryReader` and `ViewThatFits` exist for size-dependent layout.

## Orientation

The default iPhone manifest asks for portrait; iPad allows both. To allow iPhone landscape, set
`orientations.supported` to `['portrait', 'landscape']` with `fallback: 'none'` in `defineApp`.
These are install-time hints, not a guaranteed lock.
