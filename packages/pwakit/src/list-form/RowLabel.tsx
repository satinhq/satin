import type { ReactNode } from 'react'

/**
 * A row title with a secondary line under it: SwiftUI's two-Text label (a title, then a
 * `.subheadline` `.secondary` line). `RowLabel`, a Toggle subtitle and any other two-line row
 * label share this one body, so their type and spacing cannot drift apart.
 *
 * The ids let a control name itself by the title and describe itself by the secondary line.
 */
export function RowLabelBody({
  children,
  detail,
  titleId,
  detailId,
}: {
  children: ReactNode
  detail: ReactNode
  titleId?: string
  detailId?: string
}) {
  return (
    <span data-satin-row-label-stack="true">
      <span id={titleId} data-satin-row-text="true">
        {children}
      </span>
      <span id={detailId} data-satin-row-subtitle="true">
        {detail}
      </span>
    </span>
  )
}
