import { estimateStorage, requestPersistentStorage } from '../data/database.ts'
/**
 * The app's storage quota: `estimate()` reports usage, and `requestPersistence()` asks WebKit not
 * to evict the app's data. Request persistence after the user saves something meaningful.
 */
export const storageQuota = Object.freeze({
  estimate: estimateStorage,
  requestPersistence: requestPersistentStorage,
})
