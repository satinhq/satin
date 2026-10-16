# Data and state

Put each piece of state where its lifetime belongs.

| State | Where it lives | Survives |
| --- | --- | --- |
| Records the user creates (habits, notes, entries) | A collection in `defineDatabase` | Relaunch, until iOS evicts storage |
| A small preference (units, sort order, appearance) | `useAppStorage('units', 'kg')` | Relaunch |
| An unsaved draft in a screen | `useSceneStorage('draft', '')` | Background and cold launch |
| Whether a sheet, alert or menu is open | `useState(false)` | Nothing. Presentations always start closed. |
| Pressed states, focus, in-flight confirmations | Component state | Nothing |

The second argument of `useSceneStorage` and `useAppStorage` is the initial value, never a schema.
Each pushed screen gets its own scene storage, so two pushed copies of an editor keep separate
drafts.

## Relaunch behaviour

An app returning from the background keeps everything: tab, stack, scroll position, drafts. An app
launched from scratch starts at its first screen. Save what must survive a cold launch with
`useSceneStorage`, and keep real data in collections. Never replay pushes in an effect to fake
restoration, and never persist presentation flags.

## The local database

```ts
import { collection, defineDatabase } from '@satinhq/kit'

export type Habit = { id: string; name: string; createdAt: number }

// Keep the database name stable across app renames. Bump the version only with a migration.
export const db = defineDatabase({
  name: 'habits',
  version: 1,
  collections: { habits: collection<Habit>({ key: 'id', indexes: { byDate: 'createdAt' } }) },
})
```

- Create IDs with `newId()`. Write with `await db.habits.put(record)` and
  `await db.habits.delete(id)`.
- Read with `useQuery(db.habits)` for lists and `useRecord(db.habits, id)` for one record. Both
  return `data`, `loading` and `error`, and re-render after writes.
- Check `loading` before treating empty data as empty. Show loading, error and empty as three
  different states. `useQuery` has no retry method, and a remount is not a retry.
- This is IndexedDB. Writes can fail and iOS can evict storage. Request persistent storage after
  the first meaningful save, show estimates with `storageQuota`, and offer JSON export.
- Never use `localStorage` or raw IndexedDB for records; the `no-raw-persistent-storage` rule flags
  it.

## Saving honestly

- Await the write before showing "Saved". On failure, keep what the user typed and show an
  actionable error with Retry.
- Keep an editor open until its awaited write succeeds.
- Mark unsaved work with `useUnsavedChanges(dirty)`. Updates and navigation respect it.
- A refresh must never clear an unsaved draft.

## Import and backup

Before replacing data from an imported file: read it once, validate every field and duplicate key
(TypeScript types do not validate JSON), show a preview with counts, offer an export of the current
data first, and require an explicit Replace confirmation. On failure keep the parsed backup and
show an actionable error. Cancel leaves stored data untouched.

## Networking and long work

- Use `useTask` for cancellable work tied to a screen's appearance. Pass its `AbortSignal` to
  `fetch` and publish results through `commit`.
- `useReachability` describes the network path, not whether a write succeeded.
- For fetch, pull to refresh (`refreshable` on `List` or `ScrollView`), CORS, auth and offline
  writes, read `node_modules/@satinhq/kit/dist/docs/networking.md`.
