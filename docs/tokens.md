# Geometry and appearance tokens

`satinApp()` includes framework styles automatically. Satin supplies these properties inside its mounted root and may override geometry in adaptive pane descendants. Consume the nearest value; do not copy root measurements into a sidebar or detail pane. Unknown custom-property names do not produce a TypeScript error and can leave a CSS declaration invalid.

| Property | Value | Use |
| --- | --- | --- |
| `--satin-inset-top` | CSS length in px | Interactive content's live top inset |
| `--satin-inset-right` | CSS length in px | Right inset of the current surface |
| `--satin-inset-bottom` | CSS length in px | Bottom inset of the current surface |
| `--satin-inset-left` | CSS length in px | Left inset of the current surface |
| `--satin-safe-frame-width` | CSS length in px | Current safe content width |
| `--satin-safe-frame-height` | CSS length in px | Current safe content height |
| `--satin-background` | CSS color | Framework-selected surface background |
| `--satin-device-pixel` | CSS length in px | One physical pixel at the current device scale |
| `--satin-layout-horizontal` | `compact` or `regular` | Diagnostic layout class, not a length |
| `--satin-layout-vertical` | `compact` or `regular` | Diagnostic layout class, not a length |

```css
.custom-content {
  padding-inline: var(--satin-inset-left) var(--satin-inset-right);
  padding-bottom: var(--satin-inset-bottom);
  background: var(--satin-background);
  font: -apple-system-body;
}
```

Let List/Form/ScrollView and framework chrome apply their own insets. Adding the same inset again inside those components causes double padding. Never use raw viewport-height units or `env(safe-area-inset-*)` to replace framework geometry. Do not fix html, body or the mount in app CSS.

`useSafeAreaInsets()` returns numeric layout insets in CSS pixels. `useSafeAreaMetrics()` also exposes `layoutViewport`, `visualViewport`, `screen`, `safeFrame` and `physicalSafeFrame`, with numeric CSS-pixel dimensions. `physicalInsets` are comparison coordinates, not padding. React numeric padding values become px; CSS custom properties already contain their unit. Never append another `px` to a token.

## Settings composition

These settings tokens are also CSS lengths in px:

| Property | Meaning |
| --- | --- |
| `--satin-settings-root-inline-inset` | Root settings horizontal content inset |
| `--satin-settings-detail-inline-inset` | Detail settings horizontal content inset |
| `--satin-settings-root-title-top` | Root title origin, including the top inset |
| `--satin-settings-detail-content-top` | Detail content origin, including the top inset |
| `--satin-settings-root-title-offset` | Root title offset without the top inset |
| `--satin-settings-detail-content-offset` | Detail content offset without the top inset |
| `--satin-settings-navigation-bar-height` | Settings navigation bar height |
| `--satin-settings-root-row-height` | Root row baseline height |
| `--satin-settings-detail-row-height` | Detail row baseline height |
| `--satin-settings-group-radius` | Settings group corner radius |
| `--satin-settings-group-spacing` | Inter-group spacing |
| `--satin-settings-separator-hairline` | Separator thickness |

The two origin tokens already include the live top inset: do not add it twice. Prefer framework List and Screen composition over reconstructing their geometry. Row height tokens describe baselines, not permission to clip large text.

## Theme and ownership

Set `appearance.tint`, `appearance.background` and `appearance.darkLaunch.background` through the app definition. Use `useColorScheme()` for application artwork or application-owned colors; it returns `light` or `dark` from the accepted framework appearance. Do not introduce a raw appearance media query. Use `semanticColor('label')`, `semanticColor('secondaryLabel')` and `semanticColor('tertiaryLabel')` for UIKit content roles. Fill tiers, system and grouped backgrounds, separators and tint are available through the same helper. These tokens live on the document and reach body portals. Semantic label tokens resolve colors directly; secondary and tertiary foreground treatments can instead composite opacity over their background.

`systemColor` accepts red, orange, yellow, green, mint, teal, cyan, blue, indigo, purple, pink, brown, gray and gray2 through gray6. Values resolve by the accepted document appearance. Fixed RGB artwork remains app-owned. Automatic leading List `Label` symbols use app tint, or a local `ControlStyleProvider` tint, while titles retain primary/destructive roles and explicitly coloured Symbols retain their colour.

For application-owned artwork variables use `:root[data-satin-appearance='dark']`. A `:where(html[...])` selector has zero specificity and loses against an authored `:root` declaration. Normal-contrast iOS 27 values are measured; increased contrast and Display P3 are outside this contract.

The framework also owns glass, press-feedback and motion variables. Their presence in implementation CSS is not an application styling API. Do not override them to invent material, spring or gesture behavior. Keep decorative painted SVG content visible to the glass renderer with `role="presentation"` and `focusable="false"`; its enclosing control provides its accessible label.
