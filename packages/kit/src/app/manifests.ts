import { generateSatinManifestJson, type AppDefinition } from './definition.ts'

// The dark URL remains an alias for installed clients. Each manifest carries
// both appearances; selecting a manifest must never freeze the appearance.
export const APP_MANIFEST_VARIANTS = [
  { suffix: '.webmanifest', idiom: 'phone', selected: true },
  { suffix: '-dark.webmanifest', idiom: 'phone', selected: false },
  { suffix: '-ipad.webmanifest', idiom: 'pad', selected: true },
] as const

export function appManifestStem(app: Pick<AppDefinition, 'id'>) {
  return `satin-app-${encodeURIComponent(app.id).replaceAll('%', '_')}`
}

export function appManifestPaths(app: Pick<AppDefinition, 'id'>, base: string) {
  return APP_MANIFEST_VARIANTS.map(variant => base + appManifestStem(app) + variant.suffix)
}

export function appManifestFiles(app: AppDefinition, stem: string) {
  return Object.fromEntries(
    APP_MANIFEST_VARIANTS.map(variant => [
      stem + variant.suffix,
      generateSatinManifestJson(app, variant.idiom),
    ]),
  )
}
