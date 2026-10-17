import { useEffect, useMemo, useRef, useState } from 'react'
import { getBuiltApp, registerDefinedAppShell } from '../app/runtime.ts'
import { Sheet } from '../public/presentation.tsx'
import { Alert } from '../presentation/Presentation.tsx'
import { List, Section, Row, ButtonRow } from '../list-form/ListForm.tsx'
import type { AppShellBuildState, SatinAppShellRegistration } from '../sw/registerAppShell.ts'
import { createDevMenuActions } from './actions.ts'
import { installDevMenuGesture } from './gesture.ts'
import { enableShake } from './shake.ts'
import { subscribeAppShellChecks } from '../sw/updateCheck.ts'
import { SystemScrollRegistryContext } from '../navigation/navigationContext.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'

type Recorder = { status(): { enabled?: boolean }; setEnabled(enabled: boolean): void }
function recorder() {
  return (globalThis as typeof globalThis & { __SATIN_SWIPE_TRACE__?: Recorder })
    .__SATIN_SWIPE_TRACE__
}

export default function DevMenu() {
  const app = getBuiltApp()
  const build = import.meta.env.SATIN_DEV_MENU_CONFIG
  const [presented, setPresented] = useState(false)
  const [scrollRegistry] = useState(() => createScrollSurfaceRegistry())
  const presentedRef = useRef(false)
  presentedRef.current = presented
  const [shell, setShell] = useState<SatinAppShellRegistration | null>(null)
  const [state, setState] = useState<AppShellBuildState>({
    applying: false,
    current: null,
    waiting: null,
  })
  const [checked, setChecked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [shake, setShake] = useState(false)
  const stopShake = useRef<(() => void) | undefined>(undefined)
  const [recording, setRecording] = useState(recorder()?.status().enabled !== false)

  useEffect(() => {
    // This sibling of the app screens has no route, scene key or restored state.
    const open = () => {
      if (document.visibilityState !== 'hidden') setPresented(true)
    }
    return installDevMenuGesture(open, () => presentedRef.current)
  }, [])
  useEffect(() => {
    if (!app) return
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void registerDefinedAppShell(app)
      .then(registration => {
        if (disposed) return
        setShell(registration)
        unsubscribe = registration?.subscribe(setState)
      })
      .catch(cause => {
        if (!disposed) setError(String(cause))
      })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [app])
  useEffect(() => () => stopShake.current?.(), [])
  useEffect(() => {
    if (!app) return
    return subscribeAppShellChecks(new URL(app.scope, location.origin).href, setChecked)
  }, [app])
  const actions = useMemo(
    () =>
      createDevMenuActions({
        shell,
        scope: app?.scope ?? '/',
        checked: setChecked,
      }),
    [app?.scope, shell],
  )
  const run = async (action: () => void | Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const trace = recorder()
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const tablet =
    /iPad/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

  return (
    <SystemScrollRegistryContext value={scrollRegistry}>
      <Sheet
        title="Developer menu"
        isPresented={presented}
        onPresentedChange={setPresented}
        detents={['large']}
      >
        <List
          id="satin-developer-menu"
          variant="insetGrouped"
          primary={false}
          data-satin-dev-menu="true"
        >
          <Section header={app?.name ?? 'Satin app'}>
            <Row label="App version" trailing={build?.version ?? 'unversioned'} />
            <Row label="Build ID" trailing={state.current ?? 'Vite development'} />
            <Row label="Branch" trailing={build?.branch ?? 'unavailable'} />
            <Row label="Commit" trailing={build?.commit.slice(0, 12) ?? 'unavailable'} />
            <Row label="Satin" trailing={build?.frameworkVersion ?? 'development'} />
            <Row label="Built" trailing={build?.builtAt ?? 'development'} />
          </Section>
          <Section header="Service worker">
            <Row label="Active build" trailing={state.current ?? 'None'} />
            <Row label="Waiting build" trailing={state.waiting ?? 'None'} />
            <Row
              label="Last update check"
              trailing={checked ? new Date(checked).toLocaleTimeString() : 'Not checked'}
            />
            <ButtonRow onPress={() => void run(actions.check)} disabled={!shell || busy}>
              Check for update
            </ButtonRow>
            <ButtonRow
              onPress={() => void run(actions.apply)}
              disabled={!state.waiting || state.applying || busy}
            >
              Apply update now
            </ButtonRow>
          </Section>
          <Section header="Development">
            <ButtonRow onPress={actions.reload} disabled={busy}>
              Reload
            </ButtonRow>
            <ButtonRow
              onPress={() =>
                void run(async () => {
                  if (shake) {
                    stopShake.current?.()
                    stopShake.current = undefined
                    setShake(false)
                  } else {
                    stopShake.current = await enableShake(() => setPresented(true))
                    setShake(true)
                  }
                })
              }
              disabled={busy}
            >
              {shake ? 'Disable shake to open' : 'Enable shake to open'}
            </ButtonRow>
            {trace?.setEnabled ? (
              <ButtonRow
                onPress={() => {
                  trace.setEnabled(!recording)
                  setRecording(!recording)
                }}
              >
                {recording ? 'Stop gesture recorder' : 'Start gesture recorder'}
              </ButtonRow>
            ) : null}
            {build?.statusUrl ? (
              <ButtonRow
                onPress={() => {
                  location.assign(build.statusUrl!)
                }}
              >
                Owner status page
              </ButtonRow>
            ) : null}
            <ButtonRow
              role="destructive"
              onPress={() => setConfirm(true)}
              disabled={!shell || busy}
            >
              Force update
            </ButtonRow>
          </Section>
          <Section header="Platform">
            <Row
              label="Device class"
              trailing={tablet ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Other'}
            />
            <Row label="Standalone" trailing={standalone ? 'Yes' : 'No'} />
            {error ? <p role="alert">{error}</p> : null}
            <ButtonRow onPress={() => setPresented(false)}>Done</ButtonRow>
          </Section>
        </List>
        <Alert
          title="Force update?"
          message="Download a fresh app shell and remove this app's Satin caches. Your app data is kept."
          isPresented={confirm}
          onPresentedChange={setConfirm}
          actions={[
            { id: 'cancel', label: 'Cancel', role: 'cancel' },
            {
              id: 'force',
              label: 'Force update',
              role: 'destructive',
              onPress: () => run(() => actions.force(true)),
            },
          ]}
        />
      </Sheet>
    </SystemScrollRegistryContext>
  )
}
