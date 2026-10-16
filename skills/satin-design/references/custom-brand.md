# Applying a custom brand

A Satin app can look like anything. What keeps it feeling native is behaviour: how it navigates,
scrolls, responds to touch and adapts to the person's settings. Change the look freely; keep the
behaviour.

## Order of authority

1. What the user asks for in this conversation.
2. Their brand guide, design files or existing app.
3. Another design skill they've installed or named.
4. These defaults, for whatever none of the above decided.

If two sources conflict, the higher one wins. If the user's direction makes a default impossible
(a black-and-white brand has no tint), drop the default without comment.

## How each part of a brand maps

| Brand element | Where it goes | Keep |
| --- | --- | --- |
| Primary color | `appearance.tint` | Contrast for text on it; a dark-mode value |
| Secondary colors | Category colors, `RowIcon` tiles, illustration, charts | Meaning not carried by color alone |
| Background color | Screen backgrounds in your CSS, launch backgrounds in `defineApp` | Both appearances; readable rows on top |
| Typeface | Titles, headings, large numbers; body if the brand insists | Scaling with `useScaledMetric`; inputs at 16pt or more |
| Corner style | Your own cards, tiles, images and custom buttons (`buttonBorderShape`) | 44pt targets |
| Illustration | Empty states, onboarding, headers of detail screens | Real text for anything that must be read |
| Icon style | `SymbolProvider` glyphs, app icon | Labels on icon-only controls |
| Voice | All copy | Clear actions and honest errors |

## What not to rebuild

A brand never needs a hand-built version of these. Style around them, or style them through their
props:

- the navigation bar, back button, large title and back swipe;
- the tab bar;
- sheets, alerts, dialogs and menus;
- list scrolling, swipe actions and pull to refresh;
- text fields and the keyboard;
- framework glass.

If a brand asks for a custom tab bar or header, first try the framework's with brand color, symbols
and type. If it truly must differ, tell the user what native behaviour they'd lose (back swipe,
scroll edge effects, VoiceOver focus) before building it.

## Example: a playful habit app

Brief: "Make it feel warm and playful, our color is coral #FF6F59, we use the Nunito font."

- Tint `#FF6F59`; check white text on it, darken for text-on-coral if needed.
- Nunito for the large numbers and section titles via `font-family` on your own elements, sized with
  `useScaledMetric`; system font kept for row text unless they want Nunito everywhere.
- `fontDesign="rounded"` would have been the default for playful; the brand font replaces it.
- Habit tiles with generous corners (24pt) and a soft coral wash in light mode, deep coral in dark.
- Still: `List` rows for habits, pushed details, a sheet to add, the framework's tab bar and
  toolbar, framework motion.
