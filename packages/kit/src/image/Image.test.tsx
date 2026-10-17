// @vitest-environment happy-dom
import { act, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Image, AsyncImage } from './Image.tsx'
import { imageCapture } from './resource.ts'
import { ContentAdmission } from './ContentAdmission.tsx'
import { getGlassErrors } from '../glass/errors.ts'
import { rasterProductionSource } from '../glass/webgpu/capture.ts'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { prepareClonedImages, prepareRevealedImages } from '../motion/transitionImages.ts'

it('reveals a zoom clone with its placeholder when the original artwork failed', async () => {
  const source = document.createElement('div')
  source.innerHTML =
    '<img src="https://example.test/unavailable.jpg" style="background: gray; width: 80px; height: 80px">'
  const clone = source.cloneNode(true) as HTMLElement
  const image = clone.querySelector('img')!
  image.decode = () => Promise.reject(new DOMException('Loading error', 'EncodingError'))
  await expect(prepareClonedImages(source, clone)).resolves.toBeUndefined()
  expect(image.src).not.toContain('unavailable.jpg')
  expect(image.style.background).toBe('gray')
  expect(image.style.width).toBe('80px')
})

it('commits a controlled middle insertion before the input event returns', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Form() {
    const [text, setText] = useState('abcd')
    return (
      <ContentAdmission>
        <input value={text} onInput={event => setText(event.currentTarget.value)} />
      </ContentAdmission>
    )
  }
  try {
    await act(() => root.render(<Form />))
    const input = host.querySelector('input')!
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'abXcd',
      )
      input.setSelectionRange(3, 3)
      flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })))
      expect(input.value).toBe('abXcd')
      expect(input.selectionStart).toBe(3)
    })
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('commits a controlled checkbox and its selection label urgently under ScrollSurface', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  function Form() {
    const [selected, setSelected] = useState(false)
    return (
      <ScrollSurface id="urgent-checkbox">
        <input
          type="checkbox"
          checked={selected}
          onChange={event => setSelected(event.target.checked)}
        />
        <span>{selected ? 'Selected' : 'Unselected'}</span>
      </ScrollSurface>
    )
  }
  try {
    await act(() => root.render(<Form />))
    const input = host.querySelector('input')!
    await act(() => {
      flushSync(() => input.click())
      expect(input.checked).toBe(true)
      expect(host.textContent).toContain('Selected')
    })
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('retains geometry, rejects stale source completion and paints repeat visits without a placeholder', async () => {
  const pending = new Map<string, { resolve: () => void; reject: () => void }>()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode() {
        return new Promise<void>((resolve, reject) =>
          pending.set(this.src, {
            resolve,
            reject: () => reject(Error('missing')),
          }),
        )
      }
    },
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const css = document.createElement('style')
  css.textContent = '.album-art { height: 100%; aspect-ratio: 1; }'
  document.head.append(css)
  const asset = {
    src: 'https://art.test/one.jpg',
    width: 80,
    height: 40,
    srcSet: '',
    placeholder: 'data:image/png;base64,placeholder',
  }
  try {
    await act(() => root.render(<Image src={asset} alt="Album" className="album-art" />))
    const image = host.querySelector('img')!
    expect(image.width).toBe(80)
    expect(image.height).toBe(40)
    expect(getComputedStyle(image).height).toBe('100%')
    expect(getComputedStyle(image).aspectRatio).toBe('1 / 1')
    expect(image.getAttribute('alt')).toBe('Album')
    expect(decodeURIComponent(image.src)).toContain(asset.placeholder)
    expect(image.getAttribute('decoding')).toBe('async')
    expect(imageCapture(image)?.source).toBe(asset.src)
    await act(() => root.render(<Image src="https://art.test/two.jpg" alt="Second" />))
    await act(() => pending.get(asset.src)!.resolve())
    expect(image.src).not.toBe(asset.src)
    await act(() => pending.get('https://art.test/two.jpg')!.resolve())
    expect(image.src).toBe('https://art.test/two.jpg')
    const elementDecode = vi
      .spyOn(HTMLImageElement.prototype, 'decode')
      .mockResolvedValue(undefined)
    await act(() => root.render(<Image key="repeat" src={asset} alt="Album" />))
    expect(host.querySelector('img')!.src).toBe(asset.src)
    // Its bytes are in memory: the first paint must not wait for an async decode (grey frames).
    expect(host.querySelector('img')!.getAttribute('decoding')).toBe('sync')
    // A repeat visit uses the cached resource, then verifies this displayed node.
    await expect(imageCapture(host.querySelector('img')!)!.ready).resolves.toBeDefined()
    elementDecode.mockRestore()
    await act(() =>
      root.render(
        <AsyncImage src="https://art.test/missing.jpg" alt="Remote" width={120} height={120} />,
      ),
    )
    expect(imageCapture(host.querySelector('img')!)).toBeUndefined()
    await act(() => pending.get('https://art.test/missing.jpg')!.reject())
    expect(host.querySelector('img')!.width).toBe(120)
    expect(host.querySelector('img')!.src).not.toContain('missing.jpg')
  } finally {
    await act(() => root.unmount())
    host.remove()
    css.remove()
    vi.unstubAllGlobals()
  }
})

it('selects a resized candidate without an app render and keeps the painted art until it decodes', async () => {
  const pending = new Map<string, () => void>()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('innerWidth', 320)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      srcset = ''
      currentSrc = ''
      naturalWidth = 320
      naturalHeight = 320
      decode() {
        this.currentSrc = `https://resize.test/${globalThis.innerWidth}.jpg`
        return new Promise<void>(resolve => pending.set(this.currentSrc, resolve))
      }
    },
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const asset = {
    src: 'https://resize.test/art.jpg',
    srcSet: 'small.jpg 320w, large.jpg 960w',
    width: 960,
    height: 960,
    placeholder: 'data:image/png;base64,placeholder',
  }
  try {
    await act(() =>
      root.render(
        <ContentAdmission>
          <Image src={asset} alt="Album" />
        </ContentAdmission>,
      ),
    )
    await act(() => pending.get('https://resize.test/320.jpg')!())
    expect(host.querySelector('img')!.src).toBe('https://resize.test/320.jpg')
    vi.stubGlobal('innerWidth', 960)
    await act(() => window.dispatchEvent(new Event('resize')))
    expect(host.querySelector('img')!.src).toBe('https://resize.test/320.jpg')
    expect(host.querySelector('img')!.style.display).not.toBe('none')
    await act(() => pending.get('https://resize.test/960.jpg')!())
    expect(host.querySelector('img')!.src).toBe('https://resize.test/960.jpg')
  } finally {
    await act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  }
})

it('waits for the displayed element on a cached priority destination, including repeat pushes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode() {
        return Promise.resolve()
      }
    },
  )
  const { retainDecodedImage, prepareDestinationImages } = await import('./resource.ts')
  const url = 'https://repeat-destination.test/album.jpg'
  const resource = retainDecodedImage(url)
  await resource.ready
  resource.release()
  let resolveElement!: () => void
  const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
    () =>
      new Promise(resolve => {
        resolveElement = resolve
      }),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() =>
      root.render(
        <Image
          src={url}
          alt="Album"
          priority
          width={1000}
          height={1000}
          aspectRatio={1}
          style={{ height: 'auto' }}
        />,
      ),
    )
    const image = host.querySelector('img')!
    expect(image.src).toBe(url)
    // No layout in happy-dom and no fetchPriority IDL: declaration still selects it.
    expect(image.getAttribute('fetchpriority')).toBe('high')
    let prepared = false
    const preparation = prepareDestinationImages(host, new AbortController().signal, 1000).then(
      () => {
        prepared = true
      },
    )
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(displayedDecode).toHaveBeenCalledTimes(1)
    expect(image.dataset.satinImageState).toBe('pending')
    expect(prepared).toBe(false)
    await act(() => resolveElement())
    await preparation
    expect(image.dataset.satinImageState).toBe('ready')
    expect(prepared).toBe(true)
  } finally {
    await act(() => root.unmount())
    host.remove()
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it.each(['fit', 'fill'] as const)(
  'reserves declared intrinsic geometry while pending in %s mode despite fluid app styles',
  async contentMode => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decode() {
          return new Promise<void>(() => {})
        }
      },
    )
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    try {
      await act(() =>
        root.render(
          <Image
            src={`https://reserved.test/${contentMode}.jpg`}
            alt="Album"
            width={320}
            height={160}
            aspectRatio={2}
            contentMode={contentMode}
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: 'auto',
              contain: 'none',
              containIntrinsicSize: '1px',
            }}
          />,
        ),
      )
      const image = host.querySelector('img')!
      expect(image.style.aspectRatio).toBe('2 / 1')
      expect(image.style.height).toBe('auto')
      expect(image.style.contain).toBe('size')
      expect(image.style.containIntrinsicSize).toBe('320px 160px')
      expect(image.style.objectFit).toBe(contentMode === 'fill' ? 'cover' : 'contain')
      // A one-pixel placeholder changes a flex/grid item's intrinsic contribution
      // when loaded. The reserved placeholder must have the declared dimensions.
      expect(image.src).toMatch(/^data:image\/svg\+xml,/)
      const markup = decodeURIComponent(image.src.slice(image.src.indexOf(',') + 1))
      expect(markup).toContain('width="320"')
      expect(markup).toContain('height="160"')
      expect(image.dataset.satinImageState).toBe('pending')
    } finally {
      await act(() => root.unmount())
      host.remove()
      vi.unstubAllGlobals()
    }
  },
)

it('keeps a pushed bundled Image behind preparation when its decode misses the budget', async () => {
  const { prepareDestinationImages, registerImageCapture } = await import('./resource.ts')
  vi.useFakeTimers()
  const host = document.createElement('div')
  const image = document.createElement('img')
  image.setAttribute('fetchpriority', 'high')
  Object.defineProperty(image, 'fetchPriority', { value: 'high' })
  host.append(image)
  let resolve!: (value: HTMLImageElement) => void
  const unregister = registerImageCapture(image, {
    source: 'https://bundled.test/slow.jpg',
    ready: new Promise(value => {
      resolve = value
    }),
  })
  try {
    let revealed = false
    const preparation = prepareDestinationImages(host, new AbortController().signal, 100).then(
      () => {
        revealed = true
      },
    )
    await vi.advanceTimersByTimeAsync(101)
    expect(revealed).toBe(false)
    resolve(image)
    await preparation
    expect(revealed).toBe(true)
    const aborted = new AbortController()
    const retirePending = registerImageCapture(image, {
      source: 'https://bundled.test/cancelled.jpg',
      ready: new Promise(() => {}),
    })
    const cancelled = prepareDestinationImages(host, aborted.signal, 100)
    await vi.advanceTimersByTimeAsync(101)
    aborted.abort()
    await cancelled
    retirePending()
  } finally {
    unregister()
    vi.useRealTimers()
  }
})

it('waits for added destination artwork while ignoring a retired hidden prewarm on reveal', async () => {
  const { prepareDestinationImages, registerImageCapture } = await import('./resource.ts')
  const host = document.createElement('div')
  const first = document.createElement('img')
  const added = document.createElement('img')
  first.setAttribute('fetchpriority', 'high')
  added.setAttribute('fetchpriority', 'high')
  host.append(first)
  let resolveFirst!: (image: HTMLImageElement) => void
  let resolveAdded!: (image: HTMLImageElement) => void
  const retireFirst = registerImageCapture(first, {
    source: 'https://bundled.test/first.jpg',
    ready: new Promise(resolve => {
      resolveFirst = resolve
    }),
  })
  const retireAdded = registerImageCapture(added, {
    source: 'https://bundled.test/added.jpg',
    ready: new Promise(resolve => {
      resolveAdded = resolve
    }),
  })
  const controller = new AbortController()
  vi.useFakeTimers()
  try {
    let revealed = false
    const preparation = prepareDestinationImages(host, controller.signal).then(() => {
      revealed = true
    })
    host.append(added)
    const marker = document.createElement('img')
    marker.setAttribute('data-satin-content-pending', '')
    marker.setAttribute('fetchpriority', 'high')
    host.append(marker)
    const hidden = document.createElement('span')
    hidden.hidden = true
    hidden.innerHTML = '<img data-satin-content-pending="">'
    host.append(hidden)
    resolveFirst(first)
    await vi.advanceTimersByTimeAsync(0)
    expect(revealed).toBe(false)
    resolveAdded(added)
    await vi.advanceTimersByTimeAsync(0)
    expect(revealed).toBe(false)
    marker.remove()
    await preparation
    expect(revealed).toBe(true)
    const preview = document.createElement('span')
    preview.hidden = true
    const hiddenImage = document.createElement('img')
    preview.append(hiddenImage)
    host.append(preview)
    const retireHidden = registerImageCapture(hiddenImage, {
      source: 'https://bundled.test/hidden-prewarm.jpg',
      ready: new Promise(() => {}),
    })
    const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
    try {
      const revealing = prepareRevealedImages(host)
      preview.remove()
      retireHidden()
      await expect(revealing).resolves.toBeUndefined()
    } finally {
      retireHidden()
      displayedDecode.mockRestore()
    }
  } finally {
    controller.abort()
    retireFirst()
    retireAdded()
    vi.useRealTimers()
  }
})

it('commits the selected source once before displayed decode, so React cannot restart a ready image load', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let resolveResource!: () => void
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode() {
        return new Promise<void>(resolve => {
          resolveResource = resolve
        })
      }
    },
  )
  const assign = vi.spyOn(HTMLImageElement.prototype, 'setAttribute')
  const displayedDecode = vi
    .spyOn(HTMLImageElement.prototype, 'decode')
    .mockResolvedValue(undefined)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const url = 'https://single-source-owner.test/art.jpg'
  try {
    await act(() => root.render(<Image src={url} alt="Album" width={1000} height={1000} />))
    await act(() => resolveResource())
    expect(host.querySelector('img')!.src).toBe(url)
    expect(
      assign.mock.calls.filter(([name, source]) => name === 'src' && source === url),
    ).toHaveLength(1)
    expect(displayedDecode).toHaveBeenCalledTimes(1)
    expect(host.querySelector('img')!.dataset.satinImageState).toBe('ready')
  } finally {
    await act(() => root.unmount())
    host.remove()
    assign.mockRestore()
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('does not make a cached AsyncImage delay destination reveal while its displayed node decodes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      decode() {
        return Promise.resolve()
      }
    },
  )
  const { retainDecodedImage, prepareDestinationImages } = await import('./resource.ts')
  const url = 'https://async-destination.test/cached.jpg'
  const resource = retainDecodedImage(url)
  await resource.ready
  resource.release()
  let finishDisplayed!: () => void
  const phases: string[] = []
  const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockReturnValue(
    new Promise(resolve => {
      finishDisplayed = resolve
    }),
  )
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() =>
      root.render(
        <AsyncImage
          src={url}
          alt="Remote"
          priority
          width={100}
          height={100}
          onPhaseChange={phase => phases.push(phase.phase)}
        />,
      ),
    )
    let revealed = false
    void prepareDestinationImages(host, new AbortController().signal).then(() => {
      revealed = true
    })
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(revealed).toBe(true)
    expect(imageCapture(host.querySelector('img')!)).toBeUndefined()
    expect(phases).toEqual(['empty'])
    await act(() => finishDisplayed())
    expect(phases).toEqual(['empty', 'success'])
  } finally {
    await act(() => root.unmount())
    host.remove()
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('commits current labels while retaining decoded artwork and discards superseded sources', async () => {
  const pending = new Map<string, () => void>()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 80
      naturalHeight = 80
      decode() {
        return new Promise<void>(resolve => pending.set(this.src, resolve))
      }
    },
  )
  const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const replacement = (name: string) => (
    <ContentAdmission>
      <div>
        <span>{name}</span>
        <Image src={`https://admission.test/${name}.jpg`} alt={name} />
      </div>
    </ContentAdmission>
  )
  try {
    await act(() =>
      root.render(
        <ContentAdmission>
          <div>Categories</div>
        </ContentAdmission>,
      ),
    )
    await act(() => root.render(replacement('Ambient')))
    expect(host.textContent).toBe('Ambient')
    expect(host.querySelector('img')!.style.visibility).toBe('hidden')
    await act(() => pending.get('https://admission.test/Ambient.jpg')!())
    expect(host.querySelector('img')!.src).toBe('https://admission.test/Ambient.jpg')
    await act(() => root.render(replacement('Indie')))
    expect(host.textContent).toBe('Indie')
    expect(host.querySelector('img')!.src).toBe('https://admission.test/Ambient.jpg')
    await act(() => root.render(replacement('Jazz')))
    await act(() => pending.get('https://admission.test/Indie.jpg')!())
    expect(host.textContent).toBe('Jazz')
    expect(host.querySelector('img')!.src).toBe('https://admission.test/Ambient.jpg')
    await act(() => pending.get('https://admission.test/Jazz.jpg')!())
    expect(host.querySelector('img')!.src).toBe('https://admission.test/Jazz.jpg')
    expect(host.querySelector('img')!.getAttribute('decoding')).toBe('sync')
  } finally {
    await act(() => root.unmount())
    host.remove()
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('settles failed local artwork as a placeholder without reporting a glass capture failure', async () => {
  let rejectAsset = () => {}
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 80
      naturalHeight = 80
      decode() {
        if (this.src.startsWith('data:')) return Promise.resolve()
        return new Promise<void>((_, reject) => {
          rejectAsset = () => reject(Error('Loading error'))
        })
      }
    },
  )
  const displayedDecode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const errors = getGlassErrors().length
  try {
    await act(() =>
      root.render(
        <Image src="https://failure.test/missing.jpg" alt="Missing" width={80} height={80} />,
      ),
    )
    const captured = imageCapture(host.querySelector('img')!)!
    const capture = rasterProductionSource(
      {} as HTMLCanvasElement,
      {
        top: 0,
        left: 0,
        layout: {
          width: 80,
          height: 80,
          contentHeight: 80,
          nodes: [
            {
              kind: 'image',
              id: 'failed-artwork',
              x: 0,
              y: 0,
              width: 80,
              height: 80,
              color: 'transparent',
              imageSource: captured.source,
              imageReady: captured.ready,
            },
          ],
        },
      } as never,
      80,
      80,
      1,
      false,
    ).catch(() => {})
    await act(async () => {
      rejectAsset()
      await capture
    })
    expect(host.querySelector('img')!.dataset.satinImageState).toBe('error')
    expect(host.querySelector('img')!.src).toMatch(/^data:image/)
    expect(getGlassErrors()).toHaveLength(errors)
    await act(() =>
      root.render(
        <ContentAdmission>
          <div>
            Failed results
            <Image src="https://failure.test/admitted.jpg" alt="Failed" />
          </div>
        </ContentAdmission>,
      ),
    )
    await act(() => rejectAsset())
    expect(host.textContent).toBe('Failed results')
    expect(host.querySelector('img')!.dataset.satinImageState).toBe('error')
    expect(host.querySelector('[data-satin-content-pending]')).toBeNull()
  } finally {
    await act(() => root.unmount())
    host.remove()
    displayedDecode.mockRestore()
    vi.unstubAllGlobals()
  }
})

it('commits over-budget first mounts and releases abandoned simultaneous admissions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const pending = new Map<string, () => void>()
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 4096
      naturalHeight = 4096
      decode() {
        return new Promise<void>(resolve => pending.set(this.src, resolve))
      }
    },
  )
  const decode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  const { peekDecodedImage } = await import('./resource.ts')
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const first = 'https://retention.test/first.jpg'
  const abandoned = 'https://retention.test/abandoned.jpg'
  try {
    await act(() =>
      root.render(
        <ContentAdmission>
          <Image key="first" src={first} alt="First" />
          <Image key="abandoned" src={abandoned} alt="Abandoned" />
        </ContentAdmission>,
      ),
    )
    await act(() => pending.get(first)!())
    expect(host.querySelector('img[alt="First"]')!.getAttribute('data-satin-image-state')).toBe(
      'ready',
    )
    expect(host.querySelectorAll('[data-satin-content-pending]')).toHaveLength(1)
    await act(() =>
      root.render(
        <ContentAdmission>
          <Image key="first" src={first} alt="First" />
        </ContentAdmission>,
      ),
    )
    await act(() => pending.get(abandoned)!())
    expect(peekDecodedImage(abandoned)).toBeUndefined()
    expect(host.querySelector('[data-satin-content-pending]')).toBeNull()
    expect(peekDecodedImage(first)).toBeDefined()
  } finally {
    await act(() => root.unmount())
    host.remove()
    decode.mockRestore()
    vi.unstubAllGlobals()
  }
  expect(peekDecodedImage(first)).toBeUndefined()
})

it('preserves successful AsyncImage phases when reachability recovers', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response()),
  )
  let failedOnce = false
  vi.stubGlobal(
    'Image',
    class {
      src = ''
      naturalWidth = 80
      naturalHeight = 80
      decode() {
        if (this.src.endsWith('/retry.jpg') && !failedOnce) {
          failedOnce = true
          return Promise.reject(new Error('Artwork unavailable'))
        }
        return Promise.resolve()
      }
    },
  )
  Object.defineProperty(document, 'images', {
    configurable: true,
    get: () => document.querySelectorAll('img'),
  })
  const decode = vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  const { ReachabilityProvider } = await import('../reachability/react.tsx')
  const phases: string[] = []
  const retryPhases: string[] = []
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() =>
      root.render(
        <ReachabilityProvider
          profile={{
            connectivity: 'server',
            reachability: {
              probe: { url: '/health', method: 'HEAD', timeoutMs: 1000 },
              defaultRoutePolicy: 'local-first',
              routes: {},
              surfaces: { localFirst: 'banner', requiresServer: 'full-screen' },
            },
          }}
        >
          <AsyncImage
            src="https://recovery.test/healthy.jpg"
            alt="Healthy"
            onPhaseChange={phase => phases.push(phase.phase)}
          />
          <AsyncImage
            src="https://recovery.test/retry.jpg"
            alt="Retry"
            onPhaseChange={phase => retryPhases.push(phase.phase)}
          />
        </ReachabilityProvider>,
      ),
    )
    expect(phases).toEqual(['empty', 'success'])
    expect(retryPhases).toEqual(['empty', 'failure'])
    await act(() => window.dispatchEvent(new Event('offline')))
    await act(() => window.dispatchEvent(new Event('online')))
    expect(phases).toEqual(['empty', 'success'])
    expect(retryPhases).toEqual(['empty', 'failure', 'empty', 'success'])
    expect(
      [...host.querySelectorAll('img')].every(image => image.dataset.satinImageState === 'ready'),
    ).toBe(true)
  } finally {
    await act(() => root.unmount())
    host.remove()
    decode.mockRestore()
    vi.unstubAllGlobals()
  }
})
