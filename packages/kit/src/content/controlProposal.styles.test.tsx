// @vitest-environment jsdom
import { frameworkStyleDeclarations } from '../../test/domStyles.ts'
import { afterEach, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pressable } from '../press/Pressable.tsx'
import { Button } from '../public/controls.tsx'
import { Text } from './content.tsx'
afterEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})
// A proposal is available space, not an instruction to stretch intrinsic controls.
for (const Control of [Pressable, Button]) {
  it.each(['vstack', 'hstack', 'zstack', 'grid-cell', 'list-row'])(
    `${Control === Button ? 'Button' : 'Pressable'} hugs its label in %s unless the label requests fill`,
    parent => {
      const style = document.createElement('style')
      style.textContent = frameworkStyleDeclarations().replaceAll('\n', ' ')
      document.head.append(style)
      const box = document.createElement('div')
      if (parent === 'grid-cell') box.setAttribute('data-satin-grid-cell', 'true')
      else if (parent === 'list-row') box.setAttribute('data-satin-list-row-options', 'true')
      else box.setAttribute('data-satin-content', parent)
      document.body.append(box)
      box.innerHTML = renderToStaticMarkup(<Control onPress={() => {}}>Artist</Control>)
      expect(getComputedStyle(box.firstElementChild!).width).not.toBe('100%')
      box.innerHTML = renderToStaticMarkup(
        <Control onPress={() => {}}>
          <Text frame={{ maxWidth: 'infinity' }}>Artist</Text>
        </Control>,
      )
      expect(getComputedStyle(box.firstElementChild!).width).toBe('100%')
    },
  )
}
