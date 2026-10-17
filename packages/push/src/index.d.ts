export { param, notificationRoutes } from './schema.js'
import type { Server } from 'node:http'
import type { PushRoute, PushRouteRules } from './routes.js'
export interface PushMessage {
  title: string
  body: string
  route: PushRoute<Record<string, string | number | boolean>>
  badge?: number
}
export interface Subscription {
  endpoint: string
  p256dh: string
  auth: string
  applicationServerKey: string
}
export interface PushConfig {
  appURL: string
  routes: PushRouteRules
  vapid: { subject: string; publicKey: string; privateKey: string }
  senderToken: string
  clients: { owner: string; token: string }[]
  testNotification: PushMessage
  store: string
}
export interface DeliveryResult {
  accepted: number
  expired: number
  failed: number
}
export interface SubscriptionRecord {
  owner: string
  subscription: Subscription
  revision: string
  invalid?: boolean
}
export function generateVAPIDKeys(): { publicKey: string; privateKey: string }
export function validateSubscription(value: unknown, publicKey: string): Subscription
export function buildPayload(
  input: PushMessage,
  config: Pick<PushConfig, 'appURL' | 'routes'>,
): {
  satin_push: 1
  routeURL: string
  notification: { title: string; body: string; silent: false }
  app_badge?: string
}
export class FileSubscriptionStore {
  constructor(path: string)
  read(): Promise<SubscriptionRecord[]>
  upsert(
    owner: string,
    subscription: Subscription,
    replacesEndpoint: string | null,
  ): Promise<{ revision: string }>
  remove(owner: string, endpoint: string): Promise<void>
  invalidate(owner: string, endpoint: string): Promise<void>
}
export type PushTransport = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: Record<string, unknown>,
) => Promise<unknown>
export function sendNotification(
  config: PushConfig,
  store: FileSubscriptionStore,
  owner: string,
  input: PushMessage,
  transport?: PushTransport,
): Promise<DeliveryResult>
export function createPushRelay(
  config: PushConfig,
  store: FileSubscriptionStore,
  transport?: PushTransport,
): Server
export function createPushRequest(
  subscription: Parameters<PushTransport>[0],
  payload: string,
  options: Record<string, unknown>,
): { endpoint: string; method: string; headers: Record<string, string | number>; body: Buffer }
export const sendWebPush: PushTransport
