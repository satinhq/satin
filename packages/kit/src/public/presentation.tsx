import type { ReactNode } from 'react'
import type { PresentationDetent } from '../presentation/model.ts'
import {
  FullScreenCover as EngineFullScreenCover,
  Sheet as EngineSheet,
} from '../presentation/Presentation.tsx'
import { ModalPresentationContext } from './presentationContext.ts'
/** A sheet's presentation binding, title, detents and drag behaviour. Supplying `selection`
 * requires `onSelectionChange`. */
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
 * A card that slides up over the current screen and can rest at several heights. It can host
 * its own `NavigationStack modal`. Keep `isPresented` in plain React state: presentations start
 * closed after a relaunch.
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
/** A full-screen cover's presentation binding and accessible title. */
export type FullScreenCoverProps = {
  isPresented: boolean
  onPresentedChange(presented: boolean): void
  title: string
  onDismiss?(): void
  children: ReactNode
}
/** An opaque presentation that slides up over the whole screen. It has no interactive dismissal;
 * close it through its binding or `useDismiss()`. */
export function FullScreenCover(props: FullScreenCoverProps) {
  return (
    <ModalPresentationContext value={true}>
      <EngineFullScreenCover {...props} />
    </ModalPresentationContext>
  )
}
