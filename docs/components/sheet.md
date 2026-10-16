# Sheet

A card that slides up over the current screen, for a short task or a closer look.

```tsx
import { Sheet } from '@satinhq/kit'
```

## Example

Keep whether the sheet is open in React state, and pass it to `isPresented`. When the person drags the sheet down, Satin calls `onPresentedChange(false)`.

<!-- example: sheet open -->

```tsx
import { useState } from 'react'
import { Button, List, Screen, Section, Sheet, Toggle } from '@satinhq/kit'

function SettingsButton() {
  const [showingSettings, setShowingSettings] = useState(false)
  const [wifi, setWifi] = useState(true)
  const [bluetooth, setBluetooth] = useState(false)

  return (
    <Screen>
      <List id="home">
        <Section>
          <Button onPress={() => setShowingSettings(true)}>Show Settings</Button>
        </Section>
      </List>
      <Sheet
        title="Settings"
        isPresented={showingSettings}
        onPresentedChange={setShowingSettings}
        detents={['medium', 'large']}
      >
        <List id="settings">
          <Section>
            <Toggle label="Wi-Fi" isOn={wifi} onChange={setWifi} />
            <Toggle label="Bluetooth" isOn={bluetooth} onChange={setBluetooth} />
          </Section>
        </List>
      </Sheet>
    </Screen>
  )
}
```

## Choose the heights

`detents` lists the heights the sheet can rest at, from shortest to tallest. The default is `['large']`, a full-height card. A detent is `'medium'`, `'large'`, `{ height }` in points, or `{ fraction }` of the available height.

<!-- example: sheet-detents -->

```tsx
<Sheet
  title="Filters"
  isPresented={showingFilters}
  onPresentedChange={setShowingFilters}
  detents={[{ height: 240 }, 'medium', 'large']}
>
  <List id="filters">
    <Section>
      <Toggle label="Unread" isOn={unread} onChange={setUnread} />
      <Toggle label="Flagged" isOn={flagged} onChange={setFlagged} />
    </Section>
  </List>
</Sheet>
```

To know or set the current height, pass `selection` and `onSelectionChange`.

## Show or hide the grabber

By default the grabber appears only when there is more than one detent to drag between, as in native iOS. Use `dragIndicator="visible"` or `"hidden"` to choose.

## Keep the sheet open while editing

`interactiveDismissDisabled` stops the swipe-down gesture, so unsaved edits are not lost by accident. Give the person a Cancel or Done button instead.

<!-- example: sheet-editing -->

```tsx
<Sheet
  title="New List"
  isPresented={showingEditor}
  onPresentedChange={setShowingEditor}
  interactiveDismissDisabled={name !== ''}
>
  <Form id="new-list">
    <Section>
      <TextField label="Name" prompt="Groceries" value={name} onChange={setName} />
    </Section>
    <Section>
      <Button onPress={() => setName('')}>Clear</Button>
    </Section>
  </Form>
</Sheet>
```

## Close the sheet from inside

Call `useDismiss()` in a component inside the sheet. It closes the sheet, even when swipe-down is disabled. In a screen pushed inside the sheet, it goes back one screen instead.

<!-- example: sheet-dismiss -->

```tsx
import { useState } from 'react'
import { Button, List, Screen, Section, Sheet, useDismiss } from '@satinhq/kit'

function DoneButton() {
  const dismiss = useDismiss()
  return <Button onPress={dismiss}>Done</Button>
}
```

## Navigate inside a sheet

Put `<NavigationStack modal root="editor" />` inside the sheet. The sheet gets its own title bar, toolbar and back stack, separate from the screen behind it. See the [short sheets recipe](../app-recipes.md#short-sheets-with-independent-navigation).

## Good to know

- Sheets start closed when the app relaunches, as in native apps. Keep `isPresented` in `useState`, not in `useSceneStorage`. Save drafts separately.
- The `title` is drawn as the sheet's header. `titleVisibility="hidden"` keeps it only as the accessible name, for content that fills the card.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `isPresented` | `boolean` | Whether the sheet is open. Required. |
| `onPresentedChange` | `(presented: boolean) => void` | Called when the person dismisses the sheet. Required. |
| `title` | `string` | Header text and accessible name. Required. |
| `children` | `ReactNode` | What the sheet shows. |
| `detents` | `PresentationDetent[]` | Resting heights. Default `['large']`. |
| `selection` | `PresentationDetent` | The current detent, when you control it. |
| `onSelectionChange` | `(detent) => void` | Called when the person drags to another detent. |
| `dragIndicator` | `'automatic' \| 'visible' \| 'hidden'` | Grabber visibility. Default `'automatic'`. |
| `interactiveDismissDisabled` | `boolean` | Turns off swipe-to-dismiss. Default `false`. |
| `titleVisibility` | `'visible' \| 'hidden'` | Hides the drawn header. Default `'visible'`. |
| `onDismiss` | `() => void` | Called after the sheet has closed. |

`PresentationDetent` is `'medium' | 'large' | { height: number } | { fraction: number }`.

Related: [FullScreenCover](./full-screen-cover.md), [Alert](./alert.md), `useDismiss`.
