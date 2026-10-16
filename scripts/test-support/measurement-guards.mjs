// Test-runner admission only; never imported by the product.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
export const PROTECTED_PREVIEW_PORTS = [5500, 5502, 8500, 8502]
export function validateCatalystPort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || PROTECTED_PREVIEW_PORTS.includes(port))
    throw Error(
      'Catalyst requires an integer port 1..65535 excluding protected Preview ports 5500/5502/8500/8502',
    )
  return port
}
const diagnosticHTML = text => /satin-diagnostic|cat-stage-main\.js/.test(text)
export function assertMeasurementBundle(dist) {
  if (
    ['satin-diagnostic.json', 'cat-stage-provenance.json', 'cat-stage-main.js'].some(file =>
      existsSync(join(dist, file)),
    )
  )
    throw Error('Diagnostic bundle cannot be measured')
  for (const file of ['index.html', 'app/index.html']) {
    const path = join(dist, file)
    if (existsSync(path) && diagnosticHTML(readFileSync(path, 'utf8')))
      throw Error('Diagnostic bundle cannot be measured')
  }
}
export async function assertMeasurementServer(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw Error(`Measurement server returned ${response.status}`)
  if (diagnosticHTML(await response.text())) throw Error('Diagnostic bundle cannot be measured')
}
// Recheck the loaded document before recording. This also catches a diagnostic service-worker
// cache or a server changed after preflight, including old stage copies predating the marker.
export const measurementPageGuard = `if(globalThis.__SATIN_DIAGNOSTIC__ || globalThis.__catStage || globalThis.__catWorker || document.querySelector('meta[name="satin-diagnostic"],script[src*="cat-stage-main.js"]'))throw Error('Diagnostic bundle cannot be measured');`
export function measurementBudget(refreshHz = 60) {
  return {
    requestedCallbackHz: refreshHz,
    analysisBudgetHz: 60,
    budgetMs: 1000 / 60,
    droppedFrameMs: 25,
    qualification: '60 Hz-budget result; not a 120 fps qualification',
  }
}
