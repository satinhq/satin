# Glass, symbols, images and appearance

## Glass

The framework draws glass with WebGPU on every bar, tab bar, toolbar button, menu and sheet it
owns. You get it by using those components; you rarely need to ask for it.

- For app-specific floating chrome, use `GlassEffect` with `Glass.regular` or `Glass.clear`, and
  `GlassEffectContainer` to group neighbouring glass shapes so they blend and morph together.
- Never imitate glass with `backdrop-filter`, blurred copies, translucent gradients or another
  glass library. Lint flags it (`no-handrolled-glass`), and it never matches.
- Never tune blur, tint or a spring to hide a glass defect.
- If WebGPU can't render, a released app switches to a simpler CSS material on its own and
  records a diagnostic. Development and strict builds show the error instead so you notice it.
  Read diagnostics with `useGlassErrors`, or report them with `runApp`'s `onGlassError` option.
  Never catch the error yourself to swap in a fake material.
- Glass samples what is painted beneath it. Decorative SVG inside a glass control needs
  `role="presentation"` and `focusable="false"`, not `aria-hidden`: the renderer skips hidden
  subtrees. Cross-origin frames, images without CORS and DRM video are invisible to glass; keep
  glass off them.

## Symbols

- Use `SymbolImage name="..."`, `Button symbol="..."` and tab `symbol` declarations. They inherit
  text size, weight and tint.
- Only names in the bundled catalogue exist; any other name shows a question-mark placeholder,
  and TypeScript won't catch it. Check `node_modules/@satinhq/kit/dist/docs/symbols.md` before using a
  name.
- The catalogue is original, redistributable artwork, not Apple's SF Symbols. Never copy SF
  Symbols artwork into an app. Add your own glyphs through `SymbolProvider`, with artwork you own
  or have a licence for, and keep its notices.
- Icon-only buttons need `iconOnly` and an `aria-label` that names the action ("Add habit").

## Images

`Image` for packaged artwork, `AsyncImage` for remote images with loading and failure handling
through `onPhaseChange`. There is no Photos library picker yet; don't build one from a file input.

## Appearance

- Set the app's tint and launch backgrounds in `defineApp`: `appearance.tint`,
  `appearance.background` and `appearance.darkLaunch.background`.
- Read light or dark with `useColorScheme()`, never a raw `prefers-color-scheme` media query.
- For colours that follow light and dark, use `semanticColor('label')`,
  `semanticColor('secondaryLabel')`, the fill, background and separator roles, and
  `systemColor('blue')` and friends.
- For your own CSS variables per appearance, use `:root[data-satin-appearance='dark']`.
- `preferredColorScheme('dark')` forces an appearance for the whole app; `'system'` clears it.
  Persist the user's choice with `useAppStorage` and pass it to `runApp`'s `preferredColorScheme`
  option at launch.
- Let iOS choose the status bar text colour; keep the content behind the clock consistent with the
  current appearance.

## Motion

Framework components animate themselves: pushes, sheets, menus, presses, tab switches, list
reordering. Animate your own state changes with `withAnimation(Animation.smooth, () => setState(...))`
using the presets `default`, `smooth`, `snappy`, `bouncy` or `spring({ durationMs, bounce })`. Don't
write CSS transitions, keyframes or hand-tuned springs for framework components, and honour Reduce
Motion in anything you animate yourself.
