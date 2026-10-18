import type { Choice } from '../list-form/ListForm.tsx'
import type { Searchable } from '../search/searchable.ts'
import type { TaskAction } from '../tasks/useTask.ts'
import type { ScrollPositionBinding, VerticalScrollGeometry } from '../scroll/position.ts'
import type { ScrollDismissesKeyboardMode } from '../keyboard/adapter.ts'
import type {
  ScrollEdgeEffectHidden,
  ScrollEdgeEffectStyleSelection,
} from '../scroll/edgePolicy.ts'
import {
  ControlStyleBody,
  controlTintStyle,
  useControlStyle,
  type BuiltInButtonStyle,
  type ButtonStyle,
  type ButtonRole,
  type ControlSize,
  type BuiltInToggleStyle,
  type ToggleStyle,
} from './controlStyle.tsx'
import { SymbolImage, type SymbolName } from '../symbols/Symbol.tsx'
import { toolbarIconName } from './Label.tsx'
import { usePickerNavigation } from './pickerNavigation.tsx'
import { RowLabelBody } from '../list-form/RowLabel.tsx'
import { textFieldAttributes, type SubmitLabel, type TextFieldKind } from '../text-input/kinds.ts'
import { GlassFieldContext } from './fieldContext.ts'
import {
  Children,
  isValidElement,
  forwardRef,
  useContext,
  useId,
  useState,
  type AriaAttributes,
  type ReactNode,
  type Ref,
  type RefAttributes,
  type ReactElement,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import * as Rows from '../list-form/ListForm.tsx'
import * as Fields from '../text-input/TextField.tsx'
import { TextEditor as Editor } from '../text-input/TextEditor.tsx'
import { Pressable } from '../press/Pressable.tsx'
import { glassRadius } from '../glass/regions.ts'
import { GlassButton } from '../glass/GlassEffect.tsx'
import { resolveButtonBorderShape, type ButtonBorderShape } from './buttonBorderShape.ts'
export type { ButtonBorderShape } from './buttonBorderShape.ts'
import { ToolbarConfirmationContext, ToolbarContext } from './toolbar.tsx'
import { useScreenContentNavigation } from './screenChrome.tsx'
import { useNavigation } from './runtime.tsx'
import type { RowActionsProps } from '../actions/types.ts'
import { ListContext, ListRowContentContext } from '../list-form/listContext.ts'
import { useEditMode, type ListItemID } from '../list-form/editing.tsx'
import type { Routes, RouteProps, RegisteredRoutes } from './routes.tsx'

/** The `swipeActions` and `contextMenu` props of a row in a `List`. */
export type RowInteractionProps = RowActionsProps
/** How a text field draws. `automatic` adapts to its container; `plain` draws no field chrome. */
export type TextFieldStyle = 'automatic' | 'plain'
/** A number caps growth; a range also reserves its minimum number of lines. */
export type LineLimit = number | { min: number; max: number }

function useFieldVariant(style: TextFieldStyle = 'automatic') {
  const list = useContext(ListContext)
  const glass = useContext(GlassFieldContext)
  const rowContent = useContext(ListRowContentContext)
  return style === 'plain' || glass || rowContent ? 'plain' : list ? 'row' : 'standalone'
}
/** The scroll, search and section options `Form` and `List` share. `style` is inline CSS. */
export type FormProps = Omit<HTMLAttributes<HTMLDivElement>, 'id'> & {
  id: string
  refreshable?: TaskAction
  scrollDismissesKeyboard?: ScrollDismissesKeyboardMode
  scrollEdgeEffectHidden?: ScrollEdgeEffectHidden
  scrollEdgeEffectStyle?: ScrollEdgeEffectStyleSelection
  defaultScrollAnchor?: 'top' | 'bottom'
  maintainVisibleContentPosition?: boolean
  scrollPosition?: ScrollPositionBinding
  onScrollGeometryChange?: (geometry: VerticalScrollGeometry) => void
  searchable?: Searchable
  listSectionSpacing?: 'default' | 'compact' | number
  scrollContentBackground?: 'hidden' | 'visible'
}

/** How a `List` draws its rows and sections. `insetGrouped` is the default. */
export type ListStyle = 'insetGrouped' | 'plain' | 'grouped' | 'sidebar'

/** A `List` takes a `Form`'s options, its `listStyle` and an optional `selection`. */
export type ListProps<ID extends ListItemID = ListItemID> = FormProps & {
  listStyle?: ListStyle
} & ListSelectionProps<ID>

/**
 * Row selection for a `List`. An optional id selects one row: tapping a row selects it. A `Set`
 * selects many: while editing, rows show selection circles and taps toggle them. Rows are
 * identified by their `ForEach` ids.
 */
export type ListSelectionProps<ID extends ListItemID = ListItemID> =
  | { selection?: undefined; onSelectionChange?: undefined }
  | { selection: ID | null; onSelectionChange: (next: ID | null) => void }
  | { selection: ReadonlySet<ID>; onSelectionChange: (next: Set<ID>) => void }
/**
 * A scrolling column of rows, inset grouped by default. Controls inside it render as rows.
 * Its `id` keys scroll restoration, so keep it stable.
 *
 * With `selection`, rows from a `ForEach` become selectable; with an `EditButton` in the screen's
 * toolbar, `ForEach`'s `onDelete` and `onMove` add the editing controls.
 *
 * @example
 * <List id="notes">
 *   {notes.map(note => (
 *     <NavigationLink key={note.id} to="note" params={{ id: note.id }}>
 *       {note.title}
 *     </NavigationLink>
 *   ))}
 * </List>
 */
// One overload per selection form, so an inline `onSelectionChange` callback is typed.
export function List<ID extends ListItemID>(
  props: FormProps & {
    listStyle?: ListStyle
    selection: ReadonlySet<ID>
    onSelectionChange: (next: Set<ID>) => void
  },
): ReactElement
export function List<ID extends ListItemID>(
  props: FormProps & {
    listStyle?: ListStyle
    selection: ID | null
    onSelectionChange: (next: ID | null) => void
  },
): ReactElement
export function List(props: FormProps & { listStyle?: ListStyle }): ReactElement
export function List({
  listStyle,
  children,
  selection,
  onSelectionChange,
  ...props
}: ListProps): ReactElement {
  const chrome = useScreenContentNavigation()
  const authoredTitle = Children.toArray(children).some(
    child => isValidElement(child) && child.type === 'h1',
  )
  const title = !authoredTitle && chrome.titleDisplay !== 'none' ? chrome.title : undefined
  return (
    <ListContext value={true}>
      <Rows.List
        {...props}
        navigationTitle={title}
        navigationTitleDisplay={chrome.titleDisplay === 'large' ? 'large' : 'inline'}
        variant={listStyle}
        selectionBinding={selectionBinding(selection, onSelectionChange)}
      >
        {children}
      </Rows.List>
    </ListContext>
  )
}

function selectionBinding<ID extends ListItemID>(
  selection: ListSelectionProps<ID>['selection'],
  onSelectionChange: ListSelectionProps<ID>['onSelectionChange'],
): Rows.ListSelectionBinding | undefined {
  if (selection === undefined || !onSelectionChange) return undefined
  if (selection instanceof Set)
    return {
      mode: 'multiple',
      value: selection as ReadonlySet<ListItemID>,
      onChange: onSelectionChange as (next: Set<ListItemID>) => void,
    }
  return {
    mode: 'single',
    value: selection as ID | null,
    onChange: onSelectionChange as (next: ListItemID | null) => void,
  }
}
/** An inset grouped `List` for settings and data entry. Scrolling it dismisses the keyboard
 * at once. */
export function Form(props: FormProps) {
  return (
    <List
      {...props}
      listStyle="insetGrouped"
      scrollDismissesKeyboard={props.scrollDismissesKeyboard ?? 'immediately'}
    />
  )
}
/** Button's action, label and control properties. An `iconOnly` button needs an `aria-label`. */
export type ButtonProps = AriaAttributes &
  RowInteractionProps & {
    children?: ReactNode
    symbol?: SymbolName
    onPress(): void
    disabled?: boolean
    id?: string
    className?: string
    title?: string
    role?: ButtonRole
    buttonStyle?: BuiltInButtonStyle | ButtonStyle
    style?: CSSProperties
    controlSize?: ControlSize
    buttonBorderShape?: ButtonBorderShape
    tint?: string
  } & ({ iconOnly: true; 'aria-label': string } | { iconOnly?: false })

/**
 * A pressable control that adapts to where it is: a tinted row in a `List`, a glass button in a
 * toolbar, otherwise the `buttonStyle` you choose. `role="destructive"` carries into every context.
 *
 * @example
 * <Button symbol="plus" onPress={addNote}>New Note</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    symbol,
    role,
    buttonStyle: requestedStyle,
    style: cssStyle,
    controlSize,
    buttonBorderShape,
    tint,
    disabled,
    swipeActions,
    contextMenu,
    ...rest
  },
  ref,
) {
  const list = useContext(ListContext)
  const toolbar = useContext(ToolbarContext)
  const confirmation = useContext(ToolbarConfirmationContext)
  const configuration = useControlStyle({
    buttonStyle: requestedStyle,
    controlSize,
    tint,
    disabled,
  })
  const style = configuration.buttonStyle ?? 'automatic'
  const resolvedBorderShape = resolveButtonBorderShape(buttonBorderShape)
  const [isPressed, setPressed] = useState(false)
  // A toolbar button labelled with an icon-only Label or a SymbolImage is a glass circle, and so is a
  // A titled toolbar button with a symbol uses a circular control.
  // draws only its symbol (iOS 27.0 native reference), the title becoming its accessible name. A bare symbol
  // An icon-only toolbar button uses the same circle.
  const symbolTitle =
    toolbar && symbol && typeof children === 'string' && !rest.iconOnly ? children : undefined
  const bareSymbolName =
    toolbar && symbol && (children == null || typeof children === 'boolean') && !rest.iconOnly
      ? rest['aria-label']?.trim() || symbol
      : undefined
  const iconName =
    symbolTitle ??
    bareSymbolName ??
    (toolbar && !symbol && !rest.iconOnly ? toolbarIconName(children) : undefined)
  const props = {
    ...rest,
    disabled: configuration.disabled,
    style: { ...controlTintStyle(configuration.tint), ...cssStyle },
    'data-satin-control-size': configuration.controlSize,
    'data-satin-button-symbol': symbol,
    'data-satin-control-tinted': configuration.tint ? 'true' : undefined,
  }
  // `iconOnly` with a symbol draws just the symbol. A title passed as children is
  // not drawn; the required aria-label names the button.
  const visibleChildren = symbol && rest.iconOnly ? undefined : children
  const content = (
    <>
      {symbol && (
        <SymbolImage
          name={symbol}
          style={{
            ...(toolbar ? { fontSize: 22 } : {}),
            marginInlineEnd: visibleChildren == null || symbolTitle ? undefined : '0.3em',
          }}
        />
      )}
      {symbolTitle === undefined && visibleChildren}
    </>
  )
  if (typeof style === 'object')
    return (
      <Pressable
        {...props}
        ref={ref}
        data-satin-button-role={role}
        onPressStateChange={state => setPressed(state === 'pressed')}
      >
        <ControlStyleBody>
          {style.makeBody({
            label: content,
            role,
            isPressed,
            isEnabled: !configuration.disabled,
            controlSize: configuration.controlSize,
            tint: configuration.tint,
          })}
        </ControlStyleBody>
      </Pressable>
    )
  if (toolbar === 'group' && style === 'automatic')
    return (
      <Pressable
        {...props}
        ref={ref}
        data-satin-toolbar-button="true"
        data-satin-button-role={role}
      >
        {content}
      </Pressable>
    )
  if (list && style === 'automatic')
    return (
      <Rows.Row
        {...{ swipeActions, contextMenu }}
        ref={ref}
        buttonProps={props}
        className={['satin-list-button', props.className].filter(Boolean).join(' ')}
        destructive={role === 'destructive'}
        disabled={props.disabled}
        onPress={props.onPress}
        label={children}
        leading={
          symbol ? (
            <SymbolImage
              name={symbol}
              style={{ fontSize: 21.7, color: configuration.tint ?? 'var(--satin-tint)' }}
            />
          ) : undefined
        }
        accessibilityLabel={props['aria-label']}
      />
    )
  if (style === 'glass' || style === 'glassProminent' || (toolbar && style === 'automatic'))
    return (
      <GlassButton
        shape={resolvedBorderShape}
        {...(iconName !== undefined
          ? {
              ...props,
              iconOnly: true as const,
              'aria-label': rest['aria-label']?.trim() || iconName,
            }
          : props)}
        ref={ref}
        data-satin-toolbar-button={toolbar && style === 'automatic' ? 'true' : undefined}
        data-satin-toolbar-confirmation={
          toolbar && style === 'automatic' && confirmation ? 'true' : undefined
        }
        data-satin-button-role={role}
        buttonStyle={
          style === 'glassProminent' ||
          (toolbar &&
            style === 'automatic' &&
            confirmation &&
            (props.iconOnly || iconName !== undefined))
            ? 'glassProminent'
            : 'glass'
        }
        tint={role === 'destructive' ? 'var(--satin-system-red)' : configuration.tint}
        data-satin-button-style={
          style === 'glass' || style === 'glassProminent' ? style : undefined
        }
      >
        {content}
      </GlassButton>
    )
  return (
    <Pressable
      {...props}
      ref={ref}
      style={
        buttonBorderShape && (style === 'bordered' || style === 'borderedProminent')
          ? {
              ...props.style,
              borderRadius:
                typeof resolvedBorderShape === 'string'
                  ? '9999px'
                  : glassRadius(resolvedBorderShape, Number.MAX_VALUE, Number.MAX_VALUE),
            }
          : props.style
      }
      data-satin-row-intrinsic="true"
      data-satin-button-style={style}
      data-satin-button-role={role}
    >
      <span data-satin-button-content>{content}</span>
    </Pressable>
  )
})
/**
 * Toggles the screen's edit mode. In a toolbar it reads Edit, then becomes a prominent
 * checkmark (Done) while editing.
 *
 * @example
 * <Screen toolbar={<ToolbarItem placement="topBarTrailing"><EditButton /></ToolbarItem>}>
 */
export function EditButton() {
  const [editMode, setEditMode] = useEditMode()
  const editing = editMode === 'active'
  const toolbar = useContext(ToolbarContext)
  const toggle = () => setEditMode(editing ? 'inactive' : 'active')
  if (toolbar && editing)
    return (
      <ToolbarConfirmationContext value={true}>
        <Button iconOnly aria-label="Done" symbol="checkmark" onPress={toggle} />
      </ToolbarConfirmationContext>
    )
  return <Button onPress={toggle}>{editing ? 'Done' : 'Edit'}</Button>
}
/** A destination route and its params (typed against the registered routes), plus the row's
 * label and accessories. */
export type NavigationLinkProps<R extends Routes = RegisteredRoutes> = [
  keyof R['definitions'],
] extends [never]
  ? RowInteractionProps & {
      to: never
      params?: never
      children: ReactNode
      symbol?: SymbolName
      leading?: ReactNode
    }
  : {
      [K in keyof R['definitions'] & string]: { to: K } & RowInteractionProps &
        ({} extends RouteProps<R, K>
          ? { params?: RouteProps<R, K> }
          : { params: RouteProps<R, K> }) & {
          children: ReactNode
          value?: ReactNode
          disabled?: boolean
          leading?: ReactNode
          symbol?: SymbolName
          className?: string
        }
    }[keyof R['definitions'] & string]
/**
 * Pushes a declared route. In a `List` it draws a disclosure row; elsewhere it is a plain
 * pressable.
 *
 * @example
 * <NavigationLink to="note" params={{ id: note.id }}>{note.title}</NavigationLink>
 */
export function NavigationLink<R extends Routes = RegisteredRoutes>({
  to,
  params,
  children,
  swipeActions,
  contextMenu,
  symbol,
  ...props
}: NavigationLinkProps<R>) {
  const list = useContext(ListContext)
  const navigation = useNavigation<Routes>()
  const configuration = useControlStyle({
    disabled: 'disabled' in props ? Boolean(props.disabled) : undefined,
  })
  const onPress = () => {
    ;(navigation.push as (id: string, params?: unknown) => boolean)(to, params)
  }
  return list ? (
    <Rows.NavigationRow
      {...props}
      {...{ swipeActions, contextMenu }}
      label={children}
      leading={
        symbol ? (
          <SymbolImage
            name={symbol}
            style={{ fontSize: 21.7, color: configuration.tint ?? 'var(--satin-tint)' }}
          />
        ) : (
          props.leading
        )
      }
      onPress={onPress}
    />
  ) : (
    <Pressable
      {...props}
      disabled={configuration.disabled}
      style={controlTintStyle(configuration.tint)}
      data-satin-navigation-link="true"
      onPress={onPress}
    >
      {symbol && <SymbolImage name={symbol} />}
      {children}
    </Pressable>
  )
}
/** A row title and its secondary line. */
export type RowLabelProps = { children: ReactNode; detail: ReactNode }
/** A row title with a secondary `detail` line under it. The framework owns its layout. */
export function RowLabel({ children, detail }: RowLabelProps) {
  return <RowLabelBody detail={detail}>{children}</RowLabelBody>
}
/** The row's label and the trailing value it shows. */
export type LabeledContentProps = RowInteractionProps & {
  label: ReactNode
  value: ReactNode
  leading?: ReactNode
  disabled?: boolean
  destructive?: boolean
  className?: string
  'aria-label'?: string
}
/** A row with a label and a trailing value in secondary text. */
export function LabeledContent({
  'aria-label': accessibilityLabel,
  ...props
}: LabeledContentProps) {
  return <Rows.ValueRow {...props} accessibilityLabel={accessibilityLabel} />
}
/** Toggle's controlled value, label and control properties. */
export type ToggleProps = {
  isOn: boolean
  onChange(isOn: boolean): void
  disabled?: boolean
  label: string
  /** A secondary line under the label, drawn with secondary text styling. The label
   * stays the accessible name; the subtitle is its description. */
  subtitle?: string
  leading?: ReactNode
  toggleStyle?: BuiltInToggleStyle | ToggleStyle
  style?: CSSProperties
  controlSize?: ControlSize
  tint?: string
}
/**
 * A controlled on/off value. It draws a switch row in a `List` or `Form` and a bare switch
 * elsewhere. `toggleStyle` can make it a button or a custom `ToggleStyle`.
 *
 * @example
 * <Toggle label="Show Completed" isOn={showCompleted} onChange={setShowCompleted} />
 * <Toggle label="Date" subtitle="Today" isOn={hasDate} onChange={setHasDate} />
 */
export function Toggle({
  isOn,
  toggleStyle: requestedStyle,
  style: cssStyle,
  controlSize,
  tint,
  disabled,
  ...props
}: ToggleProps) {
  const list = useContext(ListContext)
  const configuration = useControlStyle({
    toggleStyle: requestedStyle,
    controlSize,
    tint,
    disabled,
  })
  const descriptionId = useId()
  const style = configuration.toggleStyle ?? 'automatic'
  const [isPressed, setPressed] = useState(false)
  if (style === 'automatic' || style === 'switch') {
    const rowProps = {
      ...props,
      checked: isOn,
      style: cssStyle,
      disabled: configuration.disabled,
      tint: configuration.tint,
    }
    return list ? <Rows.ToggleRow {...rowProps} /> : <Rows.Toggle {...rowProps} />
  }
  const semantics = typeof style === 'object' ? style.semantics : 'button'
  return (
    <Pressable
      disabled={configuration.disabled}
      role={semantics === 'button' ? undefined : semantics}
      aria-label={props.label}
      aria-describedby={props.subtitle === undefined ? undefined : descriptionId}
      aria-checked={semantics === 'button' ? undefined : isOn}
      aria-pressed={semantics === 'button' ? isOn : undefined}
      data-satin-row-intrinsic={style === 'button' ? 'true' : undefined}
      data-satin-toggle-style={typeof style === 'string' ? style : 'custom'}
      data-satin-button-style={style === 'button' ? 'bordered' : undefined}
      data-satin-control-size={configuration.controlSize}
      data-satin-control-tinted={configuration.tint ? 'true' : undefined}
      style={{ ...controlTintStyle(configuration.tint), ...cssStyle }}
      onPress={() => {
        if (!configuration.disabled) props.onChange(!isOn)
      }}
      onPressStateChange={state => setPressed(state === 'pressed')}
    >
      <ControlStyleBody>
        {typeof style === 'object' ? (
          style.makeBody({
            label: toggleLabel(props, descriptionId),
            isOn: isOn,
            isPressed,
            isEnabled: !configuration.disabled,
            controlSize: configuration.controlSize,
            tint: configuration.tint,
          })
        ) : (
          <span data-satin-button-content>{toggleLabel(props, descriptionId)}</span>
        )}
      </ControlStyleBody>
    </Pressable>
  )
}
/** A button-style or custom Toggle draws its subtitle under the label, like the switch row. */
function toggleLabel(props: Pick<ToggleProps, 'label' | 'subtitle'>, descriptionId: string) {
  if (props.subtitle === undefined) return props.label
  return (
    <RowLabelBody detail={props.subtitle} detailId={descriptionId}>
      {props.label}
    </RowLabelBody>
  )
}
/** Picker's options, controlled value and `pickerStyle`. */
export type PickerProps = {
  label: string
  options: readonly Choice[]
  disabled?: boolean
  leading?: ReactNode
  pickerStyle?: 'menu' | 'navigationLink' | 'segmented' | 'inline'
  style?: CSSProperties
  selection: string
  onSelectionChange(id: string): void
}
/**
 * Chooses one option. `menu` (the default) opens a menu from the row, `navigationLink` pushes a
 * list of options, `inline` lists them in place and `segmented` draws a segmented control.
 *
 * An option can carry a `symbol` (or `icon`) and a `color`. Icons draw in colour in an inline or
 * navigationLink list, in the label colour inside the open menu, and not at all when segmented.
 *
 * @example
 * <Picker label="Sort" selection={sort} onSelectionChange={setSort}
 *   options={[{ id: 'date', label: 'Date' }, { id: 'title', label: 'Title' }]} />
 * <Picker label="List" pickerStyle="inline" selection={list} onSelectionChange={setList}
 *   options={[{ id: 'home', label: 'Home', symbol: 'house', color: systemColor('red') }]} />
 */
export function Picker({
  pickerStyle = 'menu',
  selection,
  onSelectionChange,
  disabled,
  ...rest
}: PickerProps) {
  // `ControlStyleProvider disabled` disables a Picker throughout its subtree.
  const configuration = useControlStyle({ disabled })
  const props = {
    ...rest,
    disabled: configuration.disabled,
    value: selection,
    onChange: onSelectionChange,
  }
  const navigate = usePickerNavigation(props)
  if (pickerStyle === 'segmented') return <Rows.SegmentedControl {...props} />
  if (pickerStyle === 'inline') return <Rows.PickerOptions {...props} />
  return (
    <Rows.PickerRow
      {...props}
      onNavigate={navigate}
      presentation={pickerStyle === 'navigationLink' ? 'navigation' : 'menu'}
    />
  )
}
/** Stepper's controlled value, bounds and step. */
export type StepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  label: string
  onEditingChange?: (editing: boolean) => void
}
/** Increments or decrements a controlled number within its bounds. It draws a row in a `List`
 * and the bare control elsewhere. */
export function Stepper({ disabled, ...rest }: StepperProps) {
  const configuration = useControlStyle({ disabled })
  const props = { ...rest, disabled: configuration.disabled }
  return useContext(ListContext) ? (
    <Rows.StepperRow {...props} />
  ) : (
    <Rows.StepperControl {...props} />
  )
}
/** Slider's controlled value, range, step and accessibility label. */
export type SliderProps = {
  value: number
  onChange: (value: number) => void
  /** The lower bound. `min` and `max` default to 0 and 1. */
  min?: number
  max?: number
  /** Snap to multiples of `step` from `min`; omit for a continuous Slider. */
  step?: number
  /** Show a tick mark at each step, centred under the thumb's stops. */
  ticks?: boolean
  /** Accessibility label; a Slider shows no visible label, as on iOS. */
  label: string
  disabled?: boolean
  tint?: string
  onEditingChange?: (editing: boolean) => void
}
/** Drags a controlled number between `min` and `max`, continuously or in steps. In a `List` or
 * `Form` it fills its own 60 pt row. */
export function Slider({ disabled, tint, ...rest }: SliderProps) {
  const configuration = useControlStyle({ disabled, tint })
  const props = { ...rest, disabled: configuration.disabled, tint: configuration.tint }
  return useContext(ListContext) ? <Rows.SliderRow {...props} /> : <Rows.Slider {...props} />
}
/** Horizontal TextField's controlled text and keyboard intent. */
export type HorizontalTextFieldProps = Omit<
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
  textFieldStyle?: TextFieldStyle
  axis?: 'horizontal'
}
/** Vertical TextField's controlled text, growth limits and keyboard intent. */
export type VerticalTextFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange' | 'rows' | 'placeholder'
> & {
  label: string
  value: string
  onChange(value: string): void
  prompt?: string
  textFieldStyle?: TextFieldStyle
  axis: 'vertical'
  lineLimit?: LineLimit
  kind?: Exclude<TextFieldKind, 'new-password' | 'current-password'>
  submitLabel?: SubmitLabel
}
/** A single-line field, or with `axis="vertical"` a field that grows to its `lineLimit`. */
export type TextFieldProps = HorizontalTextFieldProps | VerticalTextFieldProps
const Field = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(function TextField(
  { prompt, textFieldStyle, style, ...props },
  ref,
) {
  const variant = useFieldVariant(textFieldStyle)
  const hidden = prompt !== undefined || variant === 'plain' || variant === 'row'
  if (props.axis === 'vertical') {
    const { axis: _axis, kind = 'text', submitLabel, lineLimit, ...editorProps } = props
    const { type: _type, enterKeyHint: _enterKeyHint, ...attributes } = textFieldAttributes(kind)
    return (
      <Editor
        {...attributes}
        enterKeyHint={submitLabel}
        {...editorProps}
        style={style}
        ref={ref as Ref<HTMLTextAreaElement>}
        field
        minLines={typeof lineLimit === 'object' ? lineLimit.min : 1}
        maxLines={typeof lineLimit === 'object' ? lineLimit.max : lineLimit}
        placeholder={prompt ?? props.label}
        variant={variant}
        labelVisibility="hidden"
      />
    )
  }
  const { axis: _axis, ...fieldProps } = props
  return (
    <Fields.TextField
      {...fieldProps}
      style={style}
      ref={ref as Ref<HTMLInputElement>}
      placeholder={prompt ?? (hidden ? props.label : undefined)}
      variant={variant}
      labelVisibility={hidden ? 'hidden' : 'visible'}
    />
  )
})
/**
 * Single-line controlled text with a label, an optional `prompt` and keyboard intent from
 * `kind`. In a `List` or `Form` it becomes the row; elsewhere it draws a standalone field.
 * `axis="vertical"` grows with its content.
 *
 * @example
 * <TextField label="Title" value={title} onChange={setTitle} />
 */
// The cast keeps single-line refs and events precisely typed when axis is omitted.
export const TextField = Field as {
  (props: HorizontalTextFieldProps & RefAttributes<HTMLInputElement>): ReactElement | null
  (props: VerticalTextFieldProps & RefAttributes<HTMLTextAreaElement>): ReactElement | null
}
/** SecureField's controlled text, label and prompt. */
export type SecureFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onSubmit' | 'size' | 'placeholder'
> & {
  label: string
  value: string
  onChange(value: string): void
  kind?: 'new-password' | 'current-password'
  submitLabel?: SubmitLabel
  onSubmit?(): void
  labelPlacement?: 'leading' | 'above'
  prompt?: string
  textFieldStyle?: TextFieldStyle
}
/** Password entry through secure system input. In a `List` or `Form` it becomes the row. */
export const SecureField = forwardRef<HTMLInputElement, SecureFieldProps>(function SecureField(
  { prompt, textFieldStyle, style, ...props },
  ref,
) {
  const variant = useFieldVariant(textFieldStyle)
  return (
    <Fields.SecureField
      {...props}
      style={style}
      ref={ref}
      placeholder={prompt ?? (variant !== 'standalone' ? props.label : undefined)}
      variant={variant}
      labelVisibility={prompt !== undefined || variant !== 'standalone' ? 'hidden' : 'visible'}
    />
  )
})
/** TextEditor's controlled text, label and prompt. */
export type TextEditorProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange' | 'rows' | 'placeholder'
> & {
  value: string
  onChange(value: string): void
  label?: string
  minLines?: number
  maxLines?: number
  prompt?: string
  textFieldStyle?: TextFieldStyle
}
/** Multiline text entry. In a `List` or `Form` it becomes the row; elsewhere it shows three
 * lines by default. */
export const TextEditor = forwardRef<HTMLTextAreaElement, TextEditorProps>(function TextEditor(
  { prompt, textFieldStyle, style, ...props },
  ref,
) {
  const variant = useFieldVariant(textFieldStyle)
  return (
    <Editor
      {...props}
      minLines={props.minLines ?? (variant === 'row' ? 1 : 3)}
      style={style}
      ref={ref}
      placeholder={prompt ?? (variant === 'plain' ? props.label : undefined)}
      variant={variant}
      labelVisibility={prompt !== undefined || variant !== 'standalone' ? 'hidden' : 'visible'}
    />
  )
})

/** The empty state's title, optional description and icon (a tray by default). */
export type ContentUnavailableViewProps = {
  /** System symbol used when no custom icon is supplied. Defaults to tray. */
  symbol?: SymbolName
  title: string
  description?: ReactNode
  icon?: ReactNode
  className?: string
  children?: ReactNode
}
/** An empty state: an icon, a title, an optional description and optional action children. */
export function ContentUnavailableView({
  symbol = 'tray',
  title,
  description,
  icon,
  className,
  children,
}: ContentUnavailableViewProps) {
  return (
    <div data-satin-empty-state="true" className={className}>
      <div data-satin-empty-state-icon="true" aria-hidden="true">
        {icon ?? <SymbolImage name={symbol} />}
      </div>
      <strong data-satin-empty-state-title="true">{title}</strong>
      {description && <div data-satin-empty-state-description="true">{description}</div>}
      {children && <div data-satin-unavailable-actions="true">{children}</div>}
    </div>
  )
}
