---
name: satin-design
description: Design defaults for Satin apps, so an installable iPhone or iPad web app looks and feels like a native iOS app instead of a website. Covers screen structure, navigation patterns, iPhone and iPad layout, system text styles, semantic color and tint, spacing, corner shapes, glass and materials, motion, symbols and app icons, copy, empty and error states, and accessibility. It also explains how to apply a custom brand (fonts, colors, shapes, illustration) while keeping native behaviour. Use when designing, laying out, styling or reviewing the look of screens in a project that imports '@satinhq/kit'. The user's own design direction always takes precedence over these defaults.
license: MIT
metadata:
  version: '0.1.0'
---

# Satin design defaults

This skill is the default path to an app that looks and feels like it belongs on an iPhone, for the
design choices nobody else has made.

## Their direction wins

If the user, their brand guide or another design skill gives a direction (a typeface, a palette, an
oval button, a hand-drawn look), follow it exactly. Use these defaults only for the choices nobody
made. Never argue a user back to the defaults, and never "correct" a deliberate brand choice toward
iOS styling. No test or lint rule checks your colors, fonts or shapes.

What stays native regardless of direction is behaviour, because that is what makes the app feel
real in the hand:

| Yours to choose | Stays native |
| --- | --- |
| Typeface, weights, type personality | Text scales with the user's text size; nothing is clipped |
| Palette, tint, backgrounds, illustration | Light and dark both work; contrast stays readable |
| Corner shapes, borders, card styles, imagery | Touch targets of at least 44 points |
| Icon artwork, app icon, empty-state art | Gestures: back swipe, sheet drag, swipe actions, pull to refresh |
| Copy voice and tone | Navigation: push, tabs, sheets and their motion |
| Layout of your own content | Safe areas, keyboard avoidance, scroll behaviour |
| How much glass you use on your own chrome | Glass sits on controls above content, never on the content itself |
| | Reduce Motion, VoiceOver labels, focus order |

[references/custom-brand.md](references/custom-brand.md) shows how to apply a brand without breaking
the right-hand column.

## The default path

When nobody has given a direction, build what a well-made iOS app would show:

1. **Start from the person's repeated task.** A habit tracker opens on today's habits with one tap
   to check each off, not on a dashboard of charts. Add a second tab only when there is a second
   place worth going.
2. **Let structure come from content.** Records, settings and forms are `List` and `Section`
   rows. Details are pushed. Short edits are sheets. Destructive choices are confirmation dialogs.
3. **Use the system's look.** System font in the system text styles, semantic colors, one tint,
   grouped list backgrounds, framework spacing. Framework bars, tab bars and toolbar buttons are
   already glass.
4. **Put controls on glass and content on solid ground.** Content stays readable on plain
   backgrounds; glass is for the layer of controls floating over it.
5. **Keep the framework's motion.** Don't add animations to things that already move, and don't
   tune springs.
6. **Make every state useful.** Empty, loading and error screens each say what's going on and offer
   the next action.

## Defaults for the decisions that come up most

- **Tint:** set one `appearance.tint` in `defineApp`. Use it for everything interactive or
  selected: buttons, links, checkmarks, selected days, progress. Nothing else gets a brand color by
  default.
- **Status symbols:** a done item shows `checkmark.circle.fill` in the tint; an open one shows
  `circle` in `semanticColor('secondaryLabel')` so the active control stays visible in light and
  dark. `SymbolImage` draws in the current text color, so color it with
  `style={{ color: semanticColor('tint') }}`. A `buttonStyle="plain"` button draws its label in the
  primary color and ignores `tint`, as on iOS.
- **Rows:** one `Section` holds many rows. Don't give each record its own section or card. Leave
  `listRowInsets` alone so rows line up with the rest of the system.
- **Data visualisation** (history grids, charts, rings): tint for "done", a system fill for "not
  done", secondary text for labels. No black blocks, no legends when a symbol explains itself.
- **Actions on a detail screen:** rows at the end: a tinted `Button` row ("Rename Habit"), then a
  destructive one ("Delete Habit") that asks first.
- **Adding something:** a toolbar `+` button opens a sheet with Cancel and Add. Don't expand an
  inline form inside the list.
- **Secondary text:** `foregroundStyle="secondary"` (or `semanticColor('secondaryLabel')` in CSS),
  one step down in text style. No hint paragraphs explaining how to use the screen.
- **Custom CSS:** only for content the framework doesn't draw. Colors come from `semanticColor`,
  `systemColor` or the tint; sizes come from text styles; corners follow
  [references/spacing-and-shape.md](references/spacing-and-shape.md).

Before you write custom CSS or design something the framework doesn't draw, read the reference for
that area below. Each one is short.

## It's an app, not a website

Agents fluent in React tend to build web dashboards. Most of what that habit produces looks wrong on
an iPhone:

| Web habit | Native default |
| --- | --- |
| A hero banner or welcome header | A large title, then the content |
| Every item in its own shadowed card | Rows in an inset grouped `List` section |
| A stats grid at the top of the screen | The list itself; numbers go in rows or a detail screen |
| A custom header bar with buttons | `Screen` title and `toolbar` |
| A floating "+" button in the corner | An add button in the toolbar |
| Hover states and cursor styles | Press feedback from framework controls |
| A custom spinner or skeleton blocks | `ProgressView`, or keep showing the last content |
| A full-width blue submit button at the bottom of a form | Save in the sheet's toolbar |
| Gradients, glows and drop shadows for depth | Grouped backgrounds, separators and glass for depth |
| Centered text everywhere | Leading-aligned text, as iOS reads |
| Pill tabs inside the page | `TabView` for destinations, segmented `Picker` for filters |
| `alert()` / toast notifications | `Alert`, inline status text, or nothing at all |

When a brand calls for cards, gradients or a bold header, that is their direction; build it. The
table describes defaults, not a ban.

## References

Load the one that matches the decision in front of you.

| Decision | native reference |
| --- | --- |
| What goes on a screen, iPhone vs iPad, push vs tab vs sheet | [references/structure.md](references/structure.md) |
| Fonts, sizes, weights, Dynamic Type | [references/typography.md](references/typography.md) |
| Tint, semantic colors, light and dark | [references/color.md](references/color.md) |
| Spacing, insets, corner shapes, capsules | [references/spacing-and-shape.md](references/spacing-and-shape.md) |
| Glass, materials, depth | [references/materials.md](references/materials.md) |
| Animation and feedback | [references/motion.md](references/motion.md) |
| Symbols, images, the app icon | [references/icons.md](references/icons.md) |
| Labels, empty, loading and error states, destructive actions | [references/copy-and-states.md](references/copy-and-states.md) |
| Text size, VoiceOver, contrast, Reduce Motion | [references/accessibility.md](references/accessibility.md) |
| Applying a custom brand | [references/custom-brand.md](references/custom-brand.md) |

For how to build it correctly (APIs, data, lint), load `satin-best-practices`.

## Check it like a designer

Before you call a screen done, look at it in WebKit at phone width, light and dark. Ask whether
someone glancing at it on their phone would take it for a native app, and whether anything on it is
there only because a web page would have it. Remove that thing.
