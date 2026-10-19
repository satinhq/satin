#!/usr/bin/env node

// TS 7's native API kills its server on close. The server can write this exact
// cancellation line during a successful check. Keep every failure diagnostic.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const result = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('./run-fidelity.mjs', import.meta.url)), ...process.argv.slice(2)],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
)
if (result.error) throw result.error
process.stdout.write(result.stdout ?? '')
const stderr = result.stderr ?? ''
process.stderr.write(result.status === 0 ? stderr.replace(/^context canceled\r?\n/gm, '') : stderr)
process.exitCode = result.status ?? 1
