import { imageCapture, paintedImage } from '../../image/resource.ts'
import { SymbolImage } from '../../symbols/Symbol.tsx'
import {
  SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX,
  SETTINGS_DETAIL_INLINE_INSET_PX,
  SETTINGS_DETAIL_ROW_HEIGHT_PX,
  SETTINGS_DISCLOSURE_DARK_COLOR,
  SETTINGS_DISCLOSURE_HEIGHT_PX,
  SETTINGS_DISCLOSURE_LIGHT_COLOR,
  SETTINGS_DISCLOSURE_OFFSET_X_PX,
  SETTINGS_DISCLOSURE_OFFSET_Y_PX,
  SETTINGS_DISCLOSURE_WIDTH_PX,
  SETTINGS_GROUP_CORNER_RADIUS_PX,
  SETTINGS_GROUP_SPACING_PX,
  SETTINGS_LARGE_TITLE_FONT_SIZE_PX,
  SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX,
  SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX,
  SETTINGS_ROOT_ROW_HEIGHT_PX,
  SETTINGS_ROW_ICON_CORNER_RADIUS_PX,
  SETTINGS_ROW_ICON_SIZE_PX,
  SETTINGS_ROW_TRAILING_INSET_PX,
  SETTINGS_SEPARATOR_HAIRLINE_PX,
  SETTINGS_SEPARATOR_LEADING_INSET_PX,
  SETTINGS_SEPARATOR_OFFSET_Y_PX,
  SETTINGS_SEPARATOR_TRAILING_INSET_PX,
} from '../../settings/tokens.ts'
import { memo, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import {
  GENERAL_GROUPS,
  ROOT_GROUPS,
  filterGroups,
  type IconName,
  type SettingsGroupData,
  type SettingsRowData,
} from './data.ts'
import { ICON_SVG } from './icons.ts'
import { topLayerDialogOf } from '../topLayer.ts'
import {
  makeReferenceBackgroundCanvas,
  REFERENCE_CONTENT_HEIGHT_PX,
  type ReferenceBackgroundMode,
} from './referenceBackground.ts'
import { GLASS_COMPACT_TAB_BAR_HEIGHT_PX, GLASS_TAB_BAR_BOTTOM_GAP_PX } from '../tokens.ts'
import { canTrackMirrorExtents, scanMirrorTree } from './mirrorExtents.ts'
import { reportGlassError } from '../errors.ts'

export type ScreenId = 'general' | 'root'

/* iOS 27 TabView platter geometry, remeasured against the measured-reference UIKit probe. */
export const GLASS_DOCK_HEIGHT_PX = 62
/* native reference rough-edges, iPhone 17 Pro Max: horizontal icon/label platter is 44 pt. */
export function glassDockHeight(layoutWidth: number, layoutHeight: number) {
  return layoutWidth > layoutHeight ? GLASS_COMPACT_TAB_BAR_HEIGHT_PX : GLASS_DOCK_HEIGHT_PX
}
export const GLASS_DOCK_WIDTH_PX = 360
export const GLASS_DOCK_SIDE_INSET_PX = 21
export const GLASS_DOCK_BOTTOM_GAP_PX = GLASS_TAB_BAR_BOTTOM_GAP_PX
/* The pinned iPhone 17 Pro Max (440 x 956) tab platter is 398 pt wide (measured-reference). */
const CALIBRATED_MAX_DOCK_WIDTH_PX = 398
export const isCalibratedMaxLayout = (
  layoutWidth: number,
  screen: { width: number; height: number },
) => layoutWidth === 440 && screen.width === 440 && screen.height === 956
/** The tab platter's width: the one rule for the glass renderer and the tab slot it reads. */
export function glassDockWidth(
  layoutWidth: number,
  screen: { width: number; height: number },
  insets: { left: number; right: number } = { left: 0, right: 0 },
  layoutHeight?: number,
) {
  const preferred = isCalibratedMaxLayout(layoutWidth, screen)
    ? CALIBRATED_MAX_DOCK_WIDTH_PX
    : layoutWidth > (layoutHeight ?? Math.min(screen.width, screen.height))
      ? 642
      : GLASS_DOCK_WIDTH_PX
  return Math.max(
    0,
    Math.min(preferred, layoutWidth - insets.left - insets.right - GLASS_DOCK_SIDE_INSET_PX * 2),
  )
}
export const GLASS_DOCK_RADIUS_PX = 30.8
export const GLASS_CIRCLE_SIZE_PX = 44
export const GLASS_CIRCLE_INLINE_INSET_PX = 16
export const GLASS_CIRCLE_TOP_PX = 8
// The selection material's 4.5 px source sigma uses taps through 3 sigma. Keep the
// complete source neighbourhood outside even the leading/trailing pill.
export const GLASS_OVERSCAN_X_PX = 64
// The inherited 36 px margin was smaller than the measured native endpoint
// bounce (109 CSS px beyond General's legal range). Keep headroom around that
// observed target value so the endpoint correction cannot expose a retained
// RenderTexture edge.
export const GLASS_OVERSCAN_Y_PX = 128
export { MARKER_INTERVAL_PX } from './mirrorConstants.ts'

const ROOT_SEARCH_TOP_PX =
  SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX + SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX + 8
const SEARCH_FIELD_HEIGHT_PX = 36
const ROOT_ACCOUNT_TOP_PX = ROOT_SEARCH_TOP_PX + SEARCH_FIELD_HEIGHT_PX + SETTINGS_GROUP_SPACING_PX
const ACCOUNT_CARD_HEIGHT_PX = 90
const ROOT_GROUPS_TOP_PX = ROOT_ACCOUNT_TOP_PX + ACCOUNT_CARD_HEIGHT_PX + SETTINGS_GROUP_SPACING_PX
const GENERAL_HERO_HEIGHT_PX = 195
const GENERAL_GROUPS_TOP_PX =
  SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX + GENERAL_HERO_HEIGHT_PX + SETTINGS_GROUP_SPACING_PX

type SceneStyle = CSSProperties & Record<`--${string}`, string>

export const SCENE_STYLE: SceneStyle = {
  '--settings-account-height': `${ACCOUNT_CARD_HEIGHT_PX}px`,
  '--settings-account-top': `${ROOT_ACCOUNT_TOP_PX}px`,
  '--settings-corner-radius': `${SETTINGS_GROUP_CORNER_RADIUS_PX}px`,
  '--settings-detail-content-top': `${SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX}px`,
  '--settings-detail-inset': `${SETTINGS_DETAIL_INLINE_INSET_PX}px`,
  '--settings-detail-row-height': `${SETTINGS_DETAIL_ROW_HEIGHT_PX}px`,
  '--settings-disclosure-dark': SETTINGS_DISCLOSURE_DARK_COLOR,
  '--settings-disclosure-height': `${SETTINGS_DISCLOSURE_HEIGHT_PX}px`,
  '--settings-disclosure-light': SETTINGS_DISCLOSURE_LIGHT_COLOR,
  '--settings-disclosure-offset-x': `${SETTINGS_DISCLOSURE_OFFSET_X_PX}px`,
  '--settings-disclosure-offset-y': `${SETTINGS_DISCLOSURE_OFFSET_Y_PX}px`,
  '--settings-disclosure-width': `${SETTINGS_DISCLOSURE_WIDTH_PX}px`,
  '--settings-general-groups-top': `${GENERAL_GROUPS_TOP_PX}px`,
  '--settings-general-hero-height': `${GENERAL_HERO_HEIGHT_PX}px`,
  '--settings-group-gap': `${SETTINGS_GROUP_SPACING_PX}px`,
  '--settings-icon-radius': `${SETTINGS_ROW_ICON_CORNER_RADIUS_PX}px`,
  '--settings-icon-size': `${SETTINGS_ROW_ICON_SIZE_PX}px`,
  '--settings-large-title-font': `${SETTINGS_LARGE_TITLE_FONT_SIZE_PX}px`,
  '--settings-large-title-line': `${SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX}px`,
  '--settings-root-groups-top': `${ROOT_GROUPS_TOP_PX}px`,
  '--settings-root-inset': 'var(--satin-settings-root-inline-inset, 16px)',
  '--settings-root-row-height': `${SETTINGS_ROOT_ROW_HEIGHT_PX}px`,
  '--settings-root-title-top': `${SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX}px`,
  '--settings-search-height': `${SEARCH_FIELD_HEIGHT_PX}px`,
  '--settings-search-top': `${ROOT_SEARCH_TOP_PX}px`,
  '--settings-separator-hairline': `${SETTINGS_SEPARATOR_HAIRLINE_PX}px`,
  '--settings-separator-leading': `${SETTINGS_SEPARATOR_LEADING_INSET_PX}px`,
  '--settings-separator-offset-y': `${SETTINGS_SEPARATOR_OFFSET_Y_PX}px`,
  '--settings-separator-trailing': `${SETTINGS_SEPARATOR_TRAILING_INSET_PX}px`,
  '--settings-trailing-inset': `${SETTINGS_ROW_TRAILING_INSET_PX}px`,
}

export type MirrorNode = Readonly<{
  clips?: readonly {
    x: number
    y: number
    width: number
    height: number
    radii: readonly number[]
  }[]
  glassRegionId?: string
  regionId?: string
  imageReady?: Promise<HTMLImageElement | undefined>
  imageSource?: string
  imageFit?: string
  /** DOM identity for capture failures; never used as a paint instruction. */
  sourceElement?: string
  color: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  height: number
  icon?: IconName
  id: string
  kind: 'image' | 'chevron' | 'icon' | 'reference-background' | 'rect' | 'text' | 'background'
  /** kind 'background': the element's computed background-image layers and their size, position and repeat lists. */
  background?: Readonly<{ image: string; size: string; position: string; repeat: string }>
  letterSpacing?: number
  lineHeight?: number
  radius?: number
  referenceBackground?: ReferenceBackgroundMode
  sourceOffsetY?: number
  text?: string
  width: number
  x: number
  y: number
}>

export type MirrorLayout = Readonly<{
  contentHeight: number
  measuredAt: number
  nodes: readonly MirrorNode[]
  screen: ScreenId
  width: number
}>

function numeric(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function measuredText(
  element: HTMLElement,
  rect: DOMRect,
  hostRect: DOMRect,
  style: CSSStyleDeclaration,
): MirrorNode {
  const isInput = element instanceof HTMLInputElement
  const paddingLeft = numeric(style.paddingLeft),
    paddingTop = numeric(style.paddingTop)
  const value = isInput ? element.value || element.placeholder : (element.textContent?.trim() ?? '')
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: numeric(style.fontSize, 17),
    fontWeight: style.fontWeight,
    height: rect.height - paddingTop - numeric(style.paddingBottom),
    id: element.dataset.mirrorId ?? value,
    kind: 'text',
    letterSpacing: numeric(style.letterSpacing),
    lineHeight: numeric(style.lineHeight, rect.height),
    text: value,
    width: Math.max(1, rect.width - paddingLeft - numeric(style.paddingRight)),
    x: rect.left - hostRect.left + paddingLeft,
    y: rect.top - hostRect.top + paddingTop,
  }
}

/** DOM geometry is authoritative. This function is only called after layout changes. */
export type MirrorCaptureRange = {
  top: number
  bottom: number
  /** Disjoint rows inside top..bottom: only these are measured. */
  bands?: readonly { top: number; bottom: number }[]
}

/** A presentation's content plane lies under its scroll views, which are planes of their own: its
 * scan never enters them (a sheet's form is most of its elements). */
function outsideNestedScrolls(host: HTMLElement) {
  const elements: HTMLElement[] = [host]
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT, node =>
    (node as Element).hasAttribute('data-satin-scroll')
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT,
  )
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    elements.push(node as HTMLElement)
  return elements
}
export function measureMirrorLayout(
  contentHost: HTMLElement,
  screen: ScreenId,
  includeCoveredRoot = false,
  capture: 'viewport' | 'plane' = 'viewport',
  captureRange?: MirrorCaptureRange,
): MirrorLayout | undefined {
  // WebKit can advance a compositor transform between synchronous layout reads.
  // Accept only a snapshot whose common origin stayed fixed throughout the read.
  // A rejected snapshot is retried before any source texture/cache is changed.
  const before = contentHost.getBoundingClientRect()
  const scrollLeft = contentHost.scrollLeft,
    scrollTop = contentHost.scrollTop
  const layout = measureMirrorLayoutSnapshot(
    contentHost,
    screen,
    includeCoveredRoot,
    capture,
    captureRange,
  )
  const after = contentHost.getBoundingClientRect()
  if (
    before.x !== after.x ||
    before.y !== after.y ||
    before.width !== after.width ||
    before.height !== after.height ||
    scrollLeft !== contentHost.scrollLeft ||
    scrollTop !== contentHost.scrollTop
  )
    return undefined
  // LayoutUnit has six fractional bits in WebKit. Translation through FloatRect
  // can add a 0.00003px cancellation residual to an otherwise exact layout width.
  // Recover layout precision before rasterization, so settlement cannot turn that
  // residual into a new texture key. Typography/style values remain untouched.
  // https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/LayoutUnit.h
  const unit = (value: number) => Math.round(value * 64) / 64
  return {
    ...layout,
    width: unit(layout.width),
    nodes: layout.nodes.map(node => ({
      ...node,
      x: unit(node.x),
      y: unit(node.y),
      width: unit(node.width),
      height: unit(node.height),
      clips: node.clips?.map(roundedMirrorClip),
    })),
  }
}

function roundedMirrorClip(clip: NonNullable<MirrorNode['clips']>[number]) {
  const unit = (value: number) => Math.round(value * 64) / 64
  const width = unit(clip.width)
  const height = unit(clip.height)
  // An empty clip hides every descendant regardless of its origin or corner radii.
  // Keep the clip, but do not let compositor movement of its invisible origin
  // invalidate an otherwise stable source. Positive-area geometry stays measured.
  return width <= 0 || height <= 0
    ? { x: 0, y: 0, width: 0, height: 0, radii: [0, 0, 0, 0] }
    : { ...clip, x: unit(clip.x), y: unit(clip.y), width, height }
}

/** A host whose origin moves on every read (a route inside a running navigation
 * transform) never passes the absolute-origin check. Its own layout is still
 * stable: two consecutive snapshots with identical host-relative geometry are a
 * consistent reading, whatever the origin did. Additive; measureMirrorLayout is unchanged. */
export function measureMirrorLayoutRelative(
  contentHost: HTMLElement,
  screen: ScreenId,
  includeCoveredRoot = false,
  capture: 'viewport' | 'plane' = 'viewport',
  captureRange?: MirrorCaptureRange,
): MirrorLayout | undefined {
  const unit = (value: number) => Math.round(value * 64) / 64
  const read = () => {
    const layout = measureMirrorLayoutSnapshot(
      contentHost,
      screen,
      includeCoveredRoot,
      capture,
      captureRange,
      true,
    )
    return {
      ...layout,
      width: unit(layout.width),
      nodes: layout.nodes.map(node => ({
        ...node,
        x: unit(node.x),
        y: unit(node.y),
        width: unit(node.width),
        height: unit(node.height),
        clips: node.clips?.map(roundedMirrorClip),
      })),
    }
  }
  const first = read(),
    second = read()
  // WebKit advances an accelerated transform between synchronous reads, so two elements of one
  // moving route (a node and its clipping ancestor) can be read a fraction of a point apart.
  // Numbers may differ by up to MOVING_TOLERANCE_PT; anything else must be identical.
  const same = (a: unknown, b: unknown): boolean =>
    typeof a === 'number' && typeof b === 'number'
      ? Math.abs(a - b) <= MOVING_TOLERANCE_PT
      : Array.isArray(a) && Array.isArray(b)
        ? a.length === b.length && a.every((v, i) => same(v, b[i]))
        : a && b && typeof a === 'object' && typeof b === 'object'
          ? Object.keys({ ...a, ...b }).every(k =>
              same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
            )
          : a === b
  if (
    same(
      [first.width, first.contentHeight, first.nodes],
      [second.width, second.contentHeight, second.nodes],
    )
  )
    return second
  // Report the actual rejected field, not an earlier harmless sub-tolerance
  // coordinate difference whose serialized prefix can hide the useful evidence.
  const difference = (a: unknown, b: unknown, path: string): string => {
    if (same(a, b)) return ''
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return `${path}.length: ${a.length} -> ${b.length}`
      for (let i = 0; i < a.length; i++) {
        const changed = difference(a[i], b[i], `${path}[${i}]`)
        if (changed) return changed
      }
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of Object.keys({ ...a, ...b })) {
        const changed = difference(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          `${path}.${key}`,
        )
        if (changed) return changed
      }
    }
    return `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`
  }
  lastUnstableMeasurement = difference(
    { width: first.width, contentHeight: first.contentHeight, nodes: first.nodes },
    { width: second.width, contentHeight: second.contentHeight, nodes: second.nodes },
    'layout',
  )
  return undefined
}
export let lastUnstableMeasurement = ''
/** A moving route's navigation atlas cell is heavily blurred under the glass: a 2 pt reading skew is invisible there. */
const MOVING_TOLERANCE_PT = 2

function measureMirrorLayoutSnapshot(
  contentHost: HTMLElement,
  screen: ScreenId,
  includeCoveredRoot = false,
  capture: 'viewport' | 'plane' = 'viewport',
  captureRange?: MirrorCaptureRange,
  relativeOrigins = false,
): MirrorLayout {
  const hostRect = contentHost.getBoundingClientRect()
  const elements = [...contentHost.querySelectorAll<HTMLElement>('[data-mirror-kind]')]
  if (!elements.length)
    return measureConsumerMirror(
      contentHost,
      screen,
      includeCoveredRoot,
      capture,
      captureRange,
      relativeOrigins,
    )
  const nodes = elements.map((element, index): MirrorNode => {
    const rect = element.getBoundingClientRect()
    const origin = relativeOrigins ? contentHost.getBoundingClientRect() : hostRect
    const style = getComputedStyle(element)
    const kind = element.dataset.mirrorKind as MirrorNode['kind']
    if (kind === 'reference-background')
      return {
        color: 'transparent',
        height: rect.height,
        id: element.dataset.mirrorId ?? 'reference-background',
        kind,
        referenceBackground: element.dataset.referenceBackground as ReferenceBackgroundMode,
        sourceOffsetY: numeric(element.dataset.sourceOffsetY ?? '0'),
        width: rect.width,
        x: rect.left - origin.left,
        y: rect.top - origin.top,
      }
    if (kind === 'text') return measuredText(element, rect, origin, style)
    return {
      color: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? style.color : style.backgroundColor,
      height: rect.height,
      icon: kind === 'icon' ? (element.dataset.mirrorIcon as IconName) : undefined,
      id: element.dataset.mirrorId ?? `${kind}-${index}`,
      kind,
      radius: numeric(style.borderRadius),
      width: rect.width,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
    }
  })
  return {
    contentHeight: contentHost.scrollHeight,
    measuredAt: performance.now(),
    nodes,
    screen,
    width: hostRect.width,
  }
}

function MirrorRect({
  id,
  className,
  children,
}: {
  id: string
  className: string
  children?: ReactNode
}) {
  return (
    <div className={className} data-mirror-kind="rect" data-mirror-id={id}>
      {children}
    </div>
  )
}

function IconTile({ icon, tone }: { icon: IconName; tone?: string }) {
  return (
    <span
      className={`satin-lens-settings-icon satin-lens-settings-icon--${tone ?? 'gray'}`}
      data-mirror-kind="rect"
      data-mirror-id={`tile-${icon}`}
    >
      <span
        className="satin-lens-settings-icon__symbol"
        data-mirror-kind="icon"
        data-mirror-icon={icon}
        data-mirror-id={`icon-${icon}`}
        dangerouslySetInnerHTML={{ __html: ICON_SVG[icon] }}
      />
    </span>
  )
}

function Row({ row, onNavigate }: { row: SettingsRowData; onNavigate?: () => void }) {
  return (
    <button className="satin-lens-settings-row" type="button" onClick={onNavigate}>
      <IconTile icon={row.icon} tone={row.tone} />
      <span
        className="satin-lens-settings-row__label"
        data-mirror-kind="text"
        data-mirror-id={`label-${row.id}`}
      >
        {row.label}
      </span>
      {row.trailing ? (
        <span
          className="satin-lens-settings-row__trailing"
          data-mirror-kind="text"
          data-mirror-id={`trailing-${row.id}`}
        >
          {row.trailing}
        </span>
      ) : null}
      {row.navigates ? (
        <span
          className="satin-lens-settings-chevron"
          data-mirror-kind="chevron"
          data-mirror-id={`chevron-${row.id}`}
          aria-hidden="true"
        />
      ) : null}
    </button>
  )
}

function Groups({
  groups,
  onOpenGeneral,
}: {
  groups: readonly SettingsGroupData[]
  onOpenGeneral?: () => void
}) {
  return (
    <div className="satin-lens-settings-groups">
      {groups.map(group => (
        <section
          className="satin-lens-settings-group"
          key={group.id}
          aria-label={group.header ?? group.id}
        >
          {group.header ? (
            <h2 data-mirror-kind="text" data-mirror-id={`header-${group.id}`}>
              {group.header}
            </h2>
          ) : null}
          <MirrorRect id={`group-${group.id}`} className="satin-lens-settings-group__body">
            {group.rows.map((row, index) => (
              <div className="satin-lens-settings-row-wrap" key={row.id}>
                {index > 0 ? (
                  <span
                    className="satin-lens-settings-separator"
                    data-mirror-kind="rect"
                    data-mirror-id={`separator-${row.id}`}
                    aria-hidden="true"
                  />
                ) : null}
                <Row row={row} onNavigate={row.id === 'general' ? onOpenGeneral : undefined} />
              </div>
            ))}
          </MirrorRect>
          {group.footer ? (
            <p data-mirror-kind="text" data-mirror-id={`footer-${group.id}`}>
              {group.footer}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  )
}

function RootScene({
  query,
  onQuery,
  onOpenGeneral,
}: {
  query: string
  onQuery: (value: string) => void
  onOpenGeneral: () => void
}) {
  const groups = filterGroups(ROOT_GROUPS, query)
  return (
    <>
      <h1
        className="satin-lens-settings-large-title"
        data-mirror-kind="text"
        data-mirror-id="large-title"
      >
        Settings
      </h1>
      <MirrorRect id="search-field" className="satin-lens-settings-search-field">
        <SymbolImage name="magnifyingglass" className="satin-lens-settings-search-icon" />
        <input
          aria-label="Search Settings"
          data-mirror-kind="text"
          data-mirror-id="search-input"
          onChange={event => onQuery(event.currentTarget.value)}
          placeholder="Search"
          type="search"
          value={query}
        />
      </MirrorRect>
      <MirrorRect id="account-card" className="satin-lens-settings-account-card">
        <span
          className="satin-lens-account-mark"
          data-mirror-kind="rect"
          data-mirror-id="satin-lens-account-mark"
          aria-hidden="true"
        />
        <span className="satin-lens-account-copy">
          <strong data-mirror-kind="text" data-mirror-id="account-title">
            Apple Account
          </strong>
          <small data-mirror-kind="text" data-mirror-id="account-body">
            Sign in to access your iCloud data, the App Store, Apple services, and more.
          </small>
        </span>
        <span
          className="satin-lens-settings-chevron"
          data-mirror-kind="chevron"
          data-mirror-id="account-chevron"
          aria-hidden="true"
        />
      </MirrorRect>
      <div className="satin-lens-root-groups">
        <Groups groups={groups} onOpenGeneral={onOpenGeneral} />
      </div>
    </>
  )
}

function GeneralScene() {
  return (
    <>
      <MirrorRect id="general-hero" className="satin-lens-settings-general-hero">
        <IconTile icon="gear" />
        <strong data-mirror-kind="text" data-mirror-id="general-title">
          General
        </strong>
        <p data-mirror-kind="text" data-mirror-id="general-body">
          Manage your overall setup and preferences for iPhone, such as software updates, device
          language, CarPlay, AirDrop, and more.
        </p>
      </MirrorRect>
      <div className="satin-lens-general-groups">
        <Groups groups={GENERAL_GROUPS} />
      </div>
    </>
  )
}

export const SettingsDomScene = memo(function SettingsDomScene({
  contentRef,
  onOpenGeneral,
  onQuery,
  query,
  screen,
}: {
  contentRef: RefObject<HTMLDivElement | null>
  onOpenGeneral: () => void
  onQuery: (value: string) => void
  query: string
  screen: ScreenId
}) {
  return (
    <div
      ref={contentRef}
      className={`satin-lens-settings-dom-content satin-lens-settings-dom-content--${screen}`}
      style={SCENE_STYLE}
      data-screen={screen}
    >
      {screen === 'root' ? (
        <RootScene query={query} onQuery={onQuery} onOpenGeneral={onOpenGeneral} />
      ) : (
        <GeneralScene />
      )}
    </div>
  )
})

export function ReferenceBackgroundScene({
  contentRef,
  height,
  mode,
  sourceOffsetY,
  width,
}: {
  contentRef: RefObject<HTMLDivElement | null>
  height: number
  mode: ReferenceBackgroundMode
  sourceOffsetY: number
  width: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contentHeight = Math.max(height, REFERENCE_CONTENT_HEIGHT_PX - sourceOffsetY)
  useEffect(() => {
    const target = canvasRef.current
    if (!target) return
    const source = makeReferenceBackgroundCanvas(
      mode,
      sourceOffsetY,
      width,
      contentHeight,
      window.devicePixelRatio,
    )
    target.width = source.width
    target.height = source.height
    target.getContext('2d')?.drawImage(source, 0, 0)
  }, [contentHeight, mode, sourceOffsetY, width])
  return (
    <div
      ref={contentRef}
      className="satin-lens-reference-background-content"
      style={{ height: contentHeight, width }}
      data-screen={mode}
    >
      <canvas
        ref={canvasRef}
        className="satin-lens-reference-background-canvas"
        data-mirror-id={`reference-${mode}`}
        data-mirror-kind="reference-background"
        data-reference-background={mode}
        data-source-offset-y={sourceOffsetY}
      />
    </div>
  )
}

/** Diagnostics: `globalThis.__SATIN_MIRROR_AUDIT__ = { scans: 0, mismatches: [] }` measures every
 * windowed capture twice, bounded and whole-tree, and reports any difference as a GlassError. */
type MirrorAudit = { scans: number; mismatches: string[] }
const mirrorAudit = () =>
  (globalThis as { __SATIN_MIRROR_AUDIT__?: MirrorAudit }).__SATIN_MIRROR_AUDIT__

/** Capture semantic app content once at a layout boundary, without app annotations. */
function measureConsumerMirror(
  host: HTMLElement,
  screen: ScreenId,
  includeCoveredRoot = false,
  capture: 'viewport' | 'plane' = 'viewport',
  captureRange?: MirrorCaptureRange,
  relativeOrigins = false,
): MirrorLayout {
  const layout = measureConsumerNodes(
    host,
    screen,
    includeCoveredRoot,
    capture,
    captureRange,
    true,
    relativeOrigins,
  )
  const audit = mirrorAudit()
  if (!audit || !captureRange) return layout
  const whole = measureConsumerNodes(
    host,
    screen,
    includeCoveredRoot,
    capture,
    captureRange,
    false,
    relativeOrigins,
  )
  audit.scans++
  const bounded = JSON.stringify(layout.nodes)
  if (bounded !== JSON.stringify(whole.nodes)) {
    const detail = `${host.dataset.satinScroll ?? host.tagName}: bounded ${layout.nodes.length} nodes, whole-tree ${whole.nodes.length}`
    audit.mismatches.push(detail)
    reportGlassError('presentation', Error(detail), 'backdrop capture', 'bounded-scan-mismatch')
  }
  return layout
}

function measureConsumerNodes(
  host: HTMLElement,
  screen: ScreenId,
  includeCoveredRoot: boolean,
  capture: 'viewport' | 'plane',
  captureRange: MirrorCaptureRange | undefined,
  bounded: boolean,
  relativeOrigins = false,
): MirrorLayout {
  const bounds = host.getBoundingClientRect()
  const nodes: MirrorNode[] = []
  // A modal dialog paints in the top layer, not in its DOM ancestor's plane: its content is its
  // own backdrop plane (discoverBackdropHosts), never part of the page it is nested in. A
  // non-modal dialog (show()) paints in flow and stays part of the page.
  const hostDialog = topLayerDialogOf(host)
  const presentationContent = host.hasAttribute?.('data-satin-presentation-content') === true
  const afterPaint: { element: HTMLElement; node: MirrorNode }[] = []
  // Each clipping ancestor is read once per snapshot (nearest first), not once per descendant:
  // the per-element walk made a snapshot long enough for a route under a running navigation
  // transform to move mid-read, so every measurement attempt was rejected.
  type Clip = NonNullable<MirrorNode['clips']>[number]
  const chains = new Map<Element, readonly Clip[]>()
  const clipChain = (parent: HTMLElement | null): readonly Clip[] => {
    if (!parent || !host.contains(parent)) return []
    const known = chains.get(parent)
    if (known) return known
    const paint = getComputedStyle(parent),
      own: Clip[] = []
    // A scrolling host's own scrollport is not a clip of its capture. The plane holds the host's
    // whole scroll content, and the compositor clips it to the scrollport in viewport space at the
    // live scroll offset (backdropClip). Baked in here, in content space at the capture-time
    // offset, it dropped every row outside the viewport the capture was measured at, so glass
    // over content scrolled in later refracted the page fill.
    const hostScrollport =
      parent === host &&
      (['auto', 'scroll'].includes(paint.overflowX) || ['auto', 'scroll'].includes(paint.overflowY))
    if (
      !hostScrollport &&
      // display:contents has computed overflow but generates no clipping box.
      paint.display !== 'contents' &&
      ['hidden', 'clip', 'auto', 'scroll'].includes(paint.overflowX) &&
      ['hidden', 'clip', 'auto', 'scroll'].includes(paint.overflowY)
    ) {
      const clip = parent.getBoundingClientRect()
      const clipOrigin = relativeOrigins
        ? parent === host
          ? clip
          : host.getBoundingClientRect()
        : bounds
      const radii = [
        paint.borderTopLeftRadius,
        paint.borderTopRightRadius,
        paint.borderBottomRightRadius,
        paint.borderBottomLeftRadius,
      ].map(value => numeric(value))
      // A plane capture of a host that does not scroll also leaves its rectangular
      // clip to the backdrop compositor. Rounded and nested clips still belong to
      // the captured pixels.
      if (capture !== 'plane' || parent !== host || radii.some(radius => radius !== 0)) {
        own.push({
          x: clip.left - clipOrigin.left + host.scrollLeft,
          y: clip.top - clipOrigin.top + host.scrollTop,
          width: clip.width,
          height: clip.height,
          radii,
        })
      }
    }
    const chain = parent === host ? own : [...own, ...clipChain(parent.parentElement)]
    chains.set(parent, chain)
    return chain
  }
  const measureElement = (element: HTMLElement, ranged?: DOMRect) => {
    while (afterPaint.length && !afterPaint.at(-1)!.element.contains(element))
      nodes.push(afterPaint.pop()!.node)
    // A windowed capture reads one rectangle for an element outside its range (the raster's
    // paint margin included) and nothing else: no style, no ancestor walk, no text range.
    // Subtrees that cannot reach the range are not visited at all (scanMirrorTree).
    if (ranged && captureRange) {
      const rangedTop = ranged.top - bounds.top + host.scrollTop
      const outside = (range: { top: number; bottom: number }) =>
        rangedTop + ranged.height < range.top - 64 || rangedTop > range.bottom + 64
      if (captureRange.bands ? captureRange.bands.every(outside) : outside(captureRange)) return
    }
    if (element.closest('dialog') && topLayerDialogOf(element) !== hostDialog) return
    // Navigation title layers are foreground chrome, even when exposed to AX.
    // Accessibility visibility must not put their backdrop into the glass source.
    // The search drawer is navigation chrome pinned inside the scroll view (search/SearchDrawer.tsx):
    // its field and scope labels would show through their own glass.
    const excluded = element.closest(
      '[data-satin-covered="true"], [aria-hidden="true"], [data-satin-liquid], [data-satin-navigation-title-stage], [data-satin-search], [data-satin-search-toolbar], [data-satin-searchable] > [data-satin-list-title], [data-satin-searchable] > [data-satin-scroll-content] > [data-satin-scroll-title]',
    )
    if (excluded && (!includeCoveredRoot || host.contains(excluded))) return
    const accessibleActions = element.closest('[data-satin-action-access]')
    if (accessibleActions && getComputedStyle(accessibleActions).clipPath?.startsWith('inset('))
      return
    // Pair each node with the host on the same short read path. A cached origin
    // can drift throughout a large scan while the compositor keeps translating.
    // This preserves descendant motion and all existing stability tolerances.
    const rect = relativeOrigins
      ? element.getBoundingClientRect()
      : (ranged ?? element.getBoundingClientRect())
    const origin = relativeOrigins
      ? element === host
        ? rect
        : host.getBoundingClientRect()
      : bounds
    const style = getComputedStyle(element)
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden')
      return
    // Content of a glass region is drawn above that glass, not into its backdrop. A presentation's
    // own material around the whole plane is different: it never samples its content (it samples
    // below its dialog), and that content is ordinary backdrop for the glass nested in it.
    const region = element.closest<HTMLElement>('[data-satin-glass-region-id]')
    const presentationMaterial =
      !!region?.classList?.contains('satin-presentation-surface') && !host.contains(region)
    const glassRegionId = presentationMaterial ? undefined : region?.dataset.satinGlassRegionId
    const clips = clipChain(element.parentElement)
    const box = {
      sourceElement:
        `${element.tagName?.toLowerCase() ?? 'element'}${element.id ? `#${element.id}` : ''}${typeof element.className === 'string' && element.className ? `.${element.className.trim().replace(/\s+/g, '.')}` : ''}`.slice(
          0,
          200,
        ),
      clips,
      glassRegionId,
      regionId: glassRegionId,
      x: rect.left - origin.left + host.scrollLeft,
      y: rect.top - origin.top + host.scrollTop,
      width: rect.width,
      height: rect.height,
    }
    if (
      (capture !== 'plane' || element !== host) &&
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      style.backgroundColor !== 'transparent'
    ) {
      nodes.push({
        ...box,
        id: `background-${nodes.length}`,
        kind: 'rect',
        color: style.backgroundColor,
        radius: numeric(style.borderRadius),
      })
    }
    // Background images (gradients) paint above the background colour, below the content.
    if (style.backgroundImage && style.backgroundImage !== 'none') {
      nodes.push({
        ...box,
        id: `background-image-${nodes.length}`,
        kind: 'background',
        color: 'transparent',
        radius: numeric(style.borderRadius),
        background: {
          image: style.backgroundImage,
          size: style.backgroundSize,
          position: style.backgroundPosition,
          repeat: style.backgroundRepeat,
        },
      })
    }
    if (typeof HTMLImageElement !== 'undefined' && element instanceof HTMLImageElement) {
      nodes.push({
        ...box,
        id: `image-${nodes.length}`,
        kind: 'image',
        color: 'transparent',
        imageSource:
          imageCapture(element)?.source ??
          (element.dataset.satinImageState === 'error'
            ? element.src
            : element.currentSrc || element.src),
        imageReady: paintedImage(element),
        imageFit: style.objectFit,
      })
    }
    for (const pseudo of ['::before', '::after']) {
      const paint = getComputedStyle(element, pseudo)
      if (
        !paint.content ||
        paint.content === 'none' ||
        paint.content === 'normal' ||
        paint.display === 'none' ||
        paint.position !== 'absolute' ||
        paint.backgroundColor === 'rgba(0, 0, 0, 0)' ||
        paint.backgroundColor === 'transparent'
      )
        continue
      const height = numeric(paint.height),
        width =
          paint.width === 'auto'
            ? rect.width - numeric(paint.left) - numeric(paint.right)
            : numeric(paint.width)
      if (height <= 0 || width <= 0) continue
      const node: MirrorNode = {
        ...box,
        id: `pseudo-${nodes.length}`,
        kind: 'rect',
        color: paint.backgroundColor,
        radius: numeric(paint.borderRadius),
        x:
          box.x +
          (paint.left === 'auto' ? rect.width - width - numeric(paint.right) : numeric(paint.left)),
        y:
          box.y +
          (paint.top === 'auto'
            ? rect.height - height - numeric(paint.bottom)
            : numeric(paint.top)),
        width,
        height,
      }
      if (pseudo === '::after') afterPaint.push({ element, node })
      else nodes.push(node)
    }
    // Leaf text uses its browser line box. Complex media remains DOM-owned.
    if (
      element.childElementCount === 0 &&
      element.textContent?.trim() &&
      !(element instanceof SVGElement)
    ) {
      const measured = measuredText(element, rect, origin, style)
      nodes.push({
        ...measured,
        sourceElement: box.sourceElement,
        clips,
        glassRegionId,
        regionId: glassRegionId,
        x: measured.x + host.scrollLeft,
        y: measured.y + host.scrollTop,
      })
    }
  }
  if (captureRange && canTrackMirrorExtents()) {
    const viewportTop = bounds.top - host.scrollTop
    const window = {
      top: captureRange.top - 64 + viewportTop,
      bottom: captureRange.bottom + 64 + viewportTop,
    }
    scanMirrorTree(host, window, bounded, measureElement)
  } else
    for (const element of presentationContent
      ? outsideNestedScrolls(host)
      : [host, ...host.querySelectorAll<HTMLElement>('*')])
      measureElement(element, captureRange ? element.getBoundingClientRect() : undefined)

  while (afterPaint.length) nodes.push(afterPaint.pop()!.node)
  return {
    contentHeight: host.scrollHeight,
    measuredAt: performance.now(),
    nodes,
    screen,
    width: bounds.width,
  }
}
