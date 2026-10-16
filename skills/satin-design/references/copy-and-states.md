# Copy and states

## Words

- **Actions are verbs:** Add Habit, Save, Delete Habit, Start Workout. A button says what happens.
  Keep the same word through the flow: the "Delete" button leads to a "Delete Habit?" dialog.
- **Places are nouns:** tabs and screen titles name what's there ("Today", "History"), not what
  the app is ("My Habit Tracker") or a greeting ("Good morning!").
- **Short and plain.** Sentence-length labels belong in footers, not rows. No exclamation marks,
  slogans, "Success!", or "Oops!".
- **The person's language, not the system's.** "Couldn't save your habit" rather than
  "IndexedDB transaction failed".
- **Title case** for buttons, titles and tab names; **sentence case** for headers, footers and
  messages.

## Empty states

An empty screen is the start of something. Use `ContentUnavailableView` with a symbol, a short
title, one line of description and the action that fills it:

- First use: "No Habits Yet", "Add a habit to start tracking it.", Add Habit.
- No search results: "No Results for 'run'", Clear Search. Don't show the first-use message for an
  empty search.
- Never show an empty state while data is still loading, or when loading failed.

## Loading

- Keep showing the last content while refreshing. Most local reads are fast enough to need no
  indicator at all.
- For longer work, a `ProgressView` in place, with a short label if it will take a while.
- No full-screen spinners for local writes, no skeleton screens, no custom loaders.

## Errors

Say what failed and what to do next, in one or two sentences, with the action as a button: "Couldn't
save this habit. Check that there's space on your iPhone and try again." Retry. Keep everything the
person typed. Show errors where they happened (in the section or the sheet), not as a toast.

## Saving

Save means saved. Only say "Saved" after the write finished. Most native apps don't announce saves
at all; the item simply appears in the list.

## Destructive actions

- Put Delete last, in its own section, in red (`role="destructive"`).
- Ask first with a `ConfirmationDialog` that names what will be lost ("Delete 'Run' and its 42
  check-ins?") and offers Cancel.
- Swipe to delete in lists is fine without a dialog when the item is easy to recreate; ask when it
  takes history with it.

## Permissions

Ask only when the person chooses the feature, and say exactly what they get: "Get a reminder at the
time you choose." Never ask at launch.
