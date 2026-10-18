import {
  useLayoutEffect,
  useSyncExternalStore,
  useState,
  useRef,
  useImperativeHandle,
  useContext,
  useCallback,
  useMemo,
  useDeferredValue,
  Suspense,
  type Ref,
  type CSSProperties,
  type ImgHTMLAttributes,
} from 'react'
import type { ImageAsset } from './asset.ts'
import {
  retainDecodedImage,
  peekDecodedImage,
  registerImageCapture,
  subscribeImageViewport,
  imageViewport,
  decodedImage,
  retryFailedImage,
} from './resource.ts'
import { ContentImageContext, ImagePreparation } from './ContentAdmission.tsx'
import { useReachability } from '../reachability/react.tsx'
import { emptyImageSource } from './resource.ts'

/** An image's source, required alt text and aspect-ratio content mode. */
export interface ImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'srcSet' | 'loading'
> {
  readonly ref?: Ref<HTMLImageElement>
  readonly src: string | ImageAsset
  readonly alt: string
  readonly contentMode?: 'fit' | 'fill'
  readonly aspectRatio?: CSSProperties['aspectRatio']
  readonly priority?: boolean
}

const transparent = emptyImageSource

/** The loading state an `AsyncImage` reports: `empty` while loading, then `success` with the
 * image element or `failure` with the error. */
export type AsyncImagePhase =
  | { readonly phase: 'empty' }
  | { readonly phase: 'success'; readonly image: HTMLImageElement }
  | { readonly phase: 'failure'; readonly error: Error }

/** A one-pixel placeholder has its own intrinsic size. In a shrink-wrapped flex/grid
 * hierarchy it can change the parent's width even when the img has width/height
 * attributes and height:auto. Preserve the declared intrinsic contribution too. */
function reservedPlaceholder(
  width: ImageProps['width'],
  height: ImageProps['height'],
  colour = transparent,
) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return colour
  // Vite emits an inline colour pixel. Never make an SVG load an external placeholder.
  const pixel = colour.startsWith('data:image/')
    ? `<image width="${w}" height="${h}" href="${colour.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" preserveAspectRatio="none"/>`
    : ''
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${pixel}</svg>`,
    )
  )
}

/** Failed content needs a visible state even when its caller supplies no background.
 * Keep it in the image itself so DOM, glass captures and transition clones agree. */
function unavailableArtwork(width: ImageProps['width'], height: ImageProps['height']) {
  const w = Number(width) > 0 ? Number(width) : 64
  const h = Number(height) > 0 ? Number(height) : 64
  const size = Math.min(48, Math.min(w, h) * 0.6)
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#8e8e93" fill-opacity=".12"/><svg x="${(w - size) / 2}" y="${(h - size) / 2}" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" stroke="#8e8e93" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="7" width="22" height="18" rx="3"/><path d="m6 22 7-7 6 6 3-3 4 4M4 4l24 24"/><circle cx="21" cy="12" r="2"/></svg></svg>`,
    )
  )
}

/** Bundled artwork. Intrinsic dimensions and variants come from a ?satin-image import. */
function Artwork({
  remote = false,
  admitted,
  ref,
  src,
  alt,
  contentMode = 'fit',
  aspectRatio,
  priority = false,
  style,
  width,
  height,
  sizes,
  crossOrigin,
  referrerPolicy,
  onLoad,
  onError,
  onPhaseChange,
  ...props
}: ImageProps & {
  remote?: boolean
  admitted?: HTMLImageElement | null
  onPhaseChange?: (phase: AsyncImagePhase) => void
}) {
  const element = useRef<HTMLImageElement>(null)
  // Readiness belongs to this displayed node and selected request. The shared cache
  // avoids fetching/decoding the resource again; it does not authorize a new node.
  const displayed = useRef<
    | {
        source: string
        crossOrigin: ImageProps['crossOrigin']
        referrerPolicy: ImageProps['referrerPolicy']
        ready: boolean
        promise: Promise<void>
      }
    | undefined
  >(undefined)
  const [painted, setPainted] = useState<{ url: string; source: string }>()
  const lastPainted = useRef<{ url: string; source: string } | undefined>(undefined)
  const [failed, setFailed] = useState<{ url: string; source: string }>()
  const { state: reachability } = useReachability()
  const status = reachability.status
  const previousStatus = useRef(status)
  const phaseCallback = useRef(onPhaseChange)
  phaseCallback.current = onPhaseChange
  const publishedPhase = useRef<string | undefined>(undefined)
  const reportedError = useRef<string | undefined>(undefined)
  useImperativeHandle(ref, () => element.current!, [])
  const asset = typeof src === 'string' ? undefined : src
  const url = typeof src === 'string' ? src : src.src
  const reportPhase = useCallback(
    (phase: AsyncImagePhase) => {
      const key = `${url}\0${phase.phase}`
      if (publishedPhase.current === key) return
      publishedPhase.current = key
      phaseCallback.current?.(phase)
    },
    [url],
  )
  useLayoutEffect(() => {
    reportPhase({ phase: 'empty' })
  }, [reportPhase])
  useLayoutEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    if (
      failed?.url === url &&
      status === 'reachable' &&
      (previous === 'server-unreachable' || previous === 'device-offline')
    ) {
      retryFailedImage(url, { srcSet: asset?.srcSet, sizes, priority, crossOrigin, referrerPolicy })
      displayed.current = undefined
      reportedError.current = undefined
      reportPhase({ phase: 'empty' })
      setFailed(undefined)
    }
  }, [status, reportPhase, failed, url, asset, sizes, priority, crossOrigin, referrerPolicy])
  const intrinsicWidth = width ?? asset?.width
  const intrinsicHeight = height ?? asset?.height
  const placeholder = reservedPlaceholder(intrinsicWidth, intrinsicHeight, asset?.placeholder)
  const unavailable = unavailableArtwork(intrinsicWidth, intrinsicHeight)
  const reservedWidth = Number(intrinsicWidth)
  const reservedHeight = Number(intrinsicHeight)
  const reserved =
    Number.isFinite(reservedWidth) &&
    reservedWidth > 0 &&
    Number.isFinite(reservedHeight) &&
    reservedHeight > 0
  // Retained decodes let repeat visits paint immediately, without a placeholder commit.
  const request = { srcSet: asset?.srcSet, sizes, priority, crossOrigin, referrerPolicy }
  const viewport = useSyncExternalStore(subscribeImageViewport, imageViewport, () => '')
  const ready = peekDecodedImage(url, request) ?? admitted
  const admissionFailed = admitted === null
  // A new node for bytes already in memory decodes synchronously, the way UIKit decodes an
  // image on its first display. WebKit drops decoded pixels of images whose layer is already
  // drawn, and an async decode of a new node then paints nothing for several frames: the
  // owner's Now Playing queue showed 4–7 empty 60 Hz frames per toggle (queue-art clip,
  // October 11). Cold loads keep async decoding behind the placeholder.
  const source = admissionFailed
    ? unavailable
    : failed?.url === url
      ? failed.source
      : ready
        ? ready.currentSrc || ready.src
        : painted?.url === url
          ? painted.source
          : placeholder
  // Keep decoded bytes owned across this node's source-selection and paint commits.
  // Capture effects may retire and re-register without opening an eviction gap.
  useLayoutEffect(() => {
    if (admissionFailed || failed?.url === url) return
    const retained = retainDecodedImage(url, {
      srcSet: asset?.srcSet,
      sizes,
      priority,
      crossOrigin,
      referrerPolicy,
    })
    void retained.ready.catch(() => {})
    return retained.release
  }, [
    url,
    asset?.srcSet,
    sizes,
    priority,
    crossOrigin,
    referrerPolicy,
    viewport,
    admissionFailed,
    failed,
  ])
  useLayoutEffect(() => {
    const target = element.current!
    if (admissionFailed || failed?.url === url) {
      target.dataset.satinImageState = 'error'
      if (admissionFailed && reportedError.current !== url) {
        reportedError.current = url
        reportPhase({ phase: 'failure', error: new Error('Image unavailable') })
        target.dispatchEvent(new Event('error'))
      }
      return
    }
    let current = true
    target.dataset.satinImageState =
      displayed.current?.ready &&
      displayed.current.source === target.src &&
      displayed.current.crossOrigin === crossOrigin &&
      displayed.current.referrerPolicy === referrerPolicy
        ? 'ready'
        : 'pending'
    const resource = decodedImage(url, {
      srcSet: asset?.srcSet,
      sizes,
      priority,
      crossOrigin,
      referrerPolicy,
    })
    let unregister = () => {}
    let releaseCommit = () => {}
    const task: Promise<HTMLImageElement> = resource
      .then(async image => {
        if (!current) return image
        const source = image.currentSrc || image.src
        // React owns src. Assigning it here and then in React's commit restarts the
        // WebKit load after the decode that authorized reveal. Select first, retire
        // this capture at the commit, then decode the committed node in the next effect.
        if (target.src !== source) {
          await new Promise<void>(resolve => {
            releaseCommit = resolve
            setPainted(previous =>
              previous?.url === url && previous.source === source ? previous : { url, source },
            )
          })
          if (!current) return image
        }
        let selected = displayed.current
        if (
          !selected ||
          selected.source !== source ||
          selected.crossOrigin !== crossOrigin ||
          selected.referrerPolicy !== referrerPolicy
        ) {
          selected = {
            source,
            crossOrigin,
            referrerPolicy,
            ready: false,
            promise: target.decode(),
          }
          displayed.current = selected
          const decoding = selected
          void decoding.promise.then(
            () => {
              decoding.ready = true
            },
            () => {},
          )
        }
        // Include cached visits. WebKit may load a newly mounted element after the
        // detached cache image is ready. Reuse this node's promise across rerenders.
        await selected.promise
        if (!current) return image
        setPainted(previous =>
          previous?.url === url && previous.source === source ? previous : { url, source },
        )
        lastPainted.current = { url, source }
        target.dataset.satinImageState = 'ready'
        reportPhase({ phase: 'success', image: target })
        if (remote) unregister = registerImageCapture(target, { source, ready: task })
        return image
      })
      .catch(async error => {
        if (!current) return decodedImage(placeholder)
        const fallback = lastPainted.current?.url === url ? lastPainted.current.source : unavailable
        setFailed({ url, source: fallback })
        target.dataset.satinImageState = 'error'
        reportedError.current = url
        reportPhase({
          phase: 'failure',
          error: error instanceof Error ? error : new Error(String(error)),
        })
        target.dispatchEvent(new Event('error'))
        // Glass measured this request before the failure. Give that measurement the
        // same placeholder pixels Image owns; a failed asset is not a failed renderer.
        return decodedImage(fallback)
      })
    if (!remote) unregister = registerImageCapture(target, { source: url, ready: task })
    void task.catch(() => {})
    return () => {
      current = false
      unregister()
      releaseCommit()
    }
  }, [
    url,
    asset,
    sizes,
    priority,
    ready,
    remote,
    crossOrigin,
    referrerPolicy,
    viewport,
    painted,
    placeholder,
    unavailable,
    admissionFailed,
    failed,
    reportPhase,
  ])
  return (
    <img
      {...props}
      ref={element}
      alt={alt}
      width={intrinsicWidth}
      height={intrinsicHeight}
      sizes={sizes}
      crossOrigin={crossOrigin}
      referrerPolicy={referrerPolicy}
      decoding={ready ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      draggable={false}
      src={source}
      onLoad={event => {
        if (event.currentTarget.dataset.satinImageState === 'ready') onLoad?.(event)
      }}
      onError={onError}
      data-satin-image-source={url}
      data-satin-image-intrinsic={asset && height === undefined ? 'true' : undefined}
      data-satin-row-intrinsic="true"
      data-satin-image-state={
        admissionFailed || failed?.url === url
          ? 'error'
          : displayed.current?.ready &&
              displayed.current.source === source &&
              displayed.current.crossOrigin === crossOrigin &&
              displayed.current.referrerPolicy === referrerPolicy
            ? 'ready'
            : 'pending'
      }
      style={{
        objectFit: contentMode === 'fill' ? 'cover' : 'contain',
        ...style,
        ...(aspectRatio === undefined ? {} : { aspectRatio }),
        // Reserve intrinsic contributions even before the inline placeholder loads.
        // Size containment does not add clipping or a new containing block.
        ...(reserved
          ? {
              contain: 'size',
              containIntrinsicSize: `${reservedWidth}px ${reservedHeight}px`,
            }
          : {}),
      }}
    />
  )
}

/** Shows a bundled or local image. It reserves its size so layout never jumps, and `priority`
 * loads it ahead of other images. Use `alt=""` for decoration. */
export function Image(props: ImageProps) {
  const preparation = useContext(ContentImageContext)
  if (!preparation) return <Artwork {...props} />
  return <AdmittedImage {...props} />
}

/** Reserve first-mount geometry without painting an undecoded tile. The marker
 * belongs to this image and is removed when its decoded node can commit. */
function PendingArtwork({
  src,
  width,
  height,
  className,
  style,
  aspectRatio,
  contentMode = 'fit',
  priority,
  hidden,
}: ImageProps) {
  const asset = typeof src === 'string' ? undefined : src
  const intrinsicWidth = width ?? asset?.width
  const intrinsicHeight = height ?? asset?.height
  const reservedWidth = Number(intrinsicWidth)
  const reservedHeight = Number(intrinsicHeight)
  const reserved =
    Number.isFinite(reservedWidth) &&
    reservedWidth > 0 &&
    Number.isFinite(reservedHeight) &&
    reservedHeight > 0
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      width={intrinsicWidth}
      height={intrinsicHeight}
      src={reservedPlaceholder(intrinsicWidth, intrinsicHeight, asset?.placeholder)}
      hidden={hidden}
      data-satin-content-pending=""
      fetchPriority={priority ? 'high' : undefined}
      data-satin-row-intrinsic="true"
      data-satin-image-state="pending"
      data-satin-image-intrinsic={asset && height === undefined ? 'true' : undefined}
      style={{
        objectFit: contentMode === 'fill' ? 'cover' : 'contain',
        ...style,
        ...(aspectRatio === undefined ? {} : { aspectRatio }),
        ...(reserved
          ? { contain: 'size', containIntrinsicSize: `${reservedWidth}px ${reservedHeight}px` }
          : {}),
        visibility: 'hidden',
      }}
    />
  )
}

/** Only source selection can defer. Alt text, geometry, handlers and surrounding
 * controls receive current props even while the previous decoded source stays up.
 * Initial mounts join the existing launch/navigation/tab readiness marker. */
function AdmittedImage(props: ImageProps) {
  const { src, sizes, priority, crossOrigin, referrerPolicy } = props
  const { state } = useReachability()
  const status = state.status !== 'local' ? state.status : 'local'
  const previousStatus = useRef(status)
  const [recovery, setRecovery] = useState(0)
  useLayoutEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    if (
      status === 'reachable' &&
      (previous === 'server-unreachable' || previous === 'device-offline')
    ) {
      retryFailedImage(typeof src === 'string' ? src : src.src, {
        srcSet: typeof src === 'string' ? undefined : src.srcSet,
        sizes,
        priority,
        crossOrigin,
        referrerPolicy,
      })
      setRecovery(value => value + 1)
    }
  }, [status, src, sizes, priority, crossOrigin, referrerPolicy])
  const candidate = useMemo(
    () => ({
      source: { src, sizes, priority, crossOrigin, referrerPolicy },
      recovery,
      images: new ImagePreparation(),
    }),
    [src, sizes, priority, crossOrigin, referrerPolicy, recovery],
  )
  useLayoutEffect(() => {
    candidate.images.activate()
    return () => candidate.images.release()
  }, [candidate])
  return (
    <Suspense fallback={<PendingArtwork {...props} />}>
      <PreparedArtwork {...props} candidate={candidate} />
    </Suspense>
  )
}

function PreparedArtwork({
  candidate,
  ...props
}: ImageProps & {
  candidate: {
    source: Pick<ImageProps, 'src' | 'sizes' | 'priority' | 'crossOrigin' | 'referrerPolicy'>
    recovery: number
    images: ImagePreparation
  }
}) {
  const accepted = useDeferredValue(candidate)
  // A responsive viewport change keeps this accepted decode. Artwork separately
  // prepares its better-sized variant without suspending an external-store update.
  const admitted = useMemo(
    () =>
      accepted.images.read(
        typeof accepted.source.src === 'string' ? accepted.source.src : accepted.source.src.src,
        {
          srcSet: typeof accepted.source.src === 'string' ? undefined : accepted.source.src.srcSet,
          sizes: accepted.source.sizes,
          priority: accepted.source.priority,
          crossOrigin: accepted.source.crossOrigin,
          referrerPolicy: accepted.source.referrerPolicy,
        },
      ),
    [accepted],
  )
  // Artwork's layout effect has acquired displayed ownership before this runs.
  // The parent keeps the settled outcome, but need not pin an old responsive decode.
  useLayoutEffect(() => accepted.images.commit(), [accepted])
  return <Artwork {...props} {...accepted.source} admitted={admitted} />
}

/** An `ImageProps` whose source is a remote URL. */
export interface AsyncImageProps extends Omit<ImageProps, 'src'> {
  readonly src: string
  readonly onPhaseChange?: (phase: AsyncImagePhase) => void
}

/** Loads an image from a URL. It keeps its placeholder if loading fails, never holds up
 * navigation, and reports progress through `onPhaseChange`. */
export function AsyncImage(props: AsyncImageProps) {
  return <Artwork {...props} remote data-satin-async-image="true" />
}
