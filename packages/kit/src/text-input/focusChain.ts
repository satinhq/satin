import { useMemo } from 'react'

/** The parts of a field element that `useFocusChain` uses to move focus. */
export type FocusChainField = Pick<
  HTMLInputElement,
  'focus' | 'blur' | 'disabled' | 'readOnly' | 'isConnected' | 'closest'
>
/** Explicit order survives conditional rendering; disabled/unmounted fields are skipped. */
export function createFocusChain<Key extends string>(order: readonly Key[]) {
  if (new Set(order).size !== order.length) throw new Error('Focus chain keys must be unique.')
  const fields = new Map<Key, FocusChainField>()
  const bindings = new Map(
    order.map(key => [
      key,
      {
        ref: (element: FocusChainField | null) => {
          if (element) fields.set(key, element)
          else fields.delete(key)
        },
        onSubmit: () => next(key),
      },
    ]),
  )
  const available = (field: FocusChainField | undefined): field is FocusChainField =>
    Boolean(
      field?.isConnected &&
      !field.disabled &&
      !field.readOnly &&
      !field.closest('[inert], [hidden]'),
    )
  function next(key: Key) {
    for (const candidate of order.slice(order.indexOf(key) + 1)) {
      const field = fields.get(candidate)
      if (available(field)) {
        field.focus({ preventScroll: true })
        return
      }
    }
    fields.get(key)?.blur()
  }
  return {
    field(key: Key) {
      const binding = bindings.get(key)
      if (!binding) throw new Error(`Unknown focus chain key: ${key}`)
      return binding
    },
    focus(key: Key) {
      const field = fields.get(key)
      if (available(field)) field.focus({ preventScroll: true })
    },
    dismiss() {
      for (const field of fields.values()) field.blur()
    },
  }
}
/**
 * Moves focus through a form's fields in `order`. The return key goes to the next field and the
 * last one dismisses the keyboard. Disabled and unmounted fields are skipped. Spread
 * `field(key)` onto each field.
 *
 * @example
 * const focus = useFocusChain(['name', 'email'])
 * <TextField label="Name" {...focus.field('name')} value={name} onChange={setName} />
 */
export function useFocusChain<Key extends string>(order: readonly Key[]) {
  const identity = JSON.stringify(order)
  return useMemo(() => createFocusChain(JSON.parse(identity) as Key[]), [identity])
}
