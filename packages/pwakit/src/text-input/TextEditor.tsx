import { useKeyboardMetrics } from '../keyboard/adapter.ts'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { editorHeight } from './editorGeometry.ts'
import { measureEditorContentHeight } from './measureEditor.ts'
import {
  forwardRef,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from 'react'

export type TextEditorProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange' | 'rows'
> & {
  value: string
  onChange(value: string): void
  label?: string
  /** Bound content growth independently of the parent, for composers and compact editors. */
  maxLines?: number
  minLines?: number
  variant?: 'standalone' | 'row' | 'plain'
  labelVisibility?: 'visible' | 'hidden'
  /** Internal semantic marker for the shared vertical TextField editor. */
  field?: boolean
}
export const TextEditor = forwardRef<HTMLTextAreaElement, TextEditorProps>(function TextEditor(
  {
    value,
    onChange,
    label,
    autoFocus,
    minLines = 3,
    maxLines,
    variant = 'standalone',
    labelVisibility = 'visible',
    field = false,
    id,
    ...props
  },
  forwardedRef,
) {
  const keyboard = useKeyboardMetrics()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const ref = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(forwardedRef, () => ref.current!, [])
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const surface = element.closest<HTMLElement>('[data-satin-scroll-axis="vertical"]')
    function resize() {
      if (!element) return
      const css = getComputedStyle(element)
      const lineHeight = parseFloat(css.lineHeight) || 22
      const padding = (parseFloat(css.paddingTop) || 0) + (parseFloat(css.paddingBottom) || 0)
      // Only a scroll surface bounds growth. A content-sized parent is the editor's own height,
      // so reading it as a limit would stop the editor from ever growing.
      const containerHeight = surface?.clientHeight ?? Infinity
      const visibleHeight =
        keyboard.viewportHeight > 0
          ? keyboard.viewportHeight -
            Math.max(0, (surface?.getBoundingClientRect().top ?? 0) - keyboard.offsetTop)
          : containerHeight
      // WebKit owns the focused editor's caret and editing UI. Never collapse that control
      // to measure it: use an isolated, non-focusable copy with the same text layout instead.
      const available =
        maxLines === undefined
          ? Math.min(containerHeight, visibleHeight) - 24
          : Math.min(
              Math.max(minLines, maxLines) * lineHeight + padding,
              keyboard.viewportHeight > 0 ? visibleHeight - 24 : Infinity,
            )
      const height = editorHeight(
        measureEditorContentHeight(element),
        minLines,
        lineHeight,
        padding,
        available,
      )
      if (element.style.height === `${height}px`) return
      // The editable viewport must fit the newly wrapped line before WebKit reveals
      // its caret. Interpolating this height creates an internally scrolling textarea
      // on every frame and lets caret reveal fight the animation. The bottom-anchored
      // transcript owns the resulting inset displacement instead.
      element.style.height = `${height}px`
    }
    resize()
    // Wrapping changes with the editor's width, so a narrower layout must re-measure.
    let width = element.getBoundingClientRect().width
    let viewport = surface?.clientHeight
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width
      const nextViewport = surface?.clientHeight
      // Animated height deliveries do not change wrapping. Do not create a measuring
      // textarea or force layout again on every animation frame.
      if (nextWidth === width && nextViewport === viewport) return
      width = nextWidth
      viewport = nextViewport
      resize()
    })
    observer.observe(element)
    if (surface) observer.observe(surface)
    element.addEventListener('input', resize)
    return () => {
      observer.disconnect()
      element.removeEventListener('input', resize)
    }
  }, [value, minLines, maxLines, keyboard.viewportHeight, keyboard.offsetTop])
  useLayoutEffect(() => {
    if (autoFocus && ref.current) focusFromFramework(ref.current, { preventScroll: true })
  }, [autoFocus])
  return (
    <div
      className="satin-text-editor"
      data-satin-field-style={variant}
      data-satin-label-visibility={labelVisibility}
    >
      {label && <label htmlFor={inputId}>{label}</label>}
      <textarea
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        {...props}
        id={inputId}
        ref={ref}
        aria-label={props['aria-label'] ?? (label ? undefined : (props.placeholder ?? 'Text'))}
        data-satin-role="text-input"
        data-satin-text-editor={field ? undefined : 'true'}
        data-satin-text-field={field ? 'true' : undefined}
        data-satin-field-axis={field ? 'vertical' : undefined}
        rows={Math.max(1, minLines)}
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
      />
    </div>
  )
})
