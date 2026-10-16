// Optional diagnostics for installed-app fixtures and app-authored diagnostic screens.
// Rendering measurements and coordinate calibration remain in satin/internal.
export {
  InstallationDiagnostics,
  readInstallationFailure,
  type InstallationDiagnosticsProps,
  type InstallationFailure,
} from './app/InstallationDiagnostics.tsx'
export { readAppearanceDiagnostics } from './app/appearance.ts'
export type { AppearanceEvent } from './app/appearanceStore.ts'
