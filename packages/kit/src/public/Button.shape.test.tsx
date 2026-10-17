// @vitest-environment happy-dom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from './controls.tsx'
import { GlassButton, GlassEffectContainer } from '../glass/GlassEffect.tsx'

it('applies an explicit fixed glass border to the material and inner control clipping', () => {
  const props = {
    buttonStyle: 'glass' as const,
    buttonBorderShape: { kind: 'roundedRectangle' as const, cornerRadius: 12 },
    onPress() {},
  }
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Button {...props}>Fixed</Button>)
  expect(
    container.querySelector<HTMLElement>('[data-satin-glass-effect]')?.style.borderRadius,
  ).toBe('12px')
  expect(container.querySelector<HTMLButtonElement>('button')?.style.borderRadius).toBe('12px')
  expect(container.querySelector('button')?.hasAttribute('buttonBorderShape')).toBe(false)
})

it('keeps the existing automatic capsule and default inner styling', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    <Button buttonStyle="glass" onPress={() => {}}>
      Automatic
    </Button>,
  )
  expect(
    container.querySelector<HTMLElement>('[data-satin-glass-effect]')?.style.borderRadius,
  ).toBe('9999px')
  expect(container.querySelector<HTMLButtonElement>('button')?.style.borderRadius).toBe('')
})

it.each(['plain', 'bordered', 'borderedProminent'] as const)(
  'preserves the authored tint for %s with or without a fixed border',
  style => {
    for (const buttonBorderShape of [
      undefined,
      { kind: 'roundedRectangle' as const, cornerRadius: 12 },
    ]) {
      const container = document.createElement('div')
      container.innerHTML = renderToStaticMarkup(
        <Button
          buttonStyle={style}
          tint="red"
          buttonBorderShape={buttonBorderShape}
          onPress={() => {}}
        >
          Tinted
        </Button>,
      )
      expect(container.querySelector('button')?.style.getPropertyValue('--satin-tint')).toBe('red')
      if (buttonBorderShape && style !== 'plain')
        expect(container.querySelector('button')?.style.borderRadius).toBe('12px')
    }
  },
)

it('keeps fixed clipping inside a glass container content wrapper', () => {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(
    <GlassEffectContainer>
      <Button
        buttonStyle="glass"
        buttonBorderShape={{ kind: 'roundedRectangle', cornerRadius: 12 }}
        onPress={() => {}}
      >
        Grouped fixed
      </Button>
    </GlassEffectContainer>,
  )
  expect(container.querySelector('[data-satin-glass-field-content]')).not.toBeNull()
  expect(container.querySelector<HTMLButtonElement>('button')?.style.borderRadius).toBe('12px')
})

it('gives a large content plus the native composer allocation without changing toolbar circles', () => {
  const style = document.createElement('style')
  style.textContent = frameworkStyleDeclarations()
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(
    <>
      <Button
        buttonStyle="glass"
        controlSize="large"
        iconOnly
        aria-label="Add Attachment"
        symbol="plus"
        onPress={() => {}}
      />
      <GlassButton iconOnly aria-label="Toolbar plus" onPress={() => {}}>
        +
      </GlassButton>
    </>,
  )
  document.head.append(style)
  document.body.append(host)
  try {
    const [button, toolbar] = host.querySelectorAll('button')
    expect(getComputedStyle(button!).width).toBe('48px')
    expect(Number.parseFloat(getComputedStyle(button!).height)).toBeCloseTo(46.666667, 3)
    expect(getComputedStyle(toolbar!).width).toBe('44px')
    expect(getComputedStyle(toolbar!).height).toBe('44px')
  } finally {
    host.remove()
    style.remove()
  }
})
