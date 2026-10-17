import { TabActivityContext } from '../tabs/context.ts'
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type PropsWithChildren,
} from 'react'
import { Pressable } from '../press/Pressable.tsx'
import { ContentUnavailableView } from '../public/controls.tsx'
import { browserReachabilityEnvironment, createReachabilityController } from './controller.ts'
import type { ReachabilityProfile, ReachabilitySurface } from './model.ts'

/** What the offline view shows: why the server is unavailable, how it is presented, and the
 * recheck and back actions. */
export interface OfflinePresentationProps {
  readonly reason: 'device-offline' | 'server-unreachable'
  readonly surface: Exclude<ReachabilitySurface, 'none'>
  readonly goBack?: () => void
  readonly checking: boolean
  readonly recheck: () => void
}

export function OfflinePresentation({
  reason,
  surface,
  checking,
  recheck,
  goBack,
}: OfflinePresentationProps) {
  const title = reason === 'device-offline' ? 'You’re offline' : 'Server unavailable'
  const description =
    reason === 'device-offline'
      ? 'Connect to a network to use this screen.'
      : 'This screen needs a connection to the app server.'
  const actions = (
    <>
      {goBack && <Pressable onPress={goBack}>Back</Pressable>}
      <Pressable onPress={recheck} disabled={checking}>
        {checking ? 'Checking…' : 'Try again'}
      </Pressable>
    </>
  )
  return (
    <section data-satin-offline={surface} role="status" aria-live="polite">
      {surface === 'full-screen' ? (
        <ContentUnavailableView title={title} description={description}>
          {actions}
        </ContentUnavailableView>
      ) : (
        <>
          <strong>{title}</strong>
          <p>{description}</p>
          {actions}
        </>
      )}
    </section>
  )
}

const ReachabilityContext = createContext<ReturnType<typeof createReachabilityController> | null>(
  null,
)
const PresentationContext =
  createContext<ComponentType<OfflinePresentationProps>>(OfflinePresentation)
const localController = createReachabilityController(
  { connectivity: 'local' },
  '',
  browserReachabilityEnvironment,
)

export function ReachabilityProvider({
  profile,
  offlinePresentation = OfflinePresentation,
  children,
}: PropsWithChildren<{
  profile: ReachabilityProfile
  offlinePresentation?: ComponentType<OfflinePresentationProps>
}>) {
  const controller = useMemo(
    () => createReachabilityController(profile, '', browserReachabilityEnvironment),
    [profile],
  )
  useEffect(() => {
    controller.start()
    return () => controller.dispose()
  }, [controller])
  return (
    <ReachabilityContext value={controller}>
      <PresentationContext value={offlinePresentation}>{children}</PresentationContext>
    </ReachabilityContext>
  )
}

/** Whether the app can reach its network and server: the live state, a way to re-check, and a way
 * to report a fetch's outcome so Satin learns about failures early. */
// This hook shares the provider context and does not create components.
// oxlint-disable-next-line react/only-export-components
function useReachabilityController() {
  const controller = useContext(ReachabilityContext) ?? localController
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  return {
    state,
    recheck: controller.recheck,
    reportFetchOutcome: controller.reportFetchOutcome,
    fetch: controller.fetch,
  }
}

/** The app server's status and the offline view currently shown, with `fetch` and `recheck`
 * helpers that feed the status. */
export function useReachability() {
  const { state, ...commands } = useReachabilityController()
  return {
    ...commands,
    state: {
      status: state.status,
      presentation: state.connectivity === 'server' ? state.presentedSurface : undefined,
    },
  }
}

/** Mounted once by NavigatorHost, observing its actual top screen ID. */
export function ReachabilityRoute({
  route,
  children,
  goBack,
}: PropsWithChildren<{ route: string; goBack?: () => void }>) {
  const controller = useContext(ReachabilityContext) ?? localController
  const tabActive = useContext(TabActivityContext)
  const Presentation = useContext(PresentationContext)
  const { state, recheck } = useReachabilityController()
  useLayoutEffect(() => {
    if (tabActive) controller.setRoute(route)
  }, [controller, route, tabActive])
  const shown = state.connectivity === 'server' ? state.presentedSurface : undefined
  return (
    <>
      <div
        data-satin-route-content="true"
        inert={shown?.surface === 'full-screen' ? true : undefined}
      >
        {children}
      </div>
      {shown &&
        createElement(Presentation, {
          ...shown,
          goBack,
          checking: state.connectivity === 'server' && state.pendingProbeId !== undefined,
          recheck,
        })}
    </>
  )
}
