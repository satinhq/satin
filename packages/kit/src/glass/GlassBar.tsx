import { GlassBackground } from './GlassEffect.tsx'
import { Glass } from './regions.ts'
const headerShape = { kind: 'roundedRectangle', cornerRadius: 0 } as const
import { useId, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useGlassMaterialContext } from './context.ts'
import { type GlassVariant } from './tokens.ts'

export type GlassBarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> &
  Readonly<{
    leading?: ReactNode
    title: ReactNode
    trailing?: ReactNode
    variant?: GlassVariant
  }>

export function GlassBar({
  className,
  leading,
  title,
  trailing,
  variant = 'regular',
  ...props
}: GlassBarProps) {
  const { chromeLayer, registerRegion } = useGlassMaterialContext()
  const regionId = useId()
  const elementRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    return registerRegion({ element, id: regionId, radius: 0, variant })
  }, [chromeLayer, regionId, registerRegion, variant])

  if (!chromeLayer) return null

  return createPortal(
    <header
      {...props}
      ref={elementRef}
      className={className}
      data-satin-glass-bar="true"
      data-satin-glass-region={regionId}
      data-satin-glass-variant={variant}
      data-satin-role="chrome"
    >
      <GlassBackground
        shape={headerShape}
        glass={variant === 'clear' ? Glass.clear : Glass.regular}
      />
      <div data-satin-glass-bar-content="true">
        <div data-satin-glass-bar-slot="leading">{leading}</div>
        <div data-satin-glass-bar-title="true">{title}</div>
        <div data-satin-glass-bar-slot="trailing">{trailing}</div>
      </div>
    </header>,
    chromeLayer,
  )
}
