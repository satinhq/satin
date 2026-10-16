import type { ComponentType } from 'react'
import {
  Button,
  defineApp,
  defineNavigation,
  defineRoutes,
  param,
  route,
  runApp,
  useNotifications,
  type RunAppOptions,
} from '@satinhq/kit'

// Example application code, not additional Satin APIs. No code runs on import.
export function startReminderApp(
  app: ReturnType<typeof defineApp>,
  Lists: ComponentType,
  Details: ComponentType<{ id: string; list: string }>,
  relay: NonNullable<RunAppOptions['notifications']>['relay'],
) {
  const routes = defineRoutes({
    lists: route(Lists, { title: 'Lists' }),
    details: route(Details, {
      title: 'Details',
      params: { id: param.string(), list: param.string() },
    }),
  })
  const navigation = defineNavigation(routes, { stack: { root: 'lists' } })
  return runApp({
    app: app,
    routes: routes,
    navigation: navigation,
    ...{ notifications: { relay } },
  })
}

// Render within runApp. Explain the permission before this explicit user action.
export function EnableReminderNotifications() {
  const { status, error, requestAuthorization } = useNotifications()
  const canEnable = ['ready', 'needs-education', 'rotation-needed', 'revoked'].includes(status)
  return (
    <>
      <Button disabled={!canEnable} onPress={() => void requestAuthorization()}>
        Enable notifications
      </Button>
      {error && <p role="status">{error}</p>}
    </>
  )
}

export type ReminderRequest = {
  // Stable ID for one immutable schedule version. Persist it before the request.
  id: string
  reminderId: string
  listId: string
  calendar: { date: string; time: string; timeZone: string }
}

export type ReminderReceipt = {
  id: string
  state: 'pending' | 'sending' | 'sent' | 'cancelled'
  dueAt: string
}

function readReceipt(value: unknown, id: string): ReminderReceipt {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    value.id !== id ||
    !('state' in value) ||
    !['pending', 'sending', 'sent', 'cancelled'].includes(String(value.state)) ||
    !('dueAt' in value) ||
    typeof value.dueAt !== 'string' ||
    !value.dueAt.endsWith('Z') ||
    !Number.isFinite(Date.parse(value.dueAt))
  ) {
    throw new Error('Invalid server reminder receipt. Reconcile this request before retrying.')
  }
  return value as ReminderReceipt
}

// /api/reminders is YOUR authenticated backend, not a Satin relay endpoint.
export async function registerServerReminder(input: ReminderRequest, ownerToken: string) {
  const response = await fetch(`/api/reminders/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Reminder registration failed: HTTP ${response.status}`)
  return readReceipt(await response.json(), input.id)
}

export async function cancelServerReminder(id: string, ownerToken: string) {
  const response = await fetch(`/api/reminders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${ownerToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Reminder cancellation failed: HTTP ${response.status}`)
  const receipt = readReceipt(await response.json(), id)
  if (receipt.state !== 'cancelled') throw new Error('Server did not confirm cancellation.')
  return receipt
}
