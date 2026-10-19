import { useState } from 'react'
import {
  Button,
  ContentUnavailableView,
  Form,
  LabeledContent,
  List,
  NavigationLink,
  Screen,
  Section,
  Selectable,
  TextField,
  ToolbarItemGroup,
  useNavigation,
  useQuery,
  useRecord,
  useSceneStorage,
} from '@satinhq/kit'
import { app } from './app'
import { db } from './data'

export function HomeScreen() {
  const [search, setSearch] = useSceneStorage('search', '')
  const saved = useQuery(db.favourites)
  const navigation = useNavigation()
  return (
    <Screen
      searchable={{ text: search, onTextChange: setSearch, prompt: 'Search saved items' }}
      toolbar={
        <ToolbarItemGroup placement="topBarTrailing">
          <Button
            symbol="plus"
            iconOnly
            aria-label="New item"
            onPress={() =>
              navigation.push('detail', { id: crypto.randomUUID(), title: 'New item' })
            }
          />
        </ToolbarItemGroup>
      }
    >
      <List id="home">
        {saved.error && <Selectable role="alert">{String(saved.error)}</Selectable>}
        <Section>
          {saved.data
            .filter(item => item.label.toLowerCase().includes(search.toLowerCase()))
            .map(item => (
              <NavigationLink key={item.id} to="detail" params={{ id: item.id, title: item.label }}>
                {item.label}
              </NavigationLink>
            ))}
          {!saved.loading && saved.data.length === 0 && (
            <ContentUnavailableView
              title="No saved items"
              description="Tap Add to create your first item."
              symbol="bookmark"
            />
          )}
        </Section>
      </List>
    </Screen>
  )
}

export function DetailScreen({ id, title }: { id: string; title: string }) {
  const saved = useRecord(db.favourites, id)
  const [label, setLabel] = useState(title)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await db.favourites.put({
        id,
        label: label.trim(),
        savedAt: saved.data?.savedAt ?? Date.now(),
      })
      setMessage('Saved on this device.')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Form id="detail">
      <Section>
        <TextField label="Title" value={label} onChange={setLabel} />
        <Button disabled={saving || !label.trim()} onPress={() => void save()}>
          Save
        </Button>
      </Section>
      {message && <Selectable role="status">{message}</Selectable>}
    </Form>
  )
}

export function SettingsScreen() {
  return (
    <Form id="settings">
      <Section>
        <NavigationLink to="data" symbol="externaldrive">
          Your data
        </NavigationLink>
        <LabeledContent label="App" value={app.name} />
      </Section>
    </Form>
  )
}

export function YourDataScreen() {
  const saved = useQuery(db.favourites)
  const [message, setMessage] = useState('')
  async function exportData() {
    try {
      const blob = await db.exportJSON()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'saved-items.json'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setMessage('Export ready. Keep the file somewhere safe.')
    } catch (error) {
      setMessage(String(error))
    }
  }
  return (
    <List id="your-data">
      <Section footer="Items are stored on this device. Export a copy before removing the app or clearing website data.">
        <LabeledContent label="Saved items" value={saved.data.length} />
        <Button onPress={() => void exportData()}>Export JSON</Button>
      </Section>
      {message && <Selectable role="status">{message}</Selectable>}
    </List>
  )
}
