# Accessibility

Accessibility is behaviour, so it stays native whatever the brand.

## Text size

- Use the text styles (or `useScaledMetric` for custom sizes) so text follows the person's
  setting.
- Let text wrap and rows grow. Never fix a text container's height or force one line on a label
  that matters.
- At the largest accessibility sizes, side-by-side layouts may need to stack; `ViewThatFits` can
  choose between a horizontal and a vertical arrangement.

## VoiceOver

- Every screen has a meaningful title; the framework exposes it and manages focus after navigation.
- Every icon-only button has `iconOnly` and an `aria-label` that names the action ("Add Habit",
  not "Plus").
- Toggles, pickers and fields have labels, even when the visual design hides them.
- Decorative images and symbols take their meaning from their control. Inside glass, mark
  decorative SVG `role="presentation"` and `focusable="false"` rather than `aria-hidden`.
- Don't add hidden headings or live announcements of screen titles; the framework handles focus.

## Contrast and color

- Text contrast at least 4.5:1, and 3:1 for large text and essential icons. Check light tints and
  brand colors in both appearances.
- Never use color alone to carry meaning. A completed habit gets a checkmark, not just a green
  row.

## Touch

- Targets at least 44 by 44 points.
- Every gesture has a visible alternative: swipe actions also appear in context menus or edit mode.

## Motion

- Anything you animate must still make sense with Reduce Motion on.
- No flashing or looping motion.

## Check

Before calling a screen done: largest text size, VoiceOver labels on every control, both
appearances, and Reduce Motion. VoiceOver speech and order need a real device to confirm.
