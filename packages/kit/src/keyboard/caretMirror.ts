import { EDITOR_TEXT_LAYOUT_PROPERTIES } from '../text-input/editorTextLayout.ts'

type Editor = HTMLInputElement | HTMLTextAreaElement
type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}
export type CaretLine = Readonly<{ top: number; bottom: number }>

/** A password is drawn as discs: the mirror draws the same discs and never holds the text. */
function isSecure(editor: Editor, computed: CSSStyleDeclaration) {
  const security = computed.getPropertyValue('-webkit-text-security')
  return editor.type === 'password' || (security !== '' && security !== 'none')
}

function setImportant(element: HTMLElement, property: string, value: string) {
  element.style.setProperty(property, value, 'important')
}

/**
 * A hidden copy of the editor's text box at the editor's place, isolated from the page's styles
 * (`all: initial`, its own element name, every declaration important), so that inherited body
 * styles and `div` rules cannot move its text. Removed by the caller.
 */
function createMirror(editor: Editor, text: string, marker?: { before: number }) {
  const document = editor.ownerDocument
  const rect = editor.getBoundingClientRect()
  const computed = getComputedStyle(editor)
  const secure = isSecure(editor, computed)
  const mirror = document.createElement('satin-caret-mirror')
  setImportant(mirror, 'all', 'initial')
  for (const property of EDITOR_TEXT_LAYOUT_PROPERTIES)
    setImportant(mirror, property, computed.getPropertyValue(property))
  const layout: Record<string, string> = {
    display: 'block',
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: '0',
    'box-sizing': 'border-box',
    'border-style': 'solid',
    'border-color': 'transparent',
    opacity: '0',
    visibility: 'visible',
    'pointer-events': 'auto',
    'z-index': '2147483647',
    overflow: 'hidden',
    'white-space': editor instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre',
    '-webkit-text-security': secure ? 'disc' : 'none',
  }
  for (const [property, value] of Object.entries(layout)) setImportant(mirror, property, value)
  // A secure field's characters are all drawn as the same disc: the mirror holds placeholders.
  const shown = secure ? '*'.repeat(text.length) : text
  const content = document.createTextNode(marker ? shown.slice(0, marker.before) : shown)
  mirror.append(content)
  const caret = marker ? createMarker(document) : null
  if (caret) mirror.append(caret, shown.slice(marker!.before))
  // Stay in the same dialog top layer; a body mirror would be below the modal. A page editor's
  // mirror goes on the body: a transformed screen would otherwise offset its fixed position.
  ;(editor.closest('dialog') ?? document.body).append(mirror)
  // A dialog has `contain: layout`, which makes it the containing block of a fixed box: measure
  // where the mirror landed and move it onto the editor.
  const placed = mirror.getBoundingClientRect()
  if (placed.left !== rect.left || placed.top !== rect.top) {
    setImportant(mirror, 'left', `${2 * rect.left - placed.left}px`)
    setImportant(mirror, 'top', `${2 * rect.top - placed.top}px`)
  }
  mirror.scrollLeft = editor.scrollLeft
  mirror.scrollTop = editor.scrollTop
  return { mirror, content, caret }
}

/** An inline box at the caret, inheriting the mirror's text style and nothing from the page. */
function createMarker(document: Document) {
  const marker = document.createElement('satin-caret-marker')
  setImportant(marker, 'all', 'inherit')
  const reset: Record<string, string> = {
    display: 'inline',
    position: 'static',
    width: 'auto',
    height: 'auto',
    margin: '0',
    padding: '0',
    'border-width': '0',
    'text-indent': '0',
    overflow: 'visible',
  }
  for (const [property, value] of Object.entries(reset)) setImportant(marker, property, value)
  marker.textContent = '\u200b'
  return marker
}

/** The text offset under a point of the editor (WebKit hides the input's internal text node). */
export function caretOffsetAt(editor: Editor, x: number, y: number): number | null {
  const document = editor.ownerDocument as CaretDocument
  const { mirror, content } = createMirror(editor, editor.value || '​')
  try {
    const caret = document.caretPositionFromPoint?.(x, y)
    if (caret?.offsetNode === content) return Math.min(caret.offset, editor.value.length)
    const range = document.caretRangeFromPoint?.(x, y)
    if (range?.startContainer === content) return Math.min(range.startOffset, editor.value.length)
    return null
  } finally {
    mirror.remove()
  }
}

/**
 * The line box of the caret at `offset` in a multi-line editor, in viewport coordinates, as the
 * editor draws it now (its own scroll included). Null for single-line fields (the field is the line).
 */
export function caretLineAt(editor: Editor, offset: number): CaretLine | null {
  if (!(editor instanceof HTMLTextAreaElement)) return null
  const before = Math.max(0, Math.min(offset, editor.value.length))
  const { mirror, caret } = createMirror(editor, editor.value, { before })
  try {
    const line = caret!.getBoundingClientRect()
    const box = mirror.getBoundingClientRect()
    const editorBox = editor.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || line.height || 22
    // The mirror scrolled like the editor; place the line relative to the editor itself.
    const top = editorBox.top + (line.top - box.top)
    return { top, bottom: top + Math.max(line.height, lineHeight) }
  } finally {
    mirror.remove()
  }
}
