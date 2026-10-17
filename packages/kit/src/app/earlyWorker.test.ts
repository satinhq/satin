// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { registerEarlyWorker, retryFailedInstallation } from './earlyWorker.ts'

afterEach(() => {
  sessionStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('replaces a broader stale registration lookup without unregistering another app', async () => {
  const postMessage = vi.fn()
  const register = vi.fn(async () => ({ installing: { postMessage } }))
  vi.stubGlobal('location', { href: 'https://test.example/new/' })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => ({
        scope: 'https://test.example/',
        active: { scriptURL: 'https://test.example/sw.js' },
      }),
      register,
    },
  })
  await registerEarlyWorker('/new/')
  expect(register).toHaveBeenCalledWith('https://test.example/new/sw.js', {
    scope: '/new/',
    updateViaCache: 'none',
  })
  expect(postMessage).toHaveBeenCalledWith({ type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' })
})

it.each(['installing', 'redundant'])(
  'resets an unfinished first install only on explicit retry: %s',
  async state => {
    const unregister = vi.fn(async () => true)
    const postMessage = vi.fn()
    const register = vi.fn(async () => ({ installing: { postMessage } }))
    const registration = {
      scope: 'https://test.example/app/',
      installing: { state, scriptURL: 'https://test.example/app/sw.js' },
      unregister,
    }
    vi.stubGlobal('location', { href: 'https://test.example/app/' })
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: async () => registration, register },
    })
    await registerEarlyWorker('/app/', undefined, true)
    expect(unregister).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledOnce()
    expect(unregister.mock.invocationCallOrder[0]).toBeLessThan(
      register.mock.invocationCallOrder[0]!,
    )
  },
)
it('keeps an active working version even with a stalled installing replacement', async () => {
  const unregister = vi.fn()
  const register = vi.fn()
  const registration = {
    scope: 'https://test.example/app/',
    active: { state: 'activated' },
    installing: {
      state: 'installing',
      scriptURL: 'https://test.example/app/sw.js',
      postMessage: vi.fn(),
    },
    unregister,
  }
  vi.stubGlobal('location', { href: 'https://test.example/app/' })
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => registration, register },
  })
  await registerEarlyWorker('/app/')
  expect(unregister).not.toHaveBeenCalled()
  expect(register).not.toHaveBeenCalled()
})

it('finishes the reset handshake before a WebKit registration promise settles', async () => {
  let finishReset!: (value: boolean) => void
  const unregister = vi.fn(
    () =>
      new Promise<boolean>(resolve => {
        finishReset = resolve
      }),
  )
  const register = vi.fn(() => new Promise(() => {}))
  const onLookupComplete = vi.fn()
  vi.stubGlobal('location', { href: 'https://test.example/app/' })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => ({
        scope: 'https://test.example/app/',
        installing: { scriptURL: 'https://test.example/app/sw.js' },
        unregister,
      }),
      register,
    },
  })
  void registerEarlyWorker('/app/', onLookupComplete, true)
  await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce())
  expect(onLookupComplete).not.toHaveBeenCalled()
  finishReset(true)
  await vi.waitFor(() => expect(onLookupComplete).toHaveBeenCalledOnce())
  expect(onLookupComplete).toHaveBeenCalledOnce()
  expect(register).toHaveBeenCalledOnce()
})

// Another document, reload, prerender and bfcache restore all share this join path.
it.each(['second client', 'plain reload', 'prerender', 'bfcache restore', 'waiting'])(
  'joins a healthy first install without reset: %s',
  async scenario => {
    const postMessage = vi.fn()
    const unregister = vi.fn()
    const register = vi.fn()
    const worker = { scriptURL: 'https://test.example/app/sw.js', postMessage }
    const registration = {
      scope: 'https://test.example/app/',
      [scenario === 'waiting' ? 'waiting' : 'installing']: worker,
      unregister,
    }
    vi.stubGlobal('location', { href: 'https://test.example/app/' })
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: async () => registration, register },
    })
    await registerEarlyWorker('/app/', undefined, scenario === 'waiting')
    expect(unregister).not.toHaveBeenCalled()
    expect(register).not.toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({ type: 'SATIN_DOWNLOAD_PROGRESS_REQUEST' })
  },
)
it.each(['lookup', 'unregister'])(
  'bounds a hung %s and completes the head handshake',
  async operation => {
    vi.useFakeTimers()
    const never = () => new Promise(() => {})
    const registration = {
      scope: 'https://test.example/app/',
      installing: { scriptURL: 'https://test.example/app/sw.js' },
      unregister: never,
    }
    const complete = vi.fn()
    const register = vi.fn()
    vi.stubGlobal('location', { href: 'https://test.example/app/' })
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: operation === 'lookup' ? never : async () => registration,
        register,
      },
    })
    const pending = registerEarlyWorker('/app/', complete, true)
    const failure = expect(pending).rejects.toThrow('Service worker reset did not finish')
    await vi.advanceTimersByTimeAsync(3001)
    await failure
    expect(complete).toHaveBeenCalledWith(expect.any(Error))
    expect(register).not.toHaveBeenCalled()
  },
)
it('reports a reset that resolves without unregistering', async () => {
  const complete = vi.fn()
  const register = vi.fn()
  const registration = {
    scope: 'https://test.example/app/',
    installing: { scriptURL: 'https://test.example/app/sw.js' },
    unregister: async () => false,
  }
  vi.stubGlobal('location', { href: 'https://test.example/app/' })
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => registration, register },
  })
  await expect(registerEarlyWorker('/app/', complete, true)).rejects.toThrow(
    'Service worker reset did not finish',
  )
  expect(complete).toHaveBeenCalledWith(expect.any(Error))
  expect(register).not.toHaveBeenCalled()
})
it('consumes the watchdog reload reset request once', async () => {
  const unregister = vi.fn(async () => true)
  const postMessage = vi.fn()
  const registration = {
    scope: 'https://test.example/app/',
    installing: { scriptURL: 'https://test.example/app/sw.js', postMessage },
    unregister,
  }
  const register = vi.fn(async () => registration)
  vi.stubGlobal('location', { href: 'https://test.example/app/' })
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => registration, register },
  })
  sessionStorage.setItem('satin-install-reset:/app/', '1')
  await registerEarlyWorker('/app/')
  expect(unregister).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem('satin-install-reset:/app/')).toBeNull()
  await registerEarlyWorker('/app/')
  expect(unregister).toHaveBeenCalledOnce()
})
it('in-app retry resets directly and leaves registration to preparation without reload', async () => {
  const unregister = vi.fn(async () => true)
  const register = vi.fn(() => new Promise(() => {}))
  const reload = vi.fn()
  vi.stubGlobal('location', { href: 'https://test.example/app/', reload })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      getRegistration: async () => ({
        scope: 'https://test.example/app/',
        installing: { scriptURL: 'https://test.example/app/sw.js' },
        unregister,
      }),
      register,
    },
  })
  await retryFailedInstallation('/app/')
  expect(unregister).toHaveBeenCalledOnce()
  expect(register).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
})
