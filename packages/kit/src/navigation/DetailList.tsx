import type { ReactNode } from 'react'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { Pressable } from '../press/Pressable.tsx'

/** A grouped list of rows for a split view's detail column at regular width. */
export function DetailList({
  items,
}: {
  items: readonly { id: string; label: ReactNode; onPress?: () => void }[]
}) {
  return (
    <ScrollSurface id="detail" axis="vertical" primary data-satin-detail-list="true">
      <div data-satin-detail-group="true">
        {items.map(item =>
          item.onPress ? (
            <Pressable
              feedback="row"
              key={item.id}
              data-satin-detail-row="true"
              onPress={item.onPress}
            >
              {item.label}
            </Pressable>
          ) : (
            <div key={item.id} data-satin-detail-row="true">
              {item.label}
            </div>
          ),
        )}
      </div>
    </ScrollSurface>
  )
}
