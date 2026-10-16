# Spacing and shape

## Spacing: use the framework's

Lists, forms, bars and sheets already apply native margins, row heights, section spacing and safe
area insets. Most spacing bugs come from adding more.

- Don't pad a `List`, wrap it in a container with margins, or add gaps between sections.
  `listSectionSpacing="compact"` is the native way to tighten sections.
- In free-form content, `padding` with no value is the standard 16-point margin. Space related
  items 8 points apart and separate groups by 16 to 20.
- Align custom content to the same leading edge as list rows, so text lines up down the screen.
- Touch targets are at least 44 by 44 points, even when the visible symbol is smaller.
- Let content breathe on large screens by constraining width, not by adding padding.

## Shape: continuous, concentric, and capsules where they belong

iOS corners are continuous: the curve eases into the straight edge instead of meeting it at a
circular arc. Framework surfaces (list groups, buttons, sheets, menus, glass) draw their own
corners; leave them alone.

For shapes you draw yourself:

- **Concentric corners.** A rounded shape inside another rounded shape shares its center of
  curvature: inner radius = outer radius minus the inset between them. `concentricRadius(outer,
  inset)` computes it, and `useDisplayCornerRadius()` gives the screen's own radius for content that
  reaches the display edge. Mismatched nested radii are the most visible shape error.
- **Capsules** suit things that are a single line tall and act like controls: buttons, tags,
  search fields, segmented selections. `buttonBorderShape="capsule"` asks for one.
- **Rounded rectangles** suit containers: cards, image tiles, grouped sections. Keep radii
  consistent within a screen and scale them with the element's size (small tiles around 8 to 10
  points, cards around 16 to 26).
- **Circles** suit avatars and single symbols.
- CSS `border-radius` draws circular corners, not continuous ones. It is close enough for custom
  content at these radii; don't try to fake the continuous curve with clip paths or SVG masks on
  every element.

## Direction wins here too

If the design calls for ovals, sharp corners, blobs or hand-drawn outlines, draw them. Shape is part
of a brand. Nothing in the framework or its lint rules checks your shapes. Keep only the behaviour:
44-point targets, readable content, framework controls underneath.
