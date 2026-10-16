import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { Pressable, type PressableProps } from '../press/Pressable.tsx'
import { useDarkAppearance } from '../app/appearance.ts'
import { MaterialEffectContext } from './liquidContext.ts'
import { glassPressHighlight } from './pressHighlight.ts'
import { GlassContact, type GlassContactPhase } from './glassContact.ts'
import { GLASS_BACK_SWIPE, type GlassPressKind } from './contactPhysics.ts'
import { nearestSegment } from './lens/scopeSegments.ts'
import {
  ToolbarMaterialContext,
  toolbarMaterials,
  toolbarMaterialOwner,
} from './toolbarMaterialContext.ts'
import {
  Glass,
  glassRadius,
  type GlassRegion,
  type GlassShape,
  type GlassLayer as GlassLayerDescriptor,
} from './regions.ts'
const LayerContext = createContext<GlassLayerDescriptor | undefined>(undefined)
const ContainerContext = createContext<{ id: string; spacing: number } | undefined>(undefined)

/** @internal Portalled presentations own their glass independently of the declaring group. */
export function PresentationGlassBoundary({ children }: { children: ReactNode }) {
  return <ContainerContext value={undefined}>{children}</ContainerContext>
}
export type GlassEffectProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    glass?: Glass
    shape?: GlassShape
    /** @internal Contact lighting owned by the shared menu presenter. */
    touchLight?: boolean
    glassEffectID?: string
    namespace?: string
    union?: string
    transition?: 'matchedGeometry' | 'materialize' | 'identity'
    /** The kind of interactive glass (GLASS_CONTACT_PHYSICS): framework content buttons press as
     * buttons, toolbar buttons as bar buttons, a Menu's trigger as a menu trigger; app surfaces as
     * surfaces. */
    press?: GlassPressKind
    /** @internal A glass Menu emerging from its trigger (fixed layers only). */
    emerge?: GlassRegion['emerge']
    /** @internal The renderer finished this region's close morph (emerge.closing). */
    onEmergeSettled?: () => void
    /** @internal The renderer moved this region's rows between its glass ink and the DOM. */
    onEmergeInk?: (phase: 'open-settled' | 'close-started') => void
  }>
/** Local content remains DOM-owned; only the material canvas is painted by reference. */
export function GlassEffect({
  glass = Glass.regular,
  shape = 'capsule',
  touchLight,
  glassEffectID,
  namespace,
  union,
  transition,
  press,
  emerge,
  onEmergeSettled,
  onEmergeInk,
  children,
  style,
  onPointerDown,
  onPointerUp,
  onClick,
  ...props
}: GlassEffectProps) {
  const id = useId(),
    element = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null)
  // Interactive glass around one text editor presses as a field (GLASS_CONTACT_PHYSICS.field).
  const [hostsField, setHostsField] = useState(false)
  useLayoutEffect(() => {
    const field = !press && glass.material.interactive && !!fieldEditor(element.current)
    if (field !== hostsField) setHostsField(field)
  })
  const pressMaterial = !glass.material.interactive
    ? glass.material
    : press
      ? { ...glass.material, press }
      : hostsField
        ? { ...glass.material, field: true as const }
        : glass.material
  const material = touchLight ? { ...pressMaterial, touchLight: true } : pressMaterial
  // A glass button may let the back swipe through (GLASS_BACK_SWIPE, owner decision pending): its
  // glass then stays pressed while the page moves; a field always owns its drag.
  const yieldsBackSwipe = !!press && !hostsField && GLASS_BACK_SWIPE.yieldingKinds.includes(press)
  const yieldsBackSwipeRef = useRef(yieldsBackSwipe)
  yieldsBackSwipeRef.current = yieldsBackSwipe
  const liquid = useContext(MaterialEffectContext),
    container = useContext(ContainerContext),
    layer = useContext(LayerContext)
  const toolbarCandidate = useContext(ToolbarMaterialContext)
  const [slotOwned, setSlotOwned] = useState(toolbarCandidate)
  const fieldTap = useRef<
    | { pointerId: number; x: number; y: number; editor: HTMLInputElement | HTMLTextAreaElement }
    | undefined
  >(undefined)
  // The one contact path of interactive glass (glassContact.ts). It always sends through the
  // latest render's closure (`sendContact`), so a region or toolbar owner that changed since the
  // press started still receives the drag.
  const sendContact = useRef<(phase: GlassContactPhase, x?: number, y?: number) => void>(() => {})
  const contact = useRef<GlassContact | undefined>(undefined)
  contact.current ??= new GlassContact({
    send: (phase, point) => sendContact.current(phase, point?.x, point?.y),
    yieldsTo: owner => owner !== 'back-swipe' || !yieldsBackSwipeRef.current,
  })
  useEffect(() => {
    const current = contact.current
    // Unmounting, or turning non-interactive, clears a held contact at once.
    return () => current?.end('rest')
  }, [glass.material.interactive])
  const settled = useRef(onEmergeSettled)
  settled.current = onEmergeSettled
  const closing = !!emerge?.closing,
    generation = emerge?.generation
  useEffect(() => {
    if (!closing || !liquid?.regions) return
    // A report for an earlier transition (close, reopen, close) must not end this one.
    return liquid.regions.onEmergeSettled(id, reported => {
      if (reported === generation) settled.current?.()
    })
  }, [closing, generation, liquid?.regions, id])
  const inked = useRef(onEmergeInk)
  inked.current = onEmergeInk
  const emerging = !!emerge
  useEffect(() => {
    if (!emerging || !liquid?.regions) return
    // Only the current transition's hand-off counts (a reversal starts a new one).
    return liquid.regions.onEmergeInk(id, (phase, reported) => {
      if (reported === generation) inked.current?.(phase)
    })
  }, [emerging, generation, liquid?.regions, id])
  const descriptorKey = JSON.stringify([
    material,
    shape,
    glassEffectID,
    namespace,
    union,
    transition,
    container,
    layer,
  ])
  const emergeKey = JSON.stringify(emerge)
  useLayoutEffect(() => {
    // React context crosses portals. A menu opened from a toolbar owns a separate fixed-layer
    // region, so only material that is physically inside the slot delegates ownership.
    const belongsToSlot = Boolean(
      toolbarCandidate && element.current?.closest('[data-satin-navigation-toolbar-slot]'),
    )
    if (slotOwned !== belongsToSlot) setSlotOwned(belongsToSlot)
    if (belongsToSlot && element.current) {
      const content = element.current
      toolbarMaterials.set(content, { glass, shape, press })
      content.dispatchEvent(new Event('satin-toolbar-material', { bubbles: true }))
      return () => {
        toolbarMaterials.delete(content)
      }
    }
    if (!liquid?.regions || !element.current || !canvas.current) return
    if (
      (glassEffectID !== undefined || union !== undefined) &&
      (namespace === undefined || namespace.length === 0)
    )
      throw new Error('glassEffectID and union require a namespace.')
    if (union !== undefined && !container) throw new Error('union requires a GlassEffectContainer.')
    if (
      transition !== undefined &&
      !['matchedGeometry', 'materialize', 'identity'].includes(transition)
    )
      throw new Error('Invalid glass transition.')
    const unregister = liquid.regions.register({
      id,
      element: element.current,
      canvas: canvas.current,
      descriptor: {
        id,
        layer,
        material,
        shape,
        container,
        namespace,
        union,
        transition,
        emerge,
        morph:
          glassEffectID === undefined ? undefined : { id: glassEffectID, namespace: namespace! },
      },
    })
    const observer = new ResizeObserver(liquid.regions.invalidate)
    observer.observe(element.current)
    return () => {
      observer.disconnect()
      unregister()
    }
    // Values are compared structurally so inline material expressions do not re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liquid?.regions, id, descriptorKey, slotOwned, toolbarCandidate])
  useLayoutEffect(() => {
    // Motion is a versioned update of this mounted region, not new DOM ownership.
    // Run after registration, including when a material/layer change replaces the entry.
    liquid?.regions?.updateEmerge(id, emerge)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liquid?.regions, id, descriptorKey, emergeKey, slotOwned, toolbarCandidate])
  // Button-like glass also answers with its label highlight (labels stay live DOM above the glass).
  const highlight = (phase: 'pressed' | 'releasing' | 'rest', epoch: number) => {
    if (!press || !element.current) return
    glassPressHighlight(
      {
        host: element.current,
        labels: [...element.current.children].filter(child => !child.matches('canvas')),
      },
      phase,
      epoch,
      press,
    )
  }
  const sharedMaterial = () => (slotOwned ? toolbarMaterialOwner(element.current) : undefined)
  const radius =
    typeof shape === 'string' ? 9999 : glassRadius(shape, Number.MAX_VALUE, Number.MAX_VALUE)
  /** A client point in the glass's own frame (the shared toolbar material's, when slot-owned). */
  const contactPoint = (x: number, y: number) => {
    const bounds = (sharedMaterial() ?? element.current)?.getBoundingClientRect()
    return bounds ? { x: x - bounds.left, y: y - bounds.top } : undefined
  }
  sendContact.current = (phase, x, y) => {
    const epoch = performance.timeOrigin + performance.now()
    if (phase !== 'dragging') highlight(phase, epoch)
    liquid?.regions?.interact({
      regionId: sharedMaterial()?.dataset.satinGlassRegionId ?? id,
      phase,
      epoch,
      contact: x !== undefined && y !== undefined ? contactPoint(x, y) : undefined,
    })
  }
  return (
    <div
      {...props}
      onPointerDown={event => {
        onPointerDown?.(event)
        fieldTap.current = undefined
        if (!glass.material.interactive) return
        const native = event.nativeEvent
        const editor = hostedEditor(element.current, event.target)
        // A touch on another text input inside the glass keeps its contact to itself; a touch on
        // the field's own editor presses its glass.
        const target = event.target instanceof Element ? event.target : null
        const foreignInput =
          !editor &&
          !!target?.closest(
            'input, textarea, select, [contenteditable], [data-satin-role="text-input"]',
          ) &&
          !ownEditor(element.current, target)
        if (foreignInput || !contact.current?.down(native, element.current!.ownerDocument)) return
        if (editor) {
          // A text field's glass: its padding and rounded edge belong to the editor, as a native
          // field's whole shape does. The tap focuses it (on release, still a tap).
          fieldTap.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            editor,
          }
          element.current?.setAttribute('data-satin-keep-keyboard', 'true')
        }
      }}
      onPointerUp={event => {
        onPointerUp?.(event)
        const tap = fieldTap.current
        if (
          tap?.pointerId !== event.pointerId ||
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) >= FIELD_TAP_SLOP_PX
        )
          fieldTap.current = undefined
      }}
      onClick={event => {
        onClick?.(event)
        const tap = fieldTap.current
        fieldTap.current = undefined
        if (!tap || event.defaultPrevented || !tap.editor.isConnected) return
        // Focus from the tap's click: iOS raises the keyboard for focus in a click handler, not
        // for focus from pointerup when the click lands on the field's padding (iPad: focused,
        // no keyboard). A field still focused after the keyboard's hide key focuses afresh.
        if (document.activeElement === tap.editor) tap.editor.blur()
        tap.editor.focus()
        const end = tap.editor.value.length
        tap.editor.setSelectionRange(end, end)
      }}
      ref={element}
      data-satin-glass-region-id={id}
      data-satin-glass-effect="true"
      data-satin-glass-slot-content={slotOwned || undefined}
      data-satin-glass-interactive={glass.material.interactive || undefined}
      // Interactive glass owns a drag that starts on it: it stretches toward the finger and never
      // starts the back swipe (a glass field never navigates natively). `none` lets the back
      // swipe through a button (GLASS_BACK_SWIPE) without an enclosing owner taking it.
      data-satin-horizontal-drag={
        glass.material.interactive ? (yieldsBackSwipe ? 'none' : 'both') : undefined
      }
      data-satin-glass-press-kind={press}
      style={{
        ...style,
        position: style?.position ?? 'relative',
        isolation: 'isolate',
        borderRadius: radius,
        ...(typeof shape === 'object' && shape.bottomCornerRadius !== undefined
          ? {
              borderBottomLeftRadius: shape.bottomCornerRadius,
              borderBottomRightRadius: shape.bottomCornerRadius,
            }
          : {}),
      }}
    >
      {!slotOwned && (
        <canvas ref={canvas} aria-hidden="true" data-satin-glass-region-canvas="true" />
      )}
      {container ? (
        <div
          data-satin-glass-field-content="true"
          style={{
            // Fixed-size members need a full aperture for their transform anchor.
            // Intrinsic members must keep their content in normal flow to size the region.
            position:
              style?.width !== undefined && style?.height !== undefined ? 'absolute' : 'relative',
            inset: style?.width !== undefined && style?.height !== undefined ? 0 : undefined,
            width: style?.width !== undefined ? '100%' : undefined,
            height: style?.height !== undefined ? '100%' : undefined,
            display: style?.display ?? 'block',
            placeItems: style?.placeItems,
            // Omitted longhands must not erase the alignment shorthand in React.
            ...(style?.alignItems !== undefined ? { alignItems: style.alignItems } : {}),
            justifyContent: style?.justifyContent,
          }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
}
/** `GlassEffectContainer`: groups related glass outlines into one field. */
export function GlassEffectContainer({
  spacing = 20,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { spacing?: number }) {
  const id = useId(),
    element = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null)
  const liquid = useContext(MaterialEffectContext)
  useLayoutEffect(() => {
    if (!element.current || !canvas.current || !liquid?.regions) return
    const unregister = liquid.regions.registerContainer(id, element.current, canvas.current)
    return unregister
  }, [id, liquid?.regions])
  if (!Number.isFinite(spacing) || spacing < 0)
    throw new Error('Glass container spacing must be finite and nonnegative.')
  return (
    <ContainerContext value={{ id, spacing }}>
      <div
        {...props}
        ref={element}
        style={{
          ...props.style,
          position: props.style?.position ?? 'relative',
          isolation: 'isolate',
        }}
      >
        <canvas ref={canvas} aria-hidden="true" data-satin-glass-region-canvas="true" />
        {children}
      </div>
    </ContainerContext>
  )
}
export const GlassContainer = GlassEffectContainer
export const GlassButton = forwardRef<
  HTMLButtonElement,
  PressableProps & {
    glass?: Glass
    shape?: GlassShape
    tint?: string
    buttonStyle?: 'glass' | 'glassProminent'
  }
>(function GlassButton(
  {
    glass = Glass.regular.interactive(),
    shape = 'capsule',
    buttonStyle = 'glass',
    tint,
    children,
    ...props
  },
  ref,
) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const darkAppearance = useDarkAppearance()
  const [resolvedTint, setResolvedTint] = useState<readonly [number, number, number, number]>()
  useLayoutEffect(() => {
    if (buttonStyle !== 'glassProminent' || props.disabled) {
      setResolvedTint(undefined)
      return
    }
    const controlTint = tint ?? 'var(--satin-system-blue)'
    if (!CSS.supports('color', controlTint)) throw new Error(`Invalid control tint: ${controlTint}`)
    const probe = document.createElement('span')
    probe.style.color = controlTint
    buttonRef.current?.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Glass button tint requires a color-resolving canvas.')
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    // Prominent glass owns a saturated tint. Preserve an author's explicit alpha
    // instead of diluting every color with the regular material beneath it.
    setResolvedTint([red! / 255, green! / 255, blue! / 255, alpha! / 255])
  }, [tint, buttonStyle, darkAppearance, props.disabled])
  // Stock iOS 27 sheet confirmation icons retain white ink when disabled, but
  // replace the accent with neutral material. Native samples are in owner-polish-notes.
  const prominentTint = props.disabled
    ? darkAppearance
      ? ([80 / 255, 80 / 255, 81 / 255, 1] as const)
      : ([209 / 255, 209 / 255, 213 / 255, 1] as const)
    : (resolvedTint ?? ([0, 136 / 255, 1, 1] as const))
  return (
    <GlassEffect
      data-satin-row-intrinsic="true"
      shape={shape}
      // The glass takes the finger itself (one contact path); the Pressable inside reads the same
      // touch for its tap. A Menu's trigger (its render prop forwards aria-haspopup) presses as a
      // menu trigger, a toolbar button as a bar button.
      press={
        props['aria-haspopup'] === 'menu'
          ? 'menu'
          : (props as { 'data-satin-toolbar-button'?: string })['data-satin-toolbar-button'] ===
              'true'
            ? 'bar'
            : 'button'
      }
      glass={(buttonStyle === 'glassProminent' ? glass.tint(prominentTint) : glass).interactive(
        glass.material.interactive === true && !props.disabled,
      )}
      style={{ display: 'inline-block' }}
    >
      <Pressable
        {...props}
        ref={element => {
          buttonRef.current = element
          if (typeof ref === 'function') ref(element)
          else if (ref) ref.current = element
        }}
        data-satin-glass-button={buttonStyle}
        style={
          typeof shape === 'object'
            ? {
                ...props.style,
                borderRadius: glassRadius(shape, Number.MAX_VALUE, Number.MAX_VALUE),
              }
            : props.style
        }
        data-satin-glass-press="true"
      >
        {children}
      </Pressable>
    </GlassEffect>
  )
})
/** A toolbar group is one glass button: pressing any item lifts the whole group (native). */
export function ToolbarGroup({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <GlassEffect
      {...props}
      glass={Glass.regular.interactive()}
      press="bar"
      role="group"
      data-satin-toolbar-group="true"
    >
      {children}
    </GlassEffect>
  )
}
export function ToolbarSpacer() {
  return <span aria-hidden="true" data-satin-toolbar-spacer="true" />
}

/** Place this inside the matching ScrollSurface for scroll attachment. */
export function GlassLayer({
  depth = 0,
  attachment = 'scroll',
  children,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { depth?: number; attachment?: 'fixed' | 'scroll' }) {
  const id = useId()
  return (
    <LayerContext
      value={{
        id,
        depth,
        attachment: attachment === 'fixed' ? { kind: 'fixed' } : { kind: 'scroll', scrollId: id },
      }}
    >
      <div
        {...props}
        data-satin-glass-layer={id}
        data-satin-glass-attachment={attachment}
        style={{ ...style, position: attachment === 'fixed' ? 'fixed' : 'relative', zIndex: depth }}
      >
        {children}
      </div>
    </LayerContext>
  )
}

/**
 * Framework chrome can keep its existing DOM geometry and transition refs. An `interactive`
 * chrome button's glass (back, close, sidebar) takes the finger through the same contact path as
 * every interactive glass, as a bar button: the touch anywhere on its button presses it.
 */
export function GlassBackground({
  shape = 'capsule',
  glass = Glass.regular,
  interactive = false,
  selection,
  recipe,
}: {
  shape?: GlassShape
  glass?: Glass
  interactive?: boolean
  /** @internal The selected segment the renderer draws inside this glass (the scope bar). With
   * `onSelect`, the finger can lift and drag the thumb, and a released drag selects the nearest
   * segment through it (a tap stays with the segment's own button). */
  selection?: Readonly<{ index: number; count: number; onSelect?: (index: number) => void }>
  /** @internal The search field's own glass parameters (GlassMaterial.recipe). */
  recipe?: 'searchField'
}) {
  const id = useId(),
    canvas = useRef<HTMLCanvasElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    liquid = useContext(MaterialEffectContext)
  const draggableSelection = !!selection?.onSelect && !!liquid?.regions
  const base = interactive
    ? { ...glass.interactive().material, press: 'bar' as const }
    : glass.material
  const material = recipe ? { ...base, recipe } : base
  const materialKey = JSON.stringify(material)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  useLayoutEffect(() => {
    const target = canvas.current?.parentElement
    if (!target || !canvas.current || !liquid?.regions) return
    const unregister = liquid.regions.register({
      id,
      element: target,
      canvas: canvas.current,
      overlay: overlay.current ?? undefined,
      descriptor: {
        id,
        material,
        shape,
        selection: selectionRef.current && {
          index: selectionRef.current.index,
          count: selectionRef.current.count,
        },
        layer: { id: 'navigation-chrome', depth: 100, attachment: { kind: 'fixed' } },
      },
    })
    const observer = new ResizeObserver(liquid.regions.invalidate)
    observer.observe(target)
    return () => {
      observer.disconnect()
      unregister()
      // The renderer stops drawing the selection's labels with its glass (regionBridge).
      delete target.dataset.satinGlassInk
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, liquid?.regions, shape, materialKey, draggableSelection])
  useSelectionThumbContact(id, canvas, selectionRef, draggableSelection)
  const selectionIndex = selection?.index,
    selectionCount = selection?.count
  // Glass without a selection never talks to the renderer about one.
  const hadSelection = useRef(false)
  useLayoutEffect(() => {
    const next =
      selectionIndex === undefined || selectionCount === undefined
        ? undefined
        : { index: selectionIndex, count: selectionCount }
    if (!next && !hadSelection.current) return
    hadSelection.current = !!next
    liquid?.regions?.updateSelection(id, next)
  }, [id, liquid?.regions, selectionIndex, selectionCount])
  useLayoutEffect(() => {
    const host = canvas.current?.parentElement
    if (!interactive || !host || !liquid?.regions) return
    const regions = liquid.regions
    // The chrome button around this glass takes the touch; its glass is the canvas's parent.
    const button = host.closest<HTMLElement>('[data-satin-pressable]') ?? host
    const yieldsBackSwipe = GLASS_BACK_SWIPE.yieldingKinds.includes('bar')
    const contact = new GlassContact({
      yieldsTo: owner => owner !== 'back-swipe' || !yieldsBackSwipe,
      send: (phase, point) => {
        const epoch = performance.timeOrigin + performance.now()
        if (phase !== 'dragging')
          glassPressHighlight(
            { host, labels: [...host.children].filter(child => !child.matches('canvas')) },
            phase,
            epoch,
            'bar',
          )
        const bounds = host.getBoundingClientRect()
        regions.interact({
          regionId: id,
          phase,
          epoch,
          contact: point ? { x: point.x - bounds.left, y: point.y - bounds.top } : undefined,
        })
      },
    })
    const down = (event: PointerEvent) => {
      const disabled =
        button.matches(':disabled') || button.getAttribute('aria-disabled') === 'true'
      if (!disabled) contact.down(event, button.ownerDocument, button)
    }
    button.addEventListener('pointerdown', down)
    // Like every interactive glass, the button owns a drag that starts on it (no back swipe),
    // unless bar buttons let the back swipe through (GLASS_BACK_SWIPE).
    const ownedDrag = button.dataset.satinHorizontalDrag
    button.dataset.satinHorizontalDrag = yieldsBackSwipe ? 'none' : 'both'
    return () => {
      button.removeEventListener('pointerdown', down)
      if (ownedDrag === undefined) delete button.dataset.satinHorizontalDrag
      else button.dataset.satinHorizontalDrag = ownedDrag
      contact.end('rest')
    }
  }, [interactive, liquid?.regions, id])
  return (
    <>
      <canvas ref={canvas} aria-hidden="true" data-satin-glass-region-canvas="true" />
      {draggableSelection ? (
        <canvas
          ref={overlay}
          aria-hidden="true"
          data-satin-glass-region-canvas="true"
          data-satin-glass-lift="region"
        />
      ) : null}
    </>
  )
}

/** Finger travel that still counts as a tap on a field's glass (UIKit's tap slop). */
const FIELD_TAP_SLOP_PX = 10

/** The one enabled text editor an interactive glass hosts (a field's glass), if any. */
function fieldEditor(region: HTMLElement | null) {
  const editors = region?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(EDITORS)
  const editor = editors?.length === 1 ? editors[0]! : null
  return editor && !editor.disabled && !editor.readOnly ? editor : null
}
const EDITORS =
  'textarea, input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"])'

/** The one editor a glass field hosts, when the touch landed on it (or inside it). */
function ownEditor(region: HTMLElement | null, target: EventTarget | null) {
  if (!region || !(target instanceof Element)) return false
  const editors = region.querySelectorAll('textarea, input:not([type="hidden"])')
  if (editors.length !== 1) return false
  const editor = editors[0]!
  if (editor === target || editor.contains(target)) return true
  return !!target.closest('[data-satin-role="text-input"]')?.contains(editor)
}
/**
 * The one text editor a glass region hosts, when the press is on the region's own surface (its
 * padding, edge, a label or the editor's own padded wrapper), not on a control or on the editor.
 */
function hostedEditor(region: HTMLElement | null, target: EventTarget | null) {
  if (!region || !(target instanceof Element)) return null
  if (
    target.closest(
      'input, textarea, select, [contenteditable], button, a[href], [role="button"], [role="link"], [role="switch"], [role="checkbox"]',
    )
  )
    return null
  return fieldEditor(region)
}

/**
 * The finger on a segmented glass's thumb (the search scope bar), through the one contact path of
 * interactive glass (GlassContact). The renderer's thumb (webgpu/selectionThumb.ts, the tab bar's
 * TabMotion) lifts, follows and snaps; this delivers the finger in region-local px. A drag that
 * grabbed the thumb (pressed on the selected segment) and is released more than 3 px from its
 * start selects the nearest segment; so does a finger that pressed another segment and slid off
 * it. A tap is left to the segment's own button, which selects with its haptic tick. Any other end
 * (a scroll or back swipe took the touch, a cancel) returns the thumb to the selection.
 */
function useSelectionThumbContact(
  id: string,
  canvas: { current: HTMLCanvasElement | null },
  selection: { current: GlassBackgroundSelection | undefined },
  enabled: boolean,
) {
  const liquid = useContext(MaterialEffectContext)
  useLayoutEffect(() => {
    const host = canvas.current?.parentElement
    const regions = liquid?.regions
    if (!enabled || !host || !regions) return
    // Where the finger went down: its x when it grabbed the thumb, else the segment it pressed.
    let thumbStartX: number | undefined
    let pressedSegment: number | undefined
    let lastX = 0
    const contact = new GlassContact({
      yieldsTo: owner => owner !== 'back-swipe',
      send: (phase, point, epoch, end) => {
        const bounds = host.getBoundingClientRect()
        if (point) lastX = point.x - bounds.left
        const released = phase === 'releasing' && end === 'up'
        const live = phase === 'pressed' || phase === 'dragging' || released
        regions.interact({
          regionId: id,
          phase: live ? phase : 'rest',
          epoch,
          contact: { x: lastX, y: bounds.height / 2 },
        })
        const current = selection.current
        if (!current) return
        const segment = nearestSegment(lastX, bounds.width, current.count)
        if (phase === 'pressed') {
          // Only a press on the selected segment grabs the thumb (SelectionThumb.input).
          thumbStartX = segment === current.index ? lastX : undefined
          pressedSegment = segment === current.index ? undefined : segment
        }
        if (released && segment !== current.index) {
          const draggedThumb = thumbStartX !== undefined && Math.abs(lastX - thumbStartX) > 3
          // Native selects the segment under a finger that pressed another segment and slid
          // off it; a release on the pressed segment is its button's click (and haptic tick).
          const slidOff = pressedSegment !== undefined && segment !== pressedSegment
          if (draggedThumb || slidOff) current.onSelect?.(segment)
        }
        if (!live || released) {
          thumbStartX = undefined
          pressedSegment = undefined
        }
      },
    })
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return
      contact.down(event, host.ownerDocument, host)
    }
    host.addEventListener('pointerdown', down)
    // The thumb owns a horizontal drag that starts on the bar (no back swipe from it).
    const ownedDrag = host.dataset.satinHorizontalDrag
    host.dataset.satinHorizontalDrag = 'both'
    return () => {
      host.removeEventListener('pointerdown', down)
      if (ownedDrag === undefined) delete host.dataset.satinHorizontalDrag
      else host.dataset.satinHorizontalDrag = ownedDrag
      contact.end('rest')
    }
  }, [id, canvas, selection, enabled, liquid?.regions])
}
type GlassBackgroundSelection = Readonly<{
  index: number
  count: number
  onSelect?: (index: number) => void
}>
