import type { TextFieldKind, SubmitLabel } from '../text-input/kinds.ts'
import type { ActionItem } from '../actions/types.ts'
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type InputHTMLAttributes,
} from 'react'
import { Pressable } from '../press/Pressable.tsx'
import { TextField } from '../text-input/TextField.tsx'
import { type PresentationDetent } from './model.ts'

import { useColdLaunchPresentation } from './coldLaunch.ts'
import { Surface } from './PresentationSurface.tsx'
import { PresentedSheet } from './PresentedSheet.tsx'
import { trackPresentationSource } from './presentationSource.ts'
import { DismissContext, PresentationBoundary } from './dismiss.tsx'
import { createScrollSurfaceRegistry } from '../scroll/registry.ts'
import { SystemScrollRegistryContext } from '../navigation/navigationContext.tsx'
import { ScreenContentContext } from '../public/chrome.tsx'
import { TabRegistrationContext } from '../tabs/context.ts'

/** The presentation binding, accessible title and dismissal callback shared by presentations. */
export type PresentationProps = {
  isPresented: boolean
  onPresentedChange(presented: boolean): void
  title: string
  onDismiss?(): void
}
export type SheetProps = PresentationProps & {
  children: ReactNode
  detents?: readonly PresentationDetent[]
  selection?: PresentationDetent
  onSelectionChange?(detent: PresentationDetent): void
  interactiveDismissDisabled?: boolean
  /** `hidden` keeps the title as the sheet's accessible label without drawing a header, for
   * content that fills the card (Now Playing). A modal NavigationStack root's title is drawn by
   * its navigation bar either way. */
  titleVisibility?: 'visible' | 'hidden'
  /** Control the sheet drag indicator. `automatic` shows it only when there is more than one
   * detent to drag between, as native does. */
  dragIndicator?: 'automatic' | 'visible' | 'hidden'
}
export function Sheet(props: SheetProps) {
  const isPresented = useColdLaunchPresentation(props.isPresented, props.onPresentedChange)
  props = { ...props, isPresented }
  const [retained, setRetained] = useState(props.isPresented)
  if (props.isPresented && !retained) setRetained(true)
  return props.isPresented || retained ? (
    <PresentedSheet
      {...props}
      onDismiss={() => {
        setRetained(false)
        props.onDismiss?.()
      }}
    />
  ) : null
}
export type FullScreenCoverProps = PresentationProps & { children: ReactNode }
/** An opaque presentation over the whole screen that slides up from
 * the bottom edge. It has no grabber and no interactive dismissal; close it with its binding or
 * `useDismiss()`. Its title labels the dialog for assistive technology and is not drawn. */
export function FullScreenCover({ children, ...props }: FullScreenCoverProps) {
  const isPresented = useColdLaunchPresentation(props.isPresented, props.onPresentedChange)
  props = { ...props, isPresented }
  const [scrollRegistry] = useState(() => createScrollSurfaceRegistry())
  const [retained, setRetained] = useState(props.isPresented)
  if (props.isPresented && !retained) setRetained(true)
  if (!props.isPresented && !retained) return null
  return (
    <Surface
      {...props}
      kind="cover"
      dismissDisabled
      onDismiss={() => {
        setRetained(false)
        props.onDismiss?.()
      }}
    >
      <SystemScrollRegistryContext value={scrollRegistry}>
        <ScreenContentContext value={{}}>
          <TabRegistrationContext value={null}>
            <DismissContext value={() => props.onPresentedChange(false)}>
              <PresentationBoundary>{children}</PresentationBoundary>
            </DismissContext>
          </TabRegistrationContext>
        </ScreenContentContext>
      </SystemScrollRegistryContext>
    </Surface>
  )
}
/** The controlled text and keyboard intent of an alert's embedded field. */
export type AlertTextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'size' | 'placeholder'
> & {
  label: string
  value: string
  onChange(value: string): void
  kind?: TextFieldKind
  submitLabel?: SubmitLabel
  onSubmit?(): void
  labelPlacement?: 'leading' | 'above'
  prompt?: string
}
function AlertTextField({ prompt, ...props }: AlertTextFieldProps) {
  return <TextField {...props} placeholder={prompt ?? props.label} />
}
/** An alert's presentation binding, message and leaf actions. */
export type AlertProps = PresentationProps & {
  message?: string
  actions: readonly ActionItem[]
  textField?: AlertTextFieldProps
}
/** A confirmation dialog's presentation binding, leaf actions and optional anchor. */
export type ConfirmationDialogProps = Omit<AlertProps, 'textField'> & {
  /** The view the popover points at. Defaults to the control that was pressed to open it (a swipe
   * action's row). Native draws no Cancel
   * button in the popover: a tap outside cancels, and the Cancel action stays for assistive technology. */
  anchor?: RefObject<HTMLElement | null>
}
function Actions({
  actions,
  dismiss,
  active = true,
}: {
  actions: readonly ActionItem[]
  dismiss(): void
  active?: boolean
}) {
  const accepted = useRef(false)
  useLayoutEffect(() => {
    if (active) accepted.current = false
  }, [active])
  return (
    <div className="satin-presentation-actions">
      {[...actions]
        .sort((a, b) => Number(b.role === 'cancel') - Number(a.role === 'cancel'))
        .map(action => (
          <Pressable
            key={action.id}
            data-satin-cancel={action.role === 'cancel' || undefined}
            data-role={action.role}
            disabled={action.disabled}
            onPress={() => {
              if (!active || accepted.current) return
              accepted.current = true
              dismiss()
              // The action owns write errors and user feedback. Dismissal never invokes it.
              void action.onPress?.()
            }}
          >
            {action.label}
          </Pressable>
        ))}
    </div>
  )
}
function validateActions(actions: readonly ActionItem[], alert: boolean) {
  if (!actions.length || (alert && actions.length > 3))
    throw new Error('Alert requires one to three actions; confirmation requires at least one.')
  if (
    new Set(
      [...actions]
        .sort((a, b) => Number(b.role === 'cancel') - Number(a.role === 'cancel'))
        .map(action => action.id),
    ).size !== actions.length
  )
    throw new Error('Presentation action ids must be unique.')
  if (actions.filter(action => action.role === 'cancel').length > 1)
    throw new Error('Presentation accepts at most one Cancel action.')
}
/** `alert`: a titled presentation with up to three leaf actions and an optional text field. */
export function Alert({ message, actions, textField, ...props }: AlertProps) {
  const isPresented = useColdLaunchPresentation(props.isPresented, props.onPresentedChange)
  props = { ...props, isPresented }
  const messageId = useId()
  validateActions(actions, true)
  // Native opens on the title; its message is the next readable element.
  // Input alerts retain the description while their editing target owns focus.
  return (
    <Surface {...props} kind="alert" describedBy={textField && message ? messageId : undefined}>
      {message && (
        <p id={messageId} className="satin-presentation-message">
          {message}
        </p>
      )}
      {textField && <AlertTextField {...textField} />}
      <Actions
        actions={actions}
        active={props.isPresented}
        dismiss={() => props.onPresentedChange(false)}
      />
    </Surface>
  )
}
/** `confirmationDialog`: a titled action presentation anchored to its initiating control. */
export function ConfirmationDialog({
  message,
  actions,
  anchor,
  ...props
}: ConfirmationDialogProps) {
  const isPresented = useColdLaunchPresentation(props.isPresented, props.onPresentedChange)
  props = { ...props, isPresented }
  const messageId = useId()
  validateActions(actions, false)
  // Installed before the press that opens the dialog, so that press can be its source.
  useLayoutEffect(() => trackPresentationSource(document), [])
  return (
    <Surface
      {...props}
      kind="confirmation"
      anchor={anchor}
      describedBy={message ? messageId : undefined}
    >
      {message && (
        <p id={messageId} className="satin-presentation-message">
          {message}
        </p>
      )}
      {props.isPresented && (
        <Actions actions={actions} dismiss={() => props.onPresentedChange(false)} />
      )}
    </Surface>
  )
}
