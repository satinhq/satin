import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const source = 'https://satin.test/photo.png'
const response = (url = source) => {
  const value = new Response('photo', { status: 200 })
  Object.defineProperty(value, 'url', { value: url })
  Object.defineProperty(value, 'redirected', { value: url !== '' && url !== source })
  return value
}

describe('idle image warming', () => {
  let page: EventTarget
  let revoke = vi.fn((url: string) => {
    void url
  })
  let fetchImage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    page = new EventTarget()
    revoke = vi.fn((url: string) => {
      void url
    })
    fetchImage = vi.fn(async () => response())
    vi.stubGlobal('window', page)
    vi.stubGlobal('location', { href: 'https://satin.test/', origin: 'https://satin.test' })
    vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } })
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      callback()
      return 1
    })
    vi.stubGlobal('fetch', fetchImage)
    vi.stubGlobal(
      'Image',
      vi.fn(() => {
        throw new Error('warming must not decode an unused image')
      }),
    )
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:photo-1')
      .mockReturnValueOnce('blob:photo-2')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
      revoke(url)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('finishes without an active service worker and releases URLs on page teardown', async () => {
    const { warmAppImageWhenIdle } = await import('./warmImage.ts')
    expect(await warmAppImageWhenIdle('/photo.png')).toBe('blob:photo-1')
    expect(Image).not.toHaveBeenCalled()
    expect(fetchImage).toHaveBeenCalledOnce()
    page.dispatchEvent(new Event('pagehide'))
    expect(revoke).toHaveBeenCalledWith('blob:photo-1')
    expect(await warmAppImageWhenIdle('/photo.png')).toBe('blob:photo-2')
    expect(fetchImage).toHaveBeenCalledTimes(2)
  })

  it('rejects an off-origin final redirect before creating a Blob URL', async () => {
    fetchImage.mockResolvedValue(response('https://elsewhere.test/photo.png'))
    const { warmAppImageWhenIdle } = await import('./warmImage.ts')
    await expect(warmAppImageWhenIdle('/photo.png')).rejects.toThrow('redirected off-origin')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('warms a precached image whose service-worker Response has an empty url', async () => {
    fetchImage.mockResolvedValue(response(''))
    const { warmAppImageWhenIdle } = await import('./warmImage.ts')
    expect(await warmAppImageWhenIdle('/photo.png')).toMatch(/^blob:/)
  })

  it('keeps the URL while the page is preserved in the back-forward cache', async () => {
    const { warmAppImageWhenIdle } = await import('./warmImage.ts')
    await warmAppImageWhenIdle('/photo.png')
    const event = new Event('pagehide')
    Object.defineProperty(event, 'persisted', { value: true })
    page.dispatchEvent(event)
    expect(revoke).not.toHaveBeenCalled()
    expect(await warmAppImageWhenIdle('/photo.png')).toBe('blob:photo-1')
  })
})
