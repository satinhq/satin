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
import '@satinhq/kit/styles.css'
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

## Next steps

- [Add it to the Home Screen](installing-and-updates.md): install the app and open it like any other.
- [Screens and navigation](screens-and-navigation.md): push detail screens and add tabs.
- [List](../components/list.md) and [Form](../components/form.md): every row style and section option.
