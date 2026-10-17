import { bindMenuTriggerHold } from '../menu/menuTriggerHold.ts'
import { useContext, useEffect, useRef } from 'react'
import { ListContext } from '../list-form/listContext.ts'
import { Row } from '../list-form/ListForm.tsx'
import { Pressable } from '../press/Pressable.tsx'
import { useMenuPresenter, type MenuProps, type MenuTriggerProps } from './menuPresenter.tsx'
export type { MenuProps, MenuTriggerProps } from './menuPresenter.tsx'

export function Menu({ label, actions, trigger, disabled = false }: MenuProps) {
  const list = useContext(ListContext)
  const anchor = useRef<HTMLSpanElement>(null)
  const presenter = useMenuPresenter({ label, actions, disabled })
  const latest = useRef(presenter)
  latest.current = presenter
  useEffect(() => {
    if (!anchor.current || disabled) return
    const element = anchor.current
    return bindMenuTriggerHold(element, contact =>
      latest.current.show({ kind: 'trigger', element, contact }),
    )
  }, [disabled])
  const props: MenuTriggerProps = {
    disabled,
    onPress: () => anchor.current && presenter.show({ kind: 'trigger', element: anchor.current }),
    'aria-expanded': presenter.open,
    'aria-haspopup': 'menu',
    'aria-controls': presenter.open ? presenter.id : undefined,
  }
  return (
    <>
      <span
        ref={anchor}
        data-satin-menu-label="true"
        data-satin-menu-row={list && !trigger ? 'true' : undefined}
        data-satin-keep-keyboard="true"
        onPointerDownCapture={event => {
          const active = document.activeElement
          if (
            active instanceof HTMLElement &&
            active.matches('input, textarea, [contenteditable="true"]')
          )
            event.preventDefault()
          if (event.isPrimary && event.button === 0 && anchor.current)
            presenter.prepare({ kind: 'trigger', element: anchor.current }, event.pointerId)
        }}
        onPointerCancelCapture={event => presenter.cancelPreparation(event.pointerId)}
        onPointerUp={event => presenter.cancelPreparation(event.pointerId)}
      >
        {trigger ? (
          trigger(props)
        ) : list ? (
          <Row
            label={label}
            onPress={props.onPress}
            disabled={disabled}
            buttonProps={props}
            className="satin-list-button"
          />
        ) : (
          <Pressable {...props} data-satin-glass-button="glass">
            {label}
          </Pressable>
        )}
      </span>
      {presenter.presentation}
    </>
  )
}
