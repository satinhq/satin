// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GlassEffect } from './glass.tsx'
import { Sheet, type SheetProps } from './presentation.tsx'
import { SearchDrawer } from '../search/SearchDrawer.tsx'
import { SensoryButton, type SensoryFeedback } from '../haptics/SensoryButton.tsx'

it('preserves DOM identity independently of glass morph identity', () => {
  const markup = renderToStaticMarkup(<GlassEffect id="account-actions">Actions</GlassEffect>)
  expect(markup).toContain('id="account-actions"')
  expect(() =>
    renderToStaticMarkup(
      <GlassEffect
        shape={{ kind: 'roundedRectangle', cornerRadius: 12, bottomCornerRadius: 0 } as never}
      />,
    ),
  ).toThrow('bottomCornerRadius')
})

it('rejects unsupported or incomplete JavaScript control contracts', () => {
  expect(() =>
    renderToStaticMarkup(
      <SensoryButton sensoryFeedback={'success' as SensoryFeedback} onPress={() => {}}>
        Save
      </SensoryButton>,
    ),
  ).toThrow('only selection feedback or false')
  expect(() =>
    renderToStaticMarkup(
      <Sheet {...({ isPresented: true, title: 'Editor', selection: 'large' } as SheetProps)}>
        Editor
      </Sheet>,
    ),
  ).toThrow('onSelectionChange')
  expect(() =>
    renderToStaticMarkup(
      <SearchDrawer
        configuration={{ text: '', onTextChange() {}, isPresented: false } as never}
        scroller={{ current: null }}
      />,
    ),
  ).toThrow('onPresentedChange')
})

it('keeps search semantics and its return hint on a single-line field', async () => {
  const { TextField } = await import('./controls.tsx')
  const markup = renderToStaticMarkup(
    <TextField label="Search" kind="search" value="" onChange={() => {}} />,
  )
  expect(markup).toContain('type="search"')
  expect(markup).toContain('inputMode="text"')
  expect(markup).toContain('enterKeyHint="search"')
  const next = renderToStaticMarkup(
    <TextField label="Search" kind="search" submitLabel="next" value="" onChange={() => {}} />,
  )
  expect(next).toContain('enterKeyHint="next"')
})

it('keeps multiline Return unless the caller requests an action key', async () => {
  const { TextField } = await import('./controls.tsx')
  const markup = renderToStaticMarkup(
    <TextField axis="vertical" label="Notes" value="" onChange={() => {}} />,
  )
  expect(markup).not.toContain('enterKeyHint')
  const search = renderToStaticMarkup(
    <TextField
      axis="vertical"
      label="Search"
      kind="search"
      submitLabel="search"
      value=""
      onChange={() => {}}
    />,
  )
  expect(search).toContain('inputMode="text"')
  expect(search).toContain('enterKeyHint="search"')
  expect(search).not.toContain('type="search"')
})
