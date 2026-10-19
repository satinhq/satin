# Local data

For remote data that should stay in memory, use [resources](remote-data.md).
Persistence through this database is opt-in.

Satin stores personal app data in IndexedDB. Define one database per app and keep its name stable across releases.

```ts
import { collection, defineDatabase, newId, useQuery, useRecord } from '@satinhq/kit'

type Entry = { id: string; createdAt: number; text: string; mood?: string }
export const db = defineDatabase({
  name: 'journal',
  version: 2,
  collections: {
    entries: collection<Entry>({ key: 'id', indexes: { byDate: 'createdAt' } }),
  },
  migrations: {
    2: async tx => {
      await tx.entries.updateAll(entry => ({ ...entry, mood: entry.mood ?? 'neutral' }))
    },
  },
})

db.entries.put({ id: newId(), createdAt: Date.now(), text: 'First day' })
const latest = await db.entries.query(q => q.index('byDate').reverse().limit(50))
```

`useQuery(db.entries, q => q.index('byDate').reverse().limit(50))` and `useRecord(db.entries, id)` return `{ data, loading, error }`. They observe the in-memory collection synchronously when a local write is issued, before persistence finishes. Loaded records stay loaded during edits. A cached record selected by a new key is available on the first render. Query builders support key ranges with `keyRange(IDBKeyRange.bound(...))`, index ranges with `index(name, range)`, reverse order, limit, and an in-memory `filter`. Keep filters small because a filter scans records before limiting.

Local edits need no pending flag or disabled controls:

```tsx
<Button onPress={() => db.entries.update(id, row => ({ ...row, mood: row.mood === 'happy' ? 'neutral' : 'happy' }))}>
  Change mood
</Button>
```

`put`, `update`, `delete`, and synchronous transaction callbacks publish to memory immediately once initial data is loaded. Their promises settle after durable commit. `update(key, partial)` merges fields; `update(key, current => next)` reads the latest record. Functional updates must be pure: the framework can evaluate them again when pending writes are reconciled or another tab commits. Keys cannot change in an update; missing records reject.

Persistence failures roll back the pending journal, cancel later queued writes, reject their promises, and always log a console error. Register `db.onError(({ error }) => showError(error.message))` for an app-visible alert; the returned function unsubscribes. Hook results also expose the last error. Do not clear an unsaved draft until a durability promise succeeds. Calling `exportJSON()` waits for issued writes before reading storage.

Tabs on the same origin serialize commits through IndexedDB. BroadcastChannel prompts other handles to refresh; returning to the foreground also refreshes. Remote delivery is eventual, not synchronous. Functional updates apply to the latest durable row. Whole-row `put` deliberately replaces a row. Legacy read-then-put transactions reject conflicting changes; they never silently overwrite a changed record.

`db.transaction(['entries', 'tags'], tx => { ... })` publishes synchronous edits atomically and persists them together. Existing async callbacks remain supported, but their edits cannot publish until the callback resolves. Initial hydration must finish before an update or transaction can read existing rows. Migration callbacks still await **only Satin transaction methods**; network requests and timers can let WebKit auto-commit the upgrade transaction. A failed migration aborts the upgrade transaction, leaving the previous database version intact. App code should show the error and let the user retry or export from the prior app version. Declared indexes reconcile during upgrade. A collection's key path cannot change in place; create a new collection and migrate its records instead.

`db.exportJSON()` returns a JSON Blob with format, database name, version, and every collection. `db.importJSON(file, 'replace')` clears and replaces all collections in one transaction; `'merge'` upserts by key. Import checks document identity, version, collection names, and string keys before writing. It does not validate the shape of every field, because TypeScript types are erased at runtime. Validate any untrusted import more strictly in app code. Keep an export outside the device if the data matters.

Call `storageQuota.requestPersistence()` after a user saves data or in a data settings screen. It returns whether WebKit granted persistence; it does not guarantee that the user cannot remove app data. `storageQuota.estimate()` returns approximate usage and quota, when available. A quota is an upper bound, not reserved space, and writes can still fail with `QuotaExceededError`.

WebKit's [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) says standalone Home Screen apps have browser-app origin and overall quotas. Best-effort data can be evicted under storage pressure. WebKit considers persistent mode an exclusion from normal eviction and grants `persist()` heuristically, including whether a site is a Home Screen app. Its [tracking prevention policy](https://webkit.org/tracking-prevention/) exempts Home Screen apps from the seven-day script-writable storage cap. These are published policies, not proof that an individual iOS 27 installation cannot lose data. The user can still delete the app or website data, and device failure remains possible.

Connections close on page resume and reopen on demand. A read may retry once after a connection failure. A write retries only if it failed before a transaction started, because replaying a partially committed write or a callback with side effects could duplicate work. If a write fails mid-transaction, show the error and ask the user to retry the operation. Safari 27 [fixes several IndexedDB suspend and crash cases](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/), but does not remove the need for this handling.

The app lint checker flags raw `localStorage` and `indexedDB` access. For an integration that must read legacy data, put `// satin-data-allow-raw-storage: <reason>` in that source file and migrate the data into a collection. The escape hatch applies to the entire file, so keep the bridge small.

## Validate, preview and confirm a restore

The starter's file handler is a wiring demonstration: it immediately replaces data. For valuable records, implement this sequence: select → validate → preview → save a backup outside the app → confirm Replace → await import → report success. Keep the validated document available after failure; Cancel never calls import. Disable concurrent edits during replacement. `'merge'` is not a conflict resolver: matching keys overwrite existing records.

For the journal database above, this validator accepts only the exact export envelope and application fields. It rejects oversized input, unknown fields, duplicate IDs, invalid timestamps and extra collections. Adapt the field rules to your schema, including every collection and any user-content limits. Read once and import the same validated bytes.

```ts
export async function validateJournalBackup(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error('Backup must be smaller than 5 MB.')
  const text = await file.text()
  const value: unknown = JSON.parse(text)
  function object(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
  }
  function onlyKeys(input: Record<string, unknown>, allowed: readonly string[]) {
    return Object.keys(input).every(key => allowed.includes(key))
  }
  if (
    !object(value) ||
    !onlyKeys(value, ['format', 'name', 'version', 'collections']) ||
    value.format !== 'satin-data' ||
    value.name !== 'journal' ||
    value.version !== 2 ||
    !object(value.collections) ||
    !onlyKeys(value.collections, ['entries']) ||
    !Array.isArray(value.collections.entries)
  ) {
    throw new Error('Choose a journal version 2 backup.')
  }
  const rows = value.collections.entries
  if (rows.length > 10_000) throw new Error('Backup has too many entries.')
  const ids = new Set<string>()
  for (const row of rows) {
    if (
      !object(row) ||
      !onlyKeys(row, ['id', 'createdAt', 'text', 'mood']) ||
      typeof row.id !== 'string' ||
      row.id.length === 0 ||
      row.id.length > 200 ||
      ids.has(row.id) ||
      typeof row.createdAt !== 'number' ||
      !Number.isFinite(row.createdAt) ||
      row.createdAt < 0 ||
      row.createdAt > Date.now() ||
      typeof row.text !== 'string' ||
      row.text.length > 20_000 ||
      (row.mood !== undefined && (typeof row.mood !== 'string' || row.mood.length > 100))
    ) {
      throw new Error('An entry has invalid fields or a duplicate ID. Nothing was imported.')
    }
    ids.add(row.id)
  }
  return { blob: new Blob([text], { type: 'application/json' }), count: rows.length }
}
```

Keep `{ blob, count }` in transient pending-import state. Show the selected filename, incoming count and the current count, explicitly saying that every existing collection will be replaced. Render imported text as text, never HTML. Let the user choose Export before offering Replace. After confirmation, `await db.importJSON(pending.blob, 'replace')` inside `try/catch`; clear pending state only on success. Invalid JSON, validation failures and a failed write should display an error without reporting completion. A failed import transaction leaves previous records intact. Never increase the database version merely to accept an old backup: build an explicit validated conversion instead.

Put the database definition `db` (without the demonstration put/query calls), `validateJournalBackup` above and `shareBackup` below in `journal-backup.ts`. This settings screen keeps the candidate after a failed import and requires a separately saved backup before replacement. Mount it in a registered screen. The database orders restore and subsequent edits; ordinary editors do not need a persistence lock. Its pending state lasts for this screen's mounted lifetime.

```tsx
import { useState } from 'react'
import { Button, ConfirmationDialog, Form, Section, useQuery } from '@satinhq/kit'
import { db, shareBackup, validateJournalBackup } from './journal-backup'

export function RestoreSettings() {
  const current = useQuery(db.entries)
  const [pending, setPending] = useState<{
    filename: string
    blob: Blob
    count: number
  } | null>(null)
  const [backup, setBackup] = useState<Blob | null>(null)
  const [savedOutsideApp, setSavedOutsideApp] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const report = (error: unknown) => {
    setMessage(error instanceof Error ? error.message : 'The operation failed. Try again.')
  }

  async function select(file: File) {
    setBusy(true)
    setMessage('')
    try {
      const validated = await validateJournalBackup(file)
      setPending({ filename: file.name, ...validated })
      setBackup(null)
      setSavedOutsideApp(false)
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }

  async function exportCurrent() {
    setBusy(true)
    setMessage('')
    try {
      setBackup(await db.exportJSON())
      setSavedOutsideApp(false)
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }

  async function shareCurrent(blob: Blob) {
    // The press calls shareBackup before any await, preserving user activation.
    setBusy(true)
    setMessage('')
    try {
      const result = await shareBackup(blob)
      setMessage(
        result === 'shared'
          ? 'Check that the backup is saved outside this app, then confirm below.'
          : result === 'cancelled'
            ? 'Sharing cancelled. Nothing was replaced.'
            : 'File sharing is unavailable. Use an explicit download link before continuing.',
      )
    } catch (error) {
      report(error)
    } finally {
      setBusy(false)
    }
  }

  async function replace() {
    if (!pending || !savedOutsideApp || busy) return
    setBusy(true)
    setMessage('')
    try {
      await db.importJSON(pending.blob, 'replace')
      setPending(null)
      setBackup(null)
      setSavedOutsideApp(false)
      setMessage('Restore completed.')
    } catch (error) {
      // Keep pending so the user can retry or cancel without reselecting the file.
      report(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Form id="journal-restore">
        <Section header="Restore journal">
          <label>
            Choose backup
            <input
              type="file"
              accept="application/json,.json"
              data-satin-native-input="System file picker for JSON restore"
              disabled={busy}
              onChange={event => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void select(file)
              }}
            />
          </label>
          {current.loading && <p>Reading current entries…</p>}
          {current.error && (
            <p role="alert">Current entries could not be read. Reopen this screen to retry.</p>
          )}
          {pending && (
            <>
              <p>
                {pending.filename}: {pending.count} incoming entries.
              </p>
              {!current.loading && !current.error && (
                <p>
                  Replace all {current.data.length} existing entries. This replaces every
                  collection.
                </p>
              )}
              <Button disabled={busy} onPress={() => void exportCurrent()}>
                Export current data
              </Button>
              {backup && (
                <>
                  <Button disabled={busy} onPress={() => void shareCurrent(backup)}>
                    Share backup
                  </Button>
                  <Button disabled={busy} onPress={() => setSavedOutsideApp(true)}>
                    I verified my backup is saved outside this app
                  </Button>
                </>
              )}
              <Button
                role="destructive"
                disabled={busy || !savedOutsideApp || current.loading || !!current.error}
                onPress={() => setConfirm(true)}
              >
                Replace all data…
              </Button>
              <Button
                disabled={busy}
                onPress={() => {
                  setPending(null)
                  setBackup(null)
                  setSavedOutsideApp(false)
                  setMessage('Restore cancelled. Nothing was replaced.')
                }}
              >
                Cancel
              </Button>
            </>
          )}
          {busy && <p role="status">Working…</p>}
          {message && <p role="status">{message}</p>}
        </Section>
      </Form>
      <ConfirmationDialog
        isPresented={confirm}
        onPresentedChange={setConfirm}
        title="Replace every journal entry?"
        actions={[
          {
            id: 'replace',
            title: 'Replace all data',
            role: 'destructive',
            onPress: () => void replace(),
          },
          { id: 'cancel', label: 'Cancel', role: 'cancel', onPress: () => {} },
        ]}
      />
    </>
  )
}
```

The confirmation closes before the asynchronous write settles, so progress and errors live in the owning screen. Cancel in the confirmation leaves the preview available. Cancel in the preview discards only the candidate. If users can edit elsewhere while this screen is open, invalidate the exported backup and confirmation after those edits, or hold an app-wide edit lock until they finish the restore.

## Exporting and sharing files

`exportJSON()` creates a Blob, not an external backup. Prepare that Blob first, then offer a separate Share button so `navigator.share()` runs directly from its press callback with user activation. The Web Share API is a system integration, not an import from `@satinhq/kit`.

```ts
export async function shareBackup(blob: Blob): Promise<'shared' | 'cancelled' | 'unavailable'> {
  const file = new File([blob], 'journal-backup.json', { type: 'application/json' })
  if (!navigator.canShare?.({ files: [file] })) return 'unavailable'
  try {
    await navigator.share({ title: 'Journal backup', files: [file] })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    throw error
  }
}
```

Call this from a framework `Button` and catch failures in app state. A resolved share promise does not prove the recipient saved a backup. Ask the user to confirm its location. When file sharing is unavailable, offer an explicit download link using `URL.createObjectURL(blob)`, `download="journal-backup.json"`; retain the URL while the link is available and revoke it when replaced or unmounted, not immediately after a click. Test actual Files export and re-import from the installed app. Share cancellation is not a save failure.

For import, use a labelled `type="file"` input with `accept="application/json,.json"` and `data-satin-native-input="System file picker for JSON restore"`. The accept list is a picker hint; always validate. Reset the input value after reading so the same file can be selected again. Retain the parsed pending backup independently of the input. Never clear records before calling the atomic import method.

## Creation-only seed

`defineDatabase({ name, version, collections, seed: async tx => { ... } })` runs
seed only when creating a database, after creation migrations, in the same atomic
versionchange transaction. Use the supplied transaction collections, not the
database handle. Concurrent handles serialize through IndexedDB. Reopening,
clearing records, and upgrading an existing database do not run seed again.

Rejected initialization aborts migration and seed writes together. The opening
operation rejects with the original cause, including `undefined`, `null`, `false`,
`0` or an empty string. A later open may retry creation; Satin does not retry
external seed side effects automatically. Async preparation must finish; never
wait for user interaction or unbounded network work inside initialization.
Requests keep the existing transaction active only during initialization and
stop on settlement, abort or completion. Aborting cannot commit partial rows.

Ordinary interfaces work with `collection<T>`. Primary keys must be string fields
and indexes must name fields. The curried `collection<T>()({...})` form preserves
the exact declared index names.
