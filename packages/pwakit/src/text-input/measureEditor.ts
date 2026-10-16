import { EDITOR_TEXT_LAYOUT_PROPERTIES } from './editorTextLayout.ts'

/** Measure wrapping without resizing, selecting, or scrolling the live editing control. */
export function measureEditorContentHeight(editor: HTMLTextAreaElement): number {
  const document = editor.ownerDocument
  const computed = getComputedStyle(editor)
  const mirror = document.createElement('textarea')
  mirror.setAttribute('aria-hidden', 'true')
  mirror.tabIndex = -1
  mirror.inert = true
  mirror.wrap = editor.wrap
  mirror.value = editor.value
  mirror.placeholder = editor.placeholder
  const copy = [
    ...EDITOR_TEXT_LAYOUT_PROPERTIES,
    'white-space',
    'padding',
    'border-style',
    'box-sizing',
    'width',
  ]
  mirror.style.setProperty('all', 'initial', 'important')
  for (const property of copy) {
    mirror.style.setProperty(property, computed.getPropertyValue(property), 'important')
  }
  const isolation = {
    position: 'fixed',
    top: '0',
    left: '0',
    height: '0',
    'min-height': '0',
    'max-height': 'none',
    'min-width': '0',
    'max-width': 'none',
    margin: '0',
    visibility: 'hidden',
    'pointer-events': 'none',
    overflow: 'hidden',
    resize: 'none',
  }
  for (const [property, value] of Object.entries(isolation)) {
    mirror.style.setProperty(property, value, 'important')
  }
  document.body.append(mirror)
  try {
    return mirror.scrollHeight
  } finally {
    mirror.remove()
  }
}
