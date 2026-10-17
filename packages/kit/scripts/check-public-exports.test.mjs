import assert from 'node:assert/strict'
import { test } from 'vitest'
import { checkInventory, exportNames } from './check-public-exports.mjs'

const row = (name, audience = 'App') =>
  `| \`${name}\` | ${audience} | Use this API for its documented application behavior. |`
const doc = body => `<!-- public-api:start -->\n${body}\n<!-- public-api:end -->`

test('inventory checks exported names including aliases and types, never incidental mentions', () => {
  const names = exportNames(
    "export { internal as publicName, type Props } from './a'; export type { State } from './b'",
  )
  assert.deepEqual(names, ['publicName', 'Props', 'State'])
  assert.equal(checkInventory(names, doc(names.map(name => row(name)).join('\n')), 'fixture'), 3)
  assert.throws(
    () => checkInventory(names, doc(row('publicName')) + '`Props` and `State`', 'fixture'),
    /undocumented exports: Props, State/,
  )
  assert.throws(
    () => checkInventory(['publicName'], doc(row('publicName') + '\n' + row('removed')), 'fixture'),
    /stale entries: removed/,
  )
  assert.throws(
    () =>
      checkInventory(['publicName'], doc(row('publicName') + '\n' + row('publicName')), 'fixture'),
    /duplicate/,
  )
  assert.throws(() => exportNames("export * from './new-api'"), /Unrecognized/)
  assert.throws(
    () => checkInventory(['newAPI'], doc(row('newAPI', 'Unknown')), 'fixture'),
    /undocumented/,
  )
})
