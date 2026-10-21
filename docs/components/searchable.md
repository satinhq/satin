# Searchable

Search configuration for a screen or list.

```tsx
import { Screen, type Searchable } from '@satinhq/kit'
```

## Example

Click search and type Kyoto to filter the list.

<!-- example: searchable open -->

```tsx
import { useState } from 'react'
import { LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [query, setQuery] = useState('')
  const cities = ['Kyoto', 'Osaka', 'Tokyo']

  return (
    <Screen
      searchable={{
        text: query,
        onTextChange: setQuery,
        prompt: 'Find a city',
      }}
    >
      <List id="cities">
        <Section>
          {cities
            .filter(city => city.toLowerCase().includes(query.toLowerCase()))
            .map(city => (
              <LabeledContent key={city} label={city} value="Japan" />
            ))}
        </Section>
      </List>
    </Screen>
  )
}
```

## Filter the data

Searchable reports text changes. Your screen decides which results to show.

## Choose placement

Placement follows device idiom automatically. Existing apps gain iPad behavior when upgrading the kit; no opt-in or new props are required. On iPad, the field occupies the trailing navigation toolbar, expands left while keeping its right edge fixed, and uses an in-field clear button. Automatic sidebar search belongs below that column's toolbar. Explicit `toolbar` stays top-right even in a narrow iPad window. `navigationBarDrawer` keeps the column-owned drawer placement.

An empty iPad field collapses when it loses focus. Clearing ordinary toolbar search retains focus; submitting a nonempty query keeps it visible while dismissing the keyboard. In a search-role tab, clearing also dismisses search and restores the floating tab bar without changing the selected tab. Suggestions appear in a popover anchored to the field. Drawer scopes remain below the field.

The iPhone placement and separate Close control retain their existing behavior.

## Offer completions

Use `suggestions` for completions. Pass `scopes` with `selection` and `onSelectionChange` to control the selected scope. If you control `isPresented`, also supply `onPresentedChange`.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `text` | `string` | The query. |
| `onTextChange` | `(text: string) => void` | Receives changes. |
| `prompt` | `string` | The placeholder. |
| `placement` | `SearchFieldPlacement` | Automatic by default. |
| `scopes` | `SearchScopes` | A scope selector with `selection` and `onSelectionChange`. |
| `isPresented` / `onPresentedChange` | `boolean` / `(presented: boolean) => void` | Supply both when controlling presentation. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
