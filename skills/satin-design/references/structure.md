# Structure and navigation

## Hierarchy comes from content

Decide what the person comes to the app to do most often, and put that on the first screen with
nothing in front of it. Everything else is one level further away.

- **Root screen:** a large title and the primary list. The title names the place ("Today",
  "Library"), not the app or a greeting.
- **Detail screen:** pushed from a row, with an inline title naming the record. Its content is
  grouped sections: the facts first, history or related items next, actions such as Delete last.
- **Editor:** a sheet with Cancel on the leading side, Save (or Add, or Done) on the trailing side,
  and a form inside.
- **Settings or secondary destinations:** a tab once they matter every week; otherwise a row or a
  toolbar menu on the root screen.

One primary scroller per screen. No content above the large title, no banners pinned below the
navigation bar, no second scroll area inside the first.

## Choosing push, tab or sheet

| The person is... | Pattern |
| --- | --- |
| Going deeper into one thing | Push |
| Moving between peer areas they return to | Tab (two to five) |
| Creating or editing something quickly, then coming back | Sheet |
| Confirming something they can't undo | Confirmation dialog |
| Reading a short message that needs a decision | Alert |
| Switching how one list is filtered | Segmented picker at the top of the content |
| Choosing from a long list of options | Push a picker screen (`Picker pickerStyle="navigationLink"`) |
| Choosing from a few options | Menu picker, or inline picker rows |

Tabs are places, not actions. Never make "Add" a tab. Never put a tab bar inside a sheet.

## Rows

Lists are the backbone of iOS apps. Use the framework's rows; their heights, insets, separators and
press feedback match the system.

- Navigation row: `NavigationLink`, with an optional symbol or `RowIcon` tile and a trailing value.
- Value row: `LabeledContent` (label leading, value trailing in secondary color).
- Action row: `Button` in a list. Destructive actions use `role="destructive"` and sit in their
  own section at the end.
- Toggle, stepper and picker rows: the controls themselves; they adapt to list rows.
- Section headers are short nouns ("History", "Reminders"). Footers explain a setting in one or
  two sentences.

Keep paragraphs out of rows. A row has a title, maybe a subtitle, maybe a trailing value.

## Content beyond lists

Some screens are not lists: a photo grid, a chart, a large timer. Build those with `ScrollView`,
the stacks and lazy grids, and keep the same rules: one scroller, framework insets, a navigation
title, toolbar actions. A single standout element (a big number, a ring, a chart) can lead a detail
screen; give it room and let the grouped rows follow.

## iPhone and iPad

- iPhone: a tab bar at the bottom (or a single stack), large titles on root screens, sheets for
  editing.
- iPad: the same app works full screen by default. Add columns on purpose with
  `NavigationSplitView` when the app is a list of things and their details (mail, notes, files).
  Offer the iPad tab sidebar with `tabViewStyle="sidebarAdaptable"` when there are several tabs.
- Wide windows: keep text in a readable column (about 600 to 700 points), and don't stretch rows of
  buttons across the screen. Let grids add columns instead of growing cells.
- Decide layout from the size class (`useHorizontalSizeClass`), never from the device name or pixel
  width.

## Toolbars

- Trailing: the screen's primary action (Add, Edit, Share). One or two items.
- Leading: Back (automatic), or Cancel in an editor.
- Bottom bar: actions that apply to the whole screen's content, or search on iPhone.
- More than three actions belong in a `Menu` behind a single button.
- Text buttons for words that matter ("Done", "Save"); symbols for universal actions (plus,
  share, ellipsis).
