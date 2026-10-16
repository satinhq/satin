#!/usr/bin/env node
import { runDeployCheck } from '../dist/app/checkCli.js'
if (process.argv[2] !== 'check' || !process.argv[3] || process.argv.length !== 4) {
  console.error('Usage: satin check <deployed-app-or-install-url>')
  process.exitCode = 1
} else {
  try {
    process.exitCode = await runDeployCheck(process.argv[3])
  } catch (error) {
    console.error('FAIL ' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
