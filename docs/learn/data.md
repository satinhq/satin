# Data

In this guide you save notes, a preference and an unfinished draft. It takes about fifteen minutes.

You need:

- An app from [Quick start](quick-start.md).
- React state basics and a browser with IndexedDB.

## 1. Save a note

Define the database outside the screen. Each saved note has an id and a title.

<!-- example: data -->

```tsx
import { useState } from 'react'
import {
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
  defineDatabase,
  collection,
  useQuery,
  useAppStorage,
  useSceneStorage,
  Button,
  List,
  Section,
  Screen,
  TextField,
  Toggle,
  LabeledContent,
} from '@satinhq/kit'
import '@satinhq/kit/styles.css'
import { app as appInput } from './app'

type Note = { id: string; title: string }
const db = defineDatabase({
  name: 'docs-notes',
  version: 1,
  collections: { notes: collection<Note>({ key: 'id' }) },
})
function Notes() {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useSceneStorage('draft', '')
  const [offline, setOffline] = useAppStorage('offline', true)
  const { data: notes, loading, error } = useQuery(db.notes)
  async function save() {
    if (!draft.trim()) return
    try {
      await db.notes.put({ id: crypto.randomUUID(), title: draft.trim() })
      setDraft('')
      setSaveError(null)
    } catch {
      setSaveError('Could not save the note. Try again.')
    }
  }
  return (
    <Screen>
      <List id="notes">
        <Section header="Preferences">
          <Toggle label="Offline reading" isOn={offline} onChange={setOffline} />
        </Section>
        <Section header="New note">
          <TextField label="Title" value={draft} onChange={setDraft} />
          <Button onPress={() => void save()} disabled={!draft.trim()}>
            Save Note
          </Button>
        </Section>
        {saveError && <Section footer={saveError}>Save failed</Section>}
        <Section header="Saved notes">
          {loading
            ? 'Loading notes'
            : error
              ? 'Could not load notes'
              : notes?.map(note => (
                  <LabeledContent key={note.id} label={note.title} value="Saved" />
                ))}
        </Section>
      </List>
    </Screen>
  )
}
const routes = defineRoutes({
  notes: route(Notes, { title: 'Notes', titleDisplay: 'large' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'notes' } })
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
runApp({
  app: defineApp(appInput),
  routes,
  navigation,
})
```

Click Title, type Train tickets, then click Save Note. Reload the preview to see the saved record.

What the code does:

- `collection` describes keyed records in IndexedDB. Records keep their identity when a list changes.
- `useQuery` observes the collection, like SwiftData's `@Query`. It reports loading and errors separately from records.
- `useAppStorage` keeps a small preference, like `@AppStorage`.
- `useSceneStorage` keeps the draft with this navigation entry, like `@SceneStorage`.

## 2. Keep the storage names stable

Keep the database name and preference keys stable across releases. Increment the database version and supply migrations when saved record shapes change. See [Local data](../data.md) for migrations and backups.

## 3. Store drafts separately from presentation

The second argument to each storage hook is its initial value. Keep sheet and alert visibility in `useState(false)`. A saved draft can survive a relaunch while its presentation starts closed.

## Good to know

- The example saves notes in an IndexedDB collection, keeps the preference in app storage and keeps the unfinished title in scene storage.
- This example reports loading, read failure and failed writes. The draft stays available after a failed save so you can retry.

## Next steps

- [Local data and backups](../data.md)
- [Lists and forms](lists-and-forms.md)
- [Sheets and alerts](sheets-and-alerts.md)
