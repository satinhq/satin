// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './controls.tsx'
import { ToolbarConfirmationContext, ToolbarContext } from './toolbar.tsx'
import { Label } from './Label.tsx'

it.each([false, true])(
  'matches stock text and icon confirmation defaults, disabled=%s',
  disabled => {
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <ToolbarContext value={true}>
        <Button disabled={disabled} onPress={() => {}}>
          Cancel
        </Button>
        <ToolbarConfirmationContext value={true}>
          <Button disabled={disabled} onPress={() => {}}>
            Done
          </Button>
          <Button disabled={disabled} symbol="checkmark" onPress={() => {}}>
            Done
          </Button>
          <Button disabled={disabled} symbol="checkmark" aria-label="Done" onPress={() => {}} />
          <Button
            disabled={disabled}
            iconOnly
            aria-label="Done"
            symbol="checkmark"
            onPress={() => {}}
          />
          <Button disabled={disabled} onPress={() => {}}>
            <Label symbol="checkmark" labelStyle="iconOnly">
              Done
            </Label>
          </Button>
          <Button disabled={disabled} buttonStyle="glass" symbol="checkmark" onPress={() => {}}>
            Done
          </Button>
        </ToolbarConfirmationContext>
      </ToolbarContext>,
    )
    const buttons = [...host.querySelectorAll('button')]
    expect(buttons.map(button => button.getAttribute('data-satin-glass-button'))).toEqual([
      'glass',
      'glass',
      'glassProminent',
      'glassProminent',
      'glassProminent',
      'glassProminent',
      'glass',
    ])
    expect(buttons.every(button => button.disabled === disabled)).toBe(true)
    expect(buttons[2]?.getAttribute('aria-label')).toBe('Done')
    expect(buttons[2]?.textContent).not.toContain('Done')
  },
)
