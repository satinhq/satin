// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useTask, type TaskCommit, type TaskRunner } from './useTask.ts'
import { NavigatorHost } from '../navigation/NavigatorHost.tsx'
import { createNavigator } from '../navigation/store.ts'
import { createScreenRegistry, defineScreen } from '../navigation/registry.ts'
import { TabActivityContext } from '../tabs/context.ts'
import type { TransitionController } from '../navigation/types.ts'

vi.mock('../root/runtimeContext.ts', () => ({
  useSatinLayoutRuntime: () => ({
    layoutClass: { horizontal: 'compact' },
    metrics: { layoutViewport: { width: 402 }, screen: { width: 402, height: 874 } },
  }),
}))
vi.mock('../navigation/NavigationChrome.tsx', () => ({ NavigationChrome: () => null }))
vi.mock('../reachability/react.tsx', () => ({
  ReachabilityRoute: ({ children }: { children: React.ReactNode }) => children,
}))
let root: Root
let element: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
})
afterEach(() => {
  act(() => root.unmount())
  element.remove()
})

it('cancels disappearing navigation and retained-tab tasks, restarting on return', () => {
  const signals: Record<string, AbortSignal[]> = { home: [], detail: [] }
  const controllers: TransitionController[] = []
  function TaskScreen({ name }: { name: string }) {
    useTask(signal => {
      signals[name]!.push(signal)
    })
    return <span>{name}</span>
  }
  const registry = createScreenRegistry(
    defineScreen('home', { component: () => <TaskScreen name="home" /> }),
    defineScreen('detail', { component: () => <TaskScreen name="detail" /> }),
  )
  const navigator = createNavigator({
    registry,
    initial: { id: 'home' },
    transitionControllerFactory: completion => {
      const controller = { progress: 0, finish: completion.finish, cancel: completion.cancel }
      controllers.push(controller)
      return controller
    },
  })
  const render = (active: boolean) =>
    act(() =>
      root.render(
        <TabActivityContext value={active}>
          <NavigatorHost navigator={navigator} />
        </TabActivityContext>,
      ),
    )
  render(true)
  act(() => navigator.push('detail'))
  expect(signals.home[0]!.aborted).toBe(false)
  act(() => controllers.at(-1)!.finish())
  expect(signals.home[0]!.aborted).toBe(true)
  act(() => navigator.pop())
  expect(signals.detail[0]!.aborted).toBe(false)
  act(() => controllers.at(-1)!.finish())
  expect(signals.detail[0]!.aborted).toBe(true)
  expect(signals.home[1]!.aborted).toBe(false)
  render(false)
  expect(signals.home[1]!.aborted).toBe(true)
  render(true)
  expect(signals.home[2]!.aborted).toBe(false)
})

it('cancels the old id before starting the next and blocks late state publication', async () => {
  const pending: { signal: AbortSignal; commit: TaskCommit; finish: () => void }[] = []
  let reload!: TaskRunner
  function Screen({ id }: { id: string }) {
    const [value, setValue] = useState('loading')
    reload = useTask(
      async (signal, commit) => {
        await new Promise<void>(finish => pending.push({ signal, commit, finish }))
        commit(() => setValue(id))
      },
      { id },
    )
    return <span>{value}</span>
  }
  act(() => root.render(<Screen id="old" />))
  act(() => root.render(<Screen id="new" />))
  expect(pending[0]!.signal.aborted).toBe(true)
  act(() => {
    void reload()
  })
  expect(pending[1]!.signal.aborted).toBe(true)
  await act(async () => pending[2]!.finish())
  await act(async () => pending[1]!.finish())
  expect(element.textContent).toBe('new')
  await act(async () => pending[0]!.finish())
  expect(element.textContent).toBe('new')
  act(() => root.render(<span>Dismissed</span>))
  expect(pending[2]!.signal.aborted).toBe(true)
  expect(
    pending[2]!.commit(() => {
      throw Error('stale write')
    }),
  ).toBe(false)
})
