#!/usr/bin/env node

import { checkTargets, formatDiagnostic } from '../src/checker.mjs'

const allowInternal = process.argv.includes('--allow-internal')
const targets = process.argv.slice(2).filter(arg => arg !== '--allow-internal')
if (targets.length === 0) {
  console.error('Usage: check-fidelity <source file or directory> [...]')
  process.exitCode = 2
} else {
  try {
    const diagnostics = (await checkTargets(targets)).filter(
      diagnostic =>
        !allowInternal ||
        !['no-internal-import', 'no-private-css-variable'].includes(diagnostic.ruleId),
    )
    for (const diagnostic of diagnostics) console.error(formatDiagnostic(diagnostic))

    if (diagnostics.length > 0) {
      console.error(`Satin fidelity check found ${diagnostics.length} violation(s).`)
      process.exitCode = 1
    }
  } catch (error) {
    if (error.code !== 'static-evaluation-budget-exceeded') throw error
    console.error(error.message)
    process.exitCode = 2
  }
}
