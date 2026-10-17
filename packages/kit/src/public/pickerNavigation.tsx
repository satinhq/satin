import { useContext, useId, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { NavigatorContext, useNavigator, useParams } from '../navigation/navigationContext.tsx'
import { List, PickerOptions, Row, type PickerRowProps } from '../list-form/ListForm.tsx'
export const pickerRouteId = '__satin:picker'
type ChoiceState = Omit<PickerRowProps, 'onNavigate' | 'presentation'>
/**
 * What a pushed options list shows. The owning Picker keeps `state` current; when the Picker is
 * removed, `state` becomes null and the list shows that the selection is no longer available.
 * `title` outlives the owner so the destination keeps its navigation title until it is popped.
 */
type PickerSession = { state: ChoiceState | null; title: string; listeners: Set<() => void> }
const sessions = new Map<string, PickerSession>()
export function pickerTitle(params: unknown) {
  return sessions.get((params as { id?: string })?.id ?? '')?.title ?? ''
}
function notify(session: PickerSession) {
  session.listeners.forEach(listener => listener())
}
export function usePickerNavigation(state: ChoiceState) {
  const id = useId()
  const navigator = useContext(NavigatorContext)
  useLayoutEffect(() => {
    const session = sessions.get(id)
    if (session) {
      session.state = state
      session.title = state.label
      notify(session)
    }
  }, [id, state])
  // Retire the session in layout cleanup, before a press on the open list can reach a Picker
  // that is no longer there. The destination removes the session when it is popped.
  useLayoutEffect(
    () => () => {
      const session = sessions.get(id)
      if (session) {
        session.state = null
        notify(session)
      }
    },
    [id],
  )
  return () => {
    if (!navigator) throw new Error('Picker navigationLink requires NavigationStack')
    sessions.set(id, { state, title: state.label, listeners: new Set() })
    navigator.push(pickerRouteId, { id })
  }
}
export function PickerDestination() {
  const { id } = useParams<{ id: string }>()
  const navigator = useNavigator()
  // The session this destination was pushed for. A later push from the same Picker makes a new one.
  const [session] = useState(() => sessions.get(id))
  const state = useSyncExternalStore(
    listener => {
      session?.listeners.add(listener)
      return () => {
        session?.listeners.delete(listener)
      }
    },
    () => session?.state ?? null,
    () => session?.state ?? null,
  )
  useLayoutEffect(
    () => () => {
      if (sessions.get(id) === session) sessions.delete(id)
    },
    [id, session],
  )
  const title = session?.title ?? 'Selection'
  if (!state) {
    return (
      <List id={`picker-${id}`} navigationTitle={title} navigationTitleDisplay="inline">
        <Row label="Selection unavailable" />
      </List>
    )
  }
  return (
    <List id={`picker-${id}`} navigationTitle={title} navigationTitleDisplay="inline">
      <PickerOptions
        {...state}
        labelPlacement="navigationTitle"
        onChange={value => {
          // PickerOptions already checked this option against the Picker's current state.
          state.onChange(value)
          navigator.pop()
        }}
      />
    </List>
  )
}
