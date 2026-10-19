/** Each speculative reader owns only its interest in a request. An ordinary read
 * adopts the work permanently, so cancelling a press cannot cancel its destination. */
export function shareRequest<Value>(promise: Promise<Value>, abandon: () => void) {
  let adopted = false
  let settled = false
  const interests = new Set<symbol>()
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  return (signal?: AbortSignal): Promise<Value> => {
    if (!signal) {
      adopted = true
      return promise
    }
    if (signal.aborted) return Promise.reject(signal.reason)
    const interest = Symbol()
    interests.add(interest)
    return new Promise((resolve, reject) => {
      const release = () => {
        interests.delete(interest)
        signal.removeEventListener('abort', abort)
      }
      const abort = () => {
        release()
        if (!settled && !adopted && interests.size === 0) abandon()
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      void promise.then(
        value => {
          release()
          resolve(value)
        },
        error => {
          release()
          reject(error)
        },
      )
    })
  }
}
