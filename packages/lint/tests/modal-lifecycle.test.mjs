import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modalLifecycleViolations } from '../scripts/check-modal-lifecycle.mjs'

test('modal opening is rejected outside the shared owner', () => {
  assert.equal(modalLifecycleViolations('dialog.showModal()', 'actions/Menu.tsx').length, 1)
  assert.equal(modalLifecycleViolations('dialog.showModal()', 'modal/lifecycle.ts').length, 0)
})
test('comments, strings, popovers and lifecycle tests are allowed', () => {
  assert.deepEqual(
    modalLifecycleViolations(
      '// showModal()\nconst text = "showModal()"; host.showPopover()',
      'glass/Menu.tsx',
    ),
    [],
  )
  assert.deepEqual(modalLifecycleViolations('dialog.showModal()', 'modal/lifecycle.test.ts'), [])
})
