# Build a list app

In this guide you build a reading list with a field for adding books. It takes about 15 minutes.

You need:

- A Satin app from [Quick start](quick-start.md).
- React state and component basics.

## 1. Add the reading screen

Replace the first screen with this program. Each book becomes a LabeledContent row.

<!-- example: lists-and-forms -->

```tsx
import { useState } from 'react'
import {
  Button,
  LabeledContent,
  List,
  Screen,
  Section,
  TextField,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
} from '@satinhq/kit'
import { app as appInput } from './app'

function ReadingList() {
  const [title, setTitle] = useState('')
  const [books, setBooks] = useState(['Middlemarch', 'Persuasion'])
  function addBook() {
    if (!title.trim()) return
    setBooks([...books, title.trim()])
    setTitle('')
  }
  return (
    <Screen>
      <List id="reading-list">
        <Section header="Add a book">
          <TextField label="Title" value={title} onChange={setTitle} onSubmit={addBook} />
          <Button onPress={addBook} disabled={!title.trim()}>
            Add Book
          </Button>
        </Section>
        <Section header="Reading">
          {books.map((book, index) => (
            <LabeledContent key={index} label={book} value="To read" />
          ))}
        </Section>
      </List>
    </Screen>
  )
}

const routes = defineRoutes({
  reading: route(ReadingList, {
    title: 'Reading list',
    titleDisplay: 'large',
  }),
})
const navigation = defineNavigation(routes, { stack: { root: 'reading' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: defineApp(appInput), routes, navigation })
```

Click Title, type Beloved, then click Add Book.

What the code does:

- `Screen` supplies the screen title.
- `List` and `Section` group content, to create grouped rows.
- React state and setter functions supply controlled values, for editable content.

## 2. Bind the new title

TextField receives the current string and its setter. The Add Book button is disabled while the trimmed title is empty.

## 3. Add a row

`addBook` appends the title and clears the field. `List` provides scrolling and Section groups the editor above the books.

## Edit a collection of items

Use a stable ID for each draft row. Put `ForEach` directly in a `Section`, render a
`TextField` for each item, and append a new item from a Button. `onDelete` receives
row offsets, which `removing` applies to the current array.

```tsx
import { useState } from 'react'
import { Button, Form, ForEach, Section, TextField, removing } from '@satinhq/kit'

function IngredientsForm() {
  const [items, setItems] = useState([{ id: 'first', text: '' }])
  const [newItemID, setNewItemID] = useState<string | null>(null)

  function addIngredient() {
    const id = crypto.randomUUID()
    setItems(current => [...current, { id, text: '' }])
    setNewItemID(id)
  }

  return (
    <Form id="ingredients">
      <Section header="Ingredients">
        <ForEach
          data={items}
          onDelete={offsets => setItems(current => removing(current, offsets))}
        >
          {item => (
            <TextField
              label="Ingredient"
              value={item.text}
              autoFocus={item.id === newItemID}
              onChange={text => setItems(current => current.map(row =>
                row.id === item.id ? { ...row, text } : row
              ))}
            />
          )}
        </ForEach>
        <Button onPress={addIngredient}>Add Ingredient</Button>
      </Section>
    </Form>
  )
}
```

The new row's `autoFocus` moves editing to it when it mounts. Existing rows keep
their IDs while typing and deleting, so their fields retain identity. Do not use
array offsets as IDs or schedule focus with a timeout.

For a sheet, put this Form in the sheet route's `Screen` under a
`NavigationStack modal`, as shown in [Sheet](../components/sheet.md). Give the
screen one Form; reuse the Section inside that Form when adding other fields.
The Form owns keyboard avoidance and scrolling. `onDelete` supplies swipe actions.
Keep the array as draft state and save it when the user confirms.

## Next steps

- [Add it to the Home Screen](installing-and-updates.md): install the app and open it like any other.
- [Screens and navigation](screens-and-navigation.md): push detail screens and add tabs.
- [List](../components/list.md) and [Form](../components/form.md): every row style and section option.
