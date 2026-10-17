import { workerAnimationFrameClock } from './frameClock.ts'
import { glassFailureCode } from './errorCode.ts'
import { createWebGPURenderer } from './renderer.ts'
import { glassTiming, setGlassTimingSink } from './profile.ts'
setGlassTimingSink(event => globalThis.postMessage({ glassProfile: event }))
glassTiming('worker-start')
const clock = workerAnimationFrameClock
const renderer = createWebGPURenderer(message => globalThis.postMessage(message), clock)
globalThis.onmessage = event => {
  renderer.receive(event)
}
globalThis.addEventListener('error', event =>
  globalThis.postMessage({
    glassError: {
      code: glassFailureCode('worker runtime', event.message),
      stage: 'worker runtime',
      message: event.message,
    },
  }),
)
globalThis.addEventListener('unhandledrejection', event =>
  globalThis.postMessage({
    glassError: {
      code: glassFailureCode('worker unhandled rejection', event.reason),
      stage: 'worker unhandled rejection',
      message: String(event.reason),
    },
  }),
)
