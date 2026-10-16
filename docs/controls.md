# Controls

DatePicker and ColorPicker draw the native rows and open the system pickers: the same UIKit
calendar, time wheel and colour picker supplied by WebKit.

```tsx
import { ColorPicker, DatePicker, Form, ProgressView, Section } from '@satinhq/kit'
import { useState } from 'react'

function Settings() {
  const [due, setDue] = useState(new Date())
  const [tint, setTint] = useState('#0088ff')
  return (
    <Form id="settings">
      <Section header="Download">
        <ProgressView label="Downloading" value={40} total={100} />
        <ProgressView label="Waiting" />
      </Section>
      <Section header="Reminder">
        <DatePicker label="Due" selection={due} onSelectionChange={setDue} />
      </Section>
      <Section header="Appearance">
        <ColorPicker label="Tint" selection={tint} onSelectionChange={setTint}
          supportsOpacity={false} />
      </Section>
    </Form>
  )
}
```

ProgressView omits `value` for an indeterminate spinner. Determinate values clamp to `0...total`;
`total` defaults to 1 and must be finite and positive. Labels can be React content; use
`aria-label` for a label without meaningful accessible text. Tint inherits the control environment.
The spinner uses the refresh indicator's eight segments and animation.

## DatePicker

`DatePicker` uses the compact style by default in a Form: grey capsules
with the date and time. Tapping one opens the system date or time picker; its value turns the
tint colour while the picker is open. Changes arrive as the user picks.

The selection is a `Date` or a civil string, and the callback returns the same kind:

| Selection | `displayedComponents` | Meaning |
| --- | --- | --- |
| `Date` | any | A moment in time. Edits change its calendar fields in the device's time zone. |
| `'2026-10-14'` | `['date']` | A day. It is the same day in every time zone. |
| `'09:41'` | `['hourAndMinute']` | A time of day. |
| `'2026-10-14T09:41'` | both (the default) | A day and time with no time zone ("floating"). |

Use a civil string for things like due dates and birthdays, which must not move when the user
travels; use a `Date` for a moment such as a meeting start. Never build a civil date with
`new Date('2026-10-14')`: JavaScript reads that as UTC midnight, the previous day in the
Americas.

```tsx
const [due, setDue] = useState('2026-10-14')
<DatePicker label="Due" selection={due} onSelectionChange={setDue} displayedComponents={['date']} />
```

`in` sets the allowed range: `in={{ lowerBound: start, upperBound: end }}`, either bound optional,
using the same kind of value as the selection. A choice outside the range is clamped to the
nearest bound, as UIDatePicker does.
The capsule text uses the user's locale ("Oct 14, 2026", "9:41 AM" in US English).

Differences from native, all inside WebKit's system picker: it shows Reset and Done buttons
(Reset leaves the selection unchanged; a DatePicker always has a value); it sits in the middle of
the screen rather than under the capsule; and it doesn't grey out days outside `in`, so a day
past a bound is selectable there and then clamped. `graphical` and `wheel` styles are not
available yet.

## ColorPicker

`ColorPicker` is a row with the native colour well. Tapping the well opens the system colour
picker: grid, spectrum and sliders, the eyedropper, and saved colours. With `supportsOpacity`
(the default) it also shows the opacity slider.

The selection is sRGB `#RRGGBB` or `#RRGGBBAA`. The callback returns eight digits with
`supportsOpacity` and six without. A Display P3 colour chosen in the spectrum is converted to
sRGB. The system picker is titled "Colors" instead of the row's label.

Both controls take their disabled state from the control environment, and render an inert row
(with a console error) if their selection is malformed, so bad stored data doesn't crash a screen.

Controls adopt List/Form rows automatically. Inside an explicit ListRow they reuse its cell;
they do not create another row or another activation owner.

```tsx
import { List, Section, Text } from '@satinhq/kit'

<List id="compact-settings" listSectionSpacing="compact">
  <Section><Text>First</Text></Section>
  <Section header="Options"><Text>Second</Text></Section>
</List>
```

Compact section spacing follows the measured inset-grouped native reference allocation: 12 pt between
headerless sections, reduced allocation before a following header, and preserved footer-plus-header
space. Numeric spacing retains its existing explicit point-value contract. DisclosureGroup is
not available; use visible sections.

See [current limitations](limitations.md).

## Editing a list

`ForEach` identifies the rows; `onDelete` gives each row
swipe-to-delete and, in edit mode, the red delete control; `onMove` adds the reorder handle.
An `EditButton` in the screen's toolbar toggles edit mode for every list on that screen.

```tsx
import { EditButton, ForEach, List, ListRow, Screen, ToolbarItem, moving, removing } from '@satinhq/kit'

const [todos, setTodos] = useState(initialTodos)
const [selection, setSelection] = useState(new Set<string>())

<Screen toolbar={<ToolbarItem placement="topBarTrailing"><EditButton /></ToolbarItem>}>
  <List id="todos" selection={selection} onSelectionChange={setSelection}>
    <ForEach
      data={todos}
      onDelete={offsets => setTodos(todos => removing(todos, offsets))}
      onMove={(from, to) => setTodos(todos => moving(todos, { fromOffsets: from, toOffset: to }))}
    >
      {todo => <ListRow>{todo.title}</ListRow>}
    </ForEach>
  </List>
</Screen>
```

- **Offsets** are positions in `data` before the change: dragging the first of
  three rows below the second reports `toOffset` 2. `moving` and `removing` apply them and return
  a new array, so store the result.
- **Selection:** pass an id (or `null`) to select one row, or a `Set` to select many. A `Set`
  shows selection circles while editing, and taps toggle them. Outside edit mode a tap replaces
  the selection. Entering edit mode clears it.
- **Per row:** `ListRow` takes `moveDisabled`, `deleteDisabled` and `selectionDisabled`. A row's
  own trailing `swipeActions` replace swipe-to-delete.
- **Your own toolbar:** `useEditMode()` returns `[editMode, setEditMode]` for the same screen, so a
  bottom bar can follow edit mode.


## ProgressView styles

```tsx
<ProgressView value={0.4} progressViewStyle="circular" />
<ProgressView label="Loading" progressViewStyle="linear" />
```

`progressViewStyle` accepts `automatic`, `linear` and `circular`. Automatic selects the
value-dependent default. On iOS the explicit circular style draws an activity indicator even
with a value; an indeterminate linear style draws an empty track. These static cases follow
native Simulator measurements. The existing track and spinner remain their only renderers.
