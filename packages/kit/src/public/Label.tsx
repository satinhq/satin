import { isValidElement, useContext, type CSSProperties, type ReactNode } from 'react'
import { SymbolImage, type SymbolName, type SymbolImageProps } from '../symbols/Symbol.tsx'
import { ToolbarContext } from './toolbar.tsx'
import { useControlStyle, type BuiltInLabelStyle, type LabelStyle } from './controlStyle.tsx'

/** A label's title (children) and its icon: a `symbol` name or any `icon` node. */
export type LabelProps = {
  children: ReactNode
  icon?: ReactNode
  symbol?: SymbolName
  labelStyle?: BuiltInLabelStyle | LabelStyle
  style?: CSSProperties
}
/** A title with an icon. In a toolbar a label with an icon shows the icon alone; a hidden title
 * stays available to assistive technology. */
export function Label({
  children,
  icon,
  symbol,
  labelStyle: requestedStyle,
  style: cssStyle,
}: LabelProps) {
  const environment = useControlStyle({ labelStyle: requestedStyle })
  const toolbar = useContext(ToolbarContext) !== false
  const style = environment.labelStyle ?? 'automatic'
  // A toolbar draws symbols at its own 22 pt size, as a toolbar Button's `symbol` does.
  const resolvedIcon =
    icon ??
    (symbol ? <SymbolImage name={symbol} style={toolbar ? { fontSize: 22 } : undefined} /> : null)
  if (typeof style === 'object') {
    const body = style.makeBody({ title: children, icon: resolvedIcon })
    return cssStyle ? <span style={cssStyle}>{body}</span> : <>{body}</>
  }
  const iconOnly =
    style === 'iconOnly' ||
    (style === 'automatic' && environment.labelsHidden) ||
    (toolbar && resolvedIcon !== null)
  return (
    <span
      style={cssStyle}
      data-satin-label="true"
      data-satin-label-style={iconOnly ? 'iconOnly' : style}
    >
      {style !== 'titleOnly' && (
        <span
          aria-hidden="true"
          style={
            environment.tint
              ? ({ '--satin-label-tint': environment.tint } as CSSProperties)
              : undefined
          }
        >
          {resolvedIcon}
        </span>
      )}
      <span className={iconOnly ? 'satin-control-accessible-title' : undefined}>{children}</span>
    </span>
  )
}

/** The accessible name of a toolbar label that draws only an icon: a `Label` with an icon, or a
 * `SymbolImage`. A toolbar button or menu with such a label is a glass circle. */
export function toolbarIconName(label: ReactNode): string | undefined {
  if (!isValidElement(label)) return
  if (label.type === SymbolImage) {
    const props = label.props as SymbolImageProps
    return props.label ?? props.name
  }
  if (label.type !== Label) return
  const props = label.props as LabelProps
  if (!props.icon && !props.symbol) return
  return typeof props.children === 'string' ? props.children : (props.symbol ?? 'Icon')
}
