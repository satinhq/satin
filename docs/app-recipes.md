# Application recipes

These recipes are starting points for app code, built from the current `@satinhq/kit` exports. Try editing, the keyboard, file picking and layout in the installed app on your target device.

## Editing records and retaining failed saves

Use a collection for domain records and `useSceneStorage` in the owning primary screen for a recoverable draft. `useSceneStorage<string | null>('draft', null)` accepts transitions between null and strings; the runtime validates JSON serializability, not the initial value's type or nullness. The example below uses an empty string for text editing. Keep record IDs stable. Use a separate collection for drafts that must outlive navigation or belong to a modal editor. Do not rely on modal scene storage to persist them.

This complete screen creates, reads, edits and deletes notes. Place it in a registered primary route. Selecting a note copies it into the draft; a query refresh does not overwrite that draft. A failed save leaves the editor intact. A failed delete leaves the list intact and explains the failure. Delete confirmation starts closed.

```tsx
import { useState } from 'react'
import {
  Button,
  ConfirmationDialog,
  Form,
  Screen,
  Section,
  TextEditor,
  collection,
  defineDatabase,
  newId,
  useQuery,
  useSceneStorage,
  useUnsavedChanges,
} from '@satinhq/kit'

type Note = { id: string; text: string; updatedAt: number }
const notes = defineDatabase({
  name: 'notes',
  version: 1,
  collections: { notes: collection<Note>({ key: 'id' }) },
})

export function Notes() {
  const result = useQuery(notes.notes)
  const [draft, setDraft] = useSceneStorage('note-draft', '')
  const [editingId, setEditingId] = useSceneStorage('note-id', '')
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState('')
  useUnsavedChanges(draft.length > 0)

  async function save() {
    if (!draft.trim()) return
    setError('')
    try {
      await notes.notes.put({ id: editingId || newId(), text: draft, updatedAt: Date.now() })
      setDraft('')
      setEditingId('')
    } catch (failure) {
      setError(`Could not save. Your draft is still here. ${String(failure)}`)
    }
  }

  async function remove(id: string) {
    setError('')
    try {
      await notes.notes.delete(id)
      if (editingId === id) {
        setEditingId('')
        setDraft('')
      }
    } catch (failure) {
      setError(`Could not delete. Try again. ${String(failure)}`)
    }
  }

  return (
    <Screen title="Notes">
      <Form id="notes">
        <Section header={editingId ? 'Edit note' : 'New note'}>
          <TextEditor label="Note" prompt="Write a note" value={draft} onChange={setDraft} />
          <Button
            disabled={!draft.trim()}
            onPress={() => {
              void save()
            }}
          >
            Save
          </Button>
          {error && <p role="alert">{error}</p>}
        </Section>
        <Section header="Saved notes">
          {result.loading && <p>Loading notes…</p>}
          {result.error && <p role="alert">Could not load notes. {String(result.error)}</p>}
          {!result.loading && !result.error && result.data.length === 0 && <p>No notes yet.</p>}
          {result.data.map(note => (
            <Button
              key={note.id}
              disabled={draft.length > 0}
              onPress={() => {
                setEditingId(note.id)
                setDraft(note.text)
              }}
              swipeActions={{
                edge: 'trailing',
                allowsFullSwipe: false,
                actions: [
                  {
                    id: 'delete',
                    label: 'Delete',
                    role: 'destructive',
                    onPress: () => setDeleteId(note.id),
                  },
                ],
              }}
            >
              {note.text}
            </Button>
          ))}
        </Section>
        <ConfirmationDialog
          title="Delete note?"
          isPresented={deleteId !== ''}
          onPresentedChange={presented => {
            if (!presented) setDeleteId('')
          }}
          actions={[
            { id: 'cancel', label: 'Cancel', role: 'cancel' },
            {
              id: 'delete',
              title: 'Delete',
              role: 'destructive',
              onPress: () => {
                const id = deleteId
                setDeleteId('')
                void remove(id)
              },
            },
          ]}
        />
      </Form>
    </Screen>
  )
}
```

The Edit button is disabled while another draft exists. A production editor can instead offer Save, Discard or Cancel before switching records. Protect dirty drafts before Back or dismiss as well. Collections are durable subject to storage loss; keep external backups for important records.

`useQuery` observes local writes immediately, before persistence completes. Changing its configure callback updates the query selection on the next render, so an indexed search can capture the current search value directly. For small lists, subscribing to all records and computing `result.data.filter(...)` during render is also supported. There is no hook `retry` method; remount the query-owning child for a read retry and keep the draft in its parent. Keep loading, read errors and an empty successful result distinct. `useRecord` reads a cached record synchronously when its key changes; an unhydrated source starts loading without the previous record. Wait for a successful read before populating the new editor.

## Short sheets with independent navigation

Register an editor route and place its `Screen` and named `Form` inside a modal stack. Sheet owns presentation; the modal stack owns its own title, toolbar and scroll context. The primary stack remains outside it.

```tsx
import { useState } from 'react'
import {
  Button,
  Form,
  NavigationStack,
  Screen,
  Section,
  Sheet,
  TextField,
  defineNavigation,
  defineRoutes,
  route,
} from '@satinhq/kit'

function Editor() {
  const [text, setText] = useState('')
  return (
    <Screen>
      <Form id="sheet-editor">
        <Section>
          <TextField label="Name" prompt="Enter a name" value={text} onChange={setText} />
        </Section>
      </Form>
    </Screen>
  )
}
function Home() {
  const [presented, setPresented] = useState(false)
  return (
    <Screen>
      <Form id="home">
        <Section>
          <Button onPress={() => setPresented(true)}>Edit</Button>
        </Section>
      </Form>
      <Sheet
        title="Edit name"
        isPresented={presented}
        onPresentedChange={setPresented}
        detents={['medium', 'large']}
      >
        <NavigationStack modal root="editor" />
      </Sheet>
    </Screen>
  )
}
const routes = defineRoutes({
  home: route(Home, { title: 'Home' }),
  editor: route(Editor, { title: 'Edit name', titleDisplay: 'inline' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'home' } })
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
export function App() {
  return <NavigationStack />
}
```

Wire Save to an awaited collection write, then request dismissal only after success. Move the draft to a provider owned by Home or to a draft collection when it must recover; the transient editor above only demonstrates title and scroll ownership. Keep it on screen with an error after failed saves. Alert and ConfirmationDialog dismiss before their `onPress` promise settles; they are unsuitable for keeping an asynchronous editor open.

## Date, time and duration

`DatePicker` provides compact WebKit date/time editors; see [controls](controls.md) for accepted props and range behavior. Graphical calendars, wheel styles and a countdown wheel are unsupported. For explicit calendar-string entry, a labelled `TextField` with `prompt="YYYY-MM-DD"` is another framework-owned option. Validate year, month and day by round-tripping their numeric parts through a UTC date; reject impossible dates rather than letting `Date` normalize them. Store a date-only value as a calendar string, not midnight UTC. For time, use `HH:mm`, validate hours 0–23 and minutes 0–59, and retain the chosen time zone separately. Convert a scheduled local time to a UTC instant on the scheduling backend, with a stated policy for daylight-saving gaps and repeated times.

Use the framework control or explicit text validation; do not add a raw-input bridge to conceal unsupported picker styles.

```tsx
import { useState } from 'react'
import { Form, Section, Stepper } from '@satinhq/kit'
export function Duration() {
  const [minutes, setMinutes] = useState(15)
  return (
    <Form id="duration">
      <Section>
        <Stepper
          label={`Duration: ${minutes} minutes`}
          value={minutes}
          min={1}
          max={240}
          step={1}
          onChange={setMinutes}
        />
      </Section>
    </Form>
  )
}
```

Store duration as an integer count of seconds or minutes with an explicit unit. A countdown should derive remaining time from a saved deadline when resumed; a suspended PWA interval is not reliable scheduling.

## Progress

Use `ProgressView` for determinate work or an indeterminate activity indicator. `null` below means the total is unknown; omit `value` for indeterminate progress. See [controls](controls.md) for style behavior.

```tsx
import { Form, ProgressView, Section } from '@satinhq/kit'
export function ImportProgress({ fraction }: { fraction: number | null }) {
  const value = fraction === null ? undefined : Math.min(1, Math.max(0, fraction))
  const status = value === undefined ? 'Importing records…' : `Importing records: ${Math.round(value * 100)}%`
  return (
    <Form id="import-progress">
      <Section>
        <ProgressView label={status} aria-label={status} value={value} />
      </Section>
    </Form>
  )
}
```

Reject non-finite fractions at the task boundary. Keep framework styling and motion; use the documented tint and style props. Report meaningful progress changes rather than each animation frame. Determinate progress exposes the clamped value and total through ARIA attributes.

## Adaptive lists and full-width dashboards

`NavigationStack` always renders one stack. Use `NavigationSplitView` to make the declared root a sidebar at regular width while its pushed destination occupies detail. Compact windows collapse the same path into one stack. The destination's `sidebar` value identifies the selected row. Use the record ID, not a single static value for every detail.

```tsx
import {
  List,
  NavigationLink,
  NavigationSplitView,
  Screen,
  Section,
  defineNavigation,
  defineRoutes,
  param,
  route,
  type RouteParameters,
} from '@satinhq/kit'
const detailParams = { id: param.string() }
const records = [
  { id: 'one', title: 'First record' },
  { id: 'two', title: 'Second record' },
]
function Home() {
  return (
    <Screen>
      <List id="records">
        <Section>
          {records.map(record => (
            <NavigationLink key={record.id} to="detail" params={{ id: record.id }}>
              {record.title}
            </NavigationLink>
          ))}
        </Section>
      </List>
    </Screen>
  )
}
function Detail({ id }: RouteParameters<typeof detailParams>) {
  return (
    <Screen>
      <List id={`record-${id}`}>
        <Section>Record {id}</Section>
      </List>
    </Screen>
  )
}
const routes = defineRoutes({
  home: route(Home, { title: 'Records' }),
  detail: route(Detail, { params: detailParams, title: 'Record', sidebar: ({ id }) => id }),
})
const navigation = defineNavigation(routes, { stack: { root: 'home' } })
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
export function App() {
  return <NavigationSplitView />
}
```

For a dashboard that must remain one full-width stack, render `<NavigationStack />` with the same declaration. No adaptive opt-out is needed. A declared tab can likewise render `NavigationStack` or `NavigationSplitView` in its `content` component. Check both compact and regular widths, selection and Back in the installed app.

## Photos

Use [PhotosPicker](components/photos-picker.md) to select one image or video File,
or [FileImporter](components/file-importer.md) for document Files. These open real
system choosers. Cancel preserves the accepted selection. Key the picker by draft
identity when replacing a draft whose selection has not changed.

Apps own validation, preparation, decoding, storage and object-URL lifetime after
selection. Browser file events have no chooser-session identifier; overlapping
choosers cannot be attributed exactly. File objects and object URLs are not durable
JSON assets. Image and AsyncImage display prepared assets; they do not acquire them.

Use [ShareLink](components/share-link.md) with prepared files for system sharing.
Use [PasteButton](components/paste-button.md) for user-initiated text paste; WebKit
may require its own Paste confirmation.

## Custom navigation title content

`ToolbarItem` accepts `largeTitle`, `largeSubtitle` and `subtitle` placement strings. A `largeTitle` item replaces the expanded title, and
`largeSubtitle` replaces the expanded subtitle. Their intrinsic height reserves the
expanded row. Both scroll away, leaving the screen's ordinary title inline. A
`subtitle` item replaces the inline subtitle. With `viewportFit: 'auto'` or
`'contain'`, its title lane grows downward when needed and reserves the excess in
the content inset, so the fitted viewport clips neither title nor custom content.
The controls keep their stock row. With `viewportFit: 'cover'`, it retains native
upward overflow. The fitted viewport can clip content above the safe edge. Use `Screen title` and `subtitle` for text.
Static destination defaults belong in route options; `Screen` can override them.

```tsx
<Screen title="Messages" titleDisplay="large" toolbar={
  <ToolbarItem placement="largeTitle">
    <ConversationIdentity />
  </ToolbarItem>
}>
  <ScrollView>{messages}</ScrollView>
</Screen>
```

The iOS 27 native 82 pt avatar/name fixture reserves a 136 pt bar with `largeTitle`,
or a 194 pt bar with `largeSubtitle` below the default large title. After collapse
both reserve 54 pt. These are native measurements, not fixed heights to put in app CSS.
`principal` content occupies the stock toolbar row; use `largeTitle` or
`largeSubtitle` for a tall custom header.

## Persistent conversation header

Hide stock navigation chrome and compose the complete header in a top `SafeAreaBar`.
The bar measures its content, reserves space, and owns its extended scrolling material.
Include the back action and trailing actions in that composition, not in the hidden toolbar.

```tsx
import { Button, HStack, SafeAreaBar, Screen, ScrollView, Spacer, VStack, useNavigation } from '@satinhq/kit'

function ConversationScreen() {
  const navigation = useNavigation()
  return (
    <Screen toolbarVisibility="hidden">
      <SafeAreaBar edge="top" content={
        <HStack spacing={12} style={{ padding: '8px 20px' }}>
          <Button aria-label="Back" buttonStyle="glass" onPress={() => navigation.pop()}>
            Back
          </Button>
          <Spacer />
          <VStack spacing={4}>
            <div role="img" aria-label="Alex's avatar" style={{
              width: 60, height: 60, borderRadius: '50%', background: 'var(--satin-system-orange)',
            }} />
            <strong style={{ fontSize: 15, lineHeight: '18px' }}>Alex Morgan</strong>
          </VStack>
          <Spacer />
          <Button aria-label="Video call" buttonStyle="glass" onPress={startVideoCall}>
            Video
          </Button>
        </HStack>
      }>
        <ScrollView>{messages}</ScrollView>
      </SafeAreaBar>
    </Screen>
  )
}
```

Supply your `messages` and `startVideoCall` action. The default HStack alignment centers
buttons on the entire avatar/name stack. In the native 98 pt composition, button centers
are 11 pt below the avatar center. If the design calls for avatar-centered buttons, choose
that alignment deliberately in the composition.

## Tab bar with an action button

Use `trailingAction` for an app-wide action such as composing a thread. Declare
only destinations in `defineNavigation`; the action does not become a tab.

```tsx
function App() {
  const [composing, setComposing] = useState(false)
  return <>
    <TabView trailingAction={
      <Button symbol="square.and.pencil" aria-label="New Thread"
        onPress={() => setComposing(true)} />
    } />
    <Sheet isPresented={composing} onPresentedChange={setComposing} title="New Thread">
      <Text>Write your thread here.</Text>
    </Sheet>
  </>
}
```

The example uses `useState` from React and `TabView`, `Button`, `Sheet` and `Text`
from `@satinhq/kit`. The app's navigation declaration supplies its tabs. The slot
cannot accompany a tab declared with `role: 'search'`. For a menu, supply
`<Menu label="New" actions={actions} trigger={props =>
<Button {...props} symbol="plus" aria-label="New" />} />` as the action. Forward
all trigger props so disabled state, menu accessibility and activation work.
## Showing email or article HTML

Use a same-origin sanitized document with `<WebView sizing="content" url={bodyURL}
 title="Message body" />` inside `ScrollView`. Width fitting defaults on; scripts and
forms default off. WebKit makes `onOpenURL` unavailable with scripts disabled; use
application-owned `Link` controls outside the frame when link policy is required. See
[the complete recipe and origin limits](web-handoff.md#showing-email-or-article-html).
Live page retention and press-time prefetch are not available in this implementation yet.
