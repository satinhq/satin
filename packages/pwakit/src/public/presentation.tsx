import type { ReactNode } from 'react'
import type { PresentationDetent } from '../presentation/model.ts'
import {
  FullScreenCover as EngineFullScreenCover,
  Sheet as EngineSheet,
} from '../presentation/Presentation.tsx'
import { ModalPresentationContext } from './presentationContext.ts'
/** Sheet's presentation binding, title, detents and drag behaviour. */
export type SheetProps = {
  isPresented: boolean
  onPresentedChange(presented: boolean): void
  title: string
  onDismiss?(): void
  children: ReactNode
  detents?: readonly PresentationDetent[]
  interactiveDismissDisabled?: boolean
  titleVisibility?: 'visible' | 'hidden'
  dragIndicator?: 'automatic' | 'visible' | 'hidden'
} & (
  | { selection?: never; onSelectionChange?(detent: PresentationDetent): void }
  | { selection: PresentationDetent; onSelectionChange(detent: PresentationDetent): void }
)
/**
 * `sheet(isPresented:)`: a card over the current screen, with optional detents. It can
 * host its own `NavigationStack modal`. Keep `isPresented` in plain React state: presentations
 * start closed after a relaunch.
 *
 * @example
 * <Sheet isPresented={adding} onPresentedChange={setAdding} title="New Note">...</Sheet>
 */
export function Sheet(props: SheetProps) {
  if (props.selection !== undefined && typeof props.onSelectionChange !== 'function')
    throw new TypeError('Controlled sheet selection requires onSelectionChange.')
  return (
    <ModalPresentationContext value={true}>
      <EngineSheet {...props} />
    </ModalPresentationContext>
  )
}
/** FullScreenCover's presentation binding and accessible title. */
export type FullScreenCoverProps = {
  isPresented: boolean
  onPresentedChange(presented: boolean): void
  title: string
  onDismiss?(): void
  children: ReactNode
}
/** `fullScreenCover`: an opaque presentation over the whole screen, closed through its
 * binding or `useDismiss()`. */
export function FullScreenCover(props: FullScreenCoverProps) {
  return (
    <ModalPresentationContext value={true}>
      <EngineFullScreenCover {...props} />
    </ModalPresentationContext>
  )
}
