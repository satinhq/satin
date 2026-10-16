# Searchable

Search configuration for a screen or list.

```tsx
import { LabeledContent } from '@satinhq/kit'
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

The automatic placement follows the screen and window size. Set `placement` only when you need `toolbar` or `navigationBarDrawer`.

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
