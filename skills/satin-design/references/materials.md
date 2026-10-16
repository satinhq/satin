# Glass and materials

## Controls float; content stays solid

iOS separates two layers. Content (lists, text, photos) sits on solid backgrounds. Controls that
float over content (navigation bars, tab bars, toolbar buttons, menus, sheets) are glass: they let
the content show through, bent and blurred, so the person always knows what's underneath.

The framework already makes every bar, tab bar, toolbar item, menu and sheet glass. A default app
needs no glass code at all.

## When to add glass yourself

Use `GlassEffect` (with `Glass.regular`, or `Glass.clear` over rich media) only for app-specific
controls that float over content: a player's transport controls, a map's floating buttons, a camera
overlay. Group neighbouring pieces in a `GlassEffectContainer` so they blend and morph together.

Don't put glass on:

- list rows, cards or sections (content, not controls);
- paragraphs or error messages (they need a solid, readable surface);
- the whole screen background;
- glass already inside glass.

## Depth without glass

Native screens show depth through layering, not shadows: the grouped background behind the rows,
the bar edge effect as content scrolls under, the dimmed screen behind a sheet. Leave drop shadows
off cards and rows by default. If a brand calls for elevated cards, keep shadows soft and use one
level.

## Never imitate

Don't fake glass with `backdrop-filter`, translucent white panels, blurred images or another
library. It won't refract, it won't match the framework's glass beside it, and lint flags it. If the
framework's glass shows a defect, report it rather than replacing it.
