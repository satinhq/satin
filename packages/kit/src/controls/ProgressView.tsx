import { useContext, useId, type ReactNode } from 'react'
import { ScreenContext } from '../navigation/navigationContext.tsx'
import { TabActivityContext } from '../tabs/context.ts'
import { controlTintStyle, useControlStyle } from '../public/controlStyle.tsx'
import { ControlRow } from './ControlRow.tsx'
import { ActivityIndicatorSegments } from './ActivityIndicatorSegments.tsx'

/** How a `ProgressView` draws: `linear`, `circular` or `automatic`, which is linear with a value
 * and circular without. */
export type ProgressViewStyle = 'automatic' | 'linear' | 'circular'

/** ProgressView's optional label and progress; without `value` it is indeterminate. */
export type ProgressViewProps = {
  /** `automatic` is linear with a value and circular without. */
  progressViewStyle?: ProgressViewStyle
  label?: ReactNode
  /** Omit value for an indeterminate activity indicator. */
  value?: number
  total?: number
  tint?: string
  'aria-label'?: string
}

/** A spinning activity indicator, or a linear bar showing `value` out of `total` (1 by default). */
export function ProgressView({
  label,
  progressViewStyle = 'automatic',
  value,
  total = 1,
  tint,
  'aria-label': accessibleLabel,
}: ProgressViewProps) {
  const labelId = useId()
  const screen = useContext(ScreenContext)
  const tabActive = useContext(TabActivityContext)
  const running = tabActive && !screen?.lifecycle.isCovered
  const appearance = useControlStyle({ tint })
  if (!Number.isFinite(total) || total <= 0 || (value !== undefined && !Number.isFinite(value))) {
    throw new Error('ProgressView requires a finite value and a finite positive total.')
  }
  const determinate = value !== undefined
  const resolvedStyle =
    progressViewStyle === 'automatic' ? (determinate ? 'linear' : 'circular') : progressViewStyle
  const linear = resolvedStyle === 'linear'
  const clampedValue = determinate ? Math.min(total, Math.max(0, value)) : undefined
  return (
    <ControlRow>
      <div
        data-satin-row-intrinsic={linear ? undefined : 'true'}
        data-satin-progress-view={resolvedStyle}
        style={controlTintStyle(appearance.tint)}
      >
        {linear && label != null && (
          <div id={labelId} hidden={appearance.labelsHidden}>
            {label}
          </div>
        )}
        <div
          role="progressbar"
          aria-label={accessibleLabel ?? (label == null ? 'Loading' : undefined)}
          aria-labelledby={accessibleLabel === undefined && label != null ? labelId : undefined}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? total : undefined}
          aria-valuenow={clampedValue}
        >
          {linear ? (
            <div data-satin-progress-track="true">
              <div
                data-satin-progress-fill="true"
                style={{ transform: `scaleX(${(clampedValue ?? 0) / total})` }}
              />
            </div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <ActivityIndicatorSegments running={running} />
            </svg>
          )}
        </div>
        {!linear && label != null && (
          <div id={labelId} hidden={appearance.labelsHidden} data-satin-progress-label="true">
            {label}
          </div>
        )}
      </div>
    </ControlRow>
  )
}
