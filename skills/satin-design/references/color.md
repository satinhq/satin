# Color

## Default: one tint, semantic everything else

Native apps get most of their color from roles, not hex values. That's why they look right in light
and dark without extra work.

- **Pick one tint** and set it as `appearance.tint` in `defineApp`. It colors buttons, links,
  selected states, toggles and leading row symbols. If no direction is given, the system blue is a
  fine default, or choose a tint that fits the subject (green for habits, orange for cooking).
- **Text** uses `semanticColor('label')`, `secondaryLabel`, `tertiaryLabel`, or `foregroundStyle`
  `primary`, `secondary`, `tertiary` on `Text`.
- **Backgrounds** come from the framework: the grouped list background and its row fills. In custom
  content use the system and grouped background roles of `semanticColor`.
- **Fills and separators** use the fill and separator roles, never a hand-picked grey.
- **Category colors** (tags, calendars, habit colors) use `systemColor('red' | 'orange' | ...)`.
  They are tuned for both appearances.

## Restraint

- Color means something: tint for "you can tap this", red for destructive, green for done. Don't
  spend those meanings on decoration.
- Don't color body text with the tint.
- Keep row backgrounds neutral. Use a colored `RowIcon` tile or symbol for identity instead.
- No gradients, glows or colored shadows by default. iOS uses depth from layering and materials.
- White text on the tint needs enough contrast; check light tints such as yellow and mint.

## Light and dark

- Everything must work in both. Semantic and system colors switch on their own.
- For your own colors, define both values: CSS variables under
  `:root[data-satin-appearance='dark']`, or read `useColorScheme()` in code. Never use the
  raw `prefers-color-scheme` media query.
- Dark mode is not inverted light mode. Backgrounds go to true black at the base and lift in steps
  of grey for grouped content; the system roles already do this.
- Set `appearance.background` and `appearance.darkLaunch.background` so the launch screen matches
  the first screen in each appearance.

## A brand palette

Map the brand's colors onto roles instead of painting surfaces:

- The primary brand color becomes the tint.
- Secondary brand colors become category colors, illustration and icon tiles.
- A brand background color can replace the grouped background if the brand asks for it; give it a
  dark counterpart and keep text contrast at least 4.5:1.
