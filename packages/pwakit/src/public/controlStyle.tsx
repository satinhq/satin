import {
  createContext,
  useContext,
  useMemo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react'

/** `ControlSize`. */
export type ControlSize = 'mini' | 'small' | 'regular' | 'large' | 'extraLarge'
/** `ButtonRole`. */
export type ButtonRole = 'destructive' | 'cancel'
/** Built-in button styles, by their `buttonStyle` names. */
export type BuiltInButtonStyle =
  | 'automatic'
  | 'bordered'
  | 'borderedProminent'
  | 'borderless'
  | 'plain'
  | 'glass'
  | 'glassProminent'
/** The environment every custom control style receives. */
export type ControlConfiguration = Readonly<{
  isEnabled: boolean
  controlSize: ControlSize
  tint: string | undefined
}>
/** `ButtonStyleConfiguration`: what a custom `ButtonStyle` draws from. */
export type ButtonStyleConfiguration = ControlConfiguration &
  Readonly<{
    label: ReactNode
    isPressed: boolean
    role: ButtonRole | undefined
  }>
/** A custom framework `ButtonStyle`. Appearance only: return noninteractive content; Satin
 * owns the button. */
export type ButtonStyle = Readonly<{
  makeBody(configuration: ButtonStyleConfiguration): ReactNode
}>
/** `LabelStyleConfiguration`: the label's title and icon. */
export type LabelStyleConfiguration = Readonly<{ title: ReactNode; icon: ReactNode }>
/** A custom framework `LabelStyle` that arranges a label's title and icon. */
export type LabelStyle = Readonly<{
  makeBody(configuration: LabelStyleConfiguration): ReactNode
}>
/** Built-in label styles. */
export type BuiltInLabelStyle = 'automatic' | 'titleAndIcon' | 'titleOnly' | 'iconOnly'
/** `ToggleStyleConfiguration`: what a custom `ToggleStyle` draws from. */
export type ToggleStyleConfiguration = ControlConfiguration &
  Readonly<{
    label: ReactNode
    isOn: boolean
    isPressed: boolean
  }>
/** A custom framework `ToggleStyle`. Its declared semantics are applied to the
 * framework-owned interactive element. */
export type ToggleStyle = Readonly<{
  semantics: 'switch' | 'checkbox' | 'button'
  makeBody(configuration: ToggleStyleConfiguration): ReactNode
}>
/** Built-in toggle styles. */
export type BuiltInToggleStyle = 'automatic' | 'switch' | 'button'
/** The control environment a `ControlStyleProvider` sets for its subtree. */
export type ControlStyleValues = Readonly<{
  buttonStyle?: BuiltInButtonStyle | ButtonStyle
  toggleStyle?: BuiltInToggleStyle | ToggleStyle
  labelStyle?: BuiltInLabelStyle | LabelStyle
  controlSize?: ControlSize
  tint?: string
  disabled?: boolean
  labelsHidden?: boolean
}>
const ControlStyleContext = createContext<ControlStyleValues>({})
/**
 * Sets control defaults for a subtree through `buttonStyle`, `toggleStyle`, `labelStyle`,
 * `controlSize`, `tint` and `disabled`. A control's own props win
 * over the provider, except that a disabled ancestor cannot be re-enabled by a child.
 *
 * @example
 * <ControlStyleProvider buttonStyle="borderedProminent" controlSize="large">
 *   <Button onPress={save}>Save</Button>
 * </ControlStyleProvider>
 */
export function ControlStyleProvider({
  children,
  ...values
}: ControlStyleValues & { children: ReactNode }) {
  const parent = useContext(ControlStyleContext)
  const { buttonStyle, toggleStyle, labelStyle, controlSize, tint, disabled, labelsHidden } = values
  const value = useMemo(
    () => ({
      buttonStyle: buttonStyle ?? parent.buttonStyle,
      toggleStyle: toggleStyle ?? parent.toggleStyle,
      labelStyle: labelStyle ?? parent.labelStyle,
      controlSize: controlSize ?? parent.controlSize,
      tint: tint ?? parent.tint,
      disabled: Boolean(parent.disabled || disabled),
      labelsHidden: labelsHidden ?? parent.labelsHidden,
    }),
    [parent, buttonStyle, toggleStyle, labelStyle, controlSize, tint, disabled, labelsHidden],
  )
  return <ControlStyleContext value={value}>{children}</ControlStyleContext>
}
export function useControlStyle(values: ControlStyleValues = {}) {
  const parent = useContext(ControlStyleContext)
  return {
    buttonStyle: values.buttonStyle ?? parent.buttonStyle,
    toggleStyle: values.toggleStyle ?? parent.toggleStyle,
    labelStyle: values.labelStyle ?? parent.labelStyle,
    labelsHidden: values.labelsHidden ?? parent.labelsHidden,
    controlSize: values.controlSize ?? parent.controlSize ?? 'regular',
    tint: values.tint ?? parent.tint,
    disabled: Boolean(parent.disabled || values.disabled),
  }
}
export function controlTintStyle(tint: string | undefined): CSSProperties | undefined {
  return tint ? ({ '--satin-tint': tint, '--satin-list-accent': tint } as CSSProperties) : undefined
}

/** Reject nested activation owners in appearance-only styles, including custom components. */
export function ControlStyleBody({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (
      ref.current?.querySelector(
        'button, input, select, textarea, a[href], [contenteditable="true"], [tabindex], [role="button"], [role="checkbox"], [role="switch"]',
      )
    ) {
      throw new Error(
        'Control styles return noninteractive content. Satin owns the interactive element.',
      )
    }
  })
  return (
    <span ref={ref} style={{ display: 'contents' }}>
      {children}
    </span>
  )
}
