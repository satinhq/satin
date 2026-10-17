import bundled from './inventory.json' with { type: 'json' }

export interface LicenseNotice {
  readonly name: string
  readonly version: string | null
  readonly license: string
  readonly source: string
  readonly text: string
  readonly sha256: string
  readonly bundledPaths: readonly string[]
  readonly role: string
}

declare global {
  interface Window {
    __SATIN_ACKNOWLEDGEMENTS__?: readonly LicenseNotice[]
  }
}
export function licenseNotices(): readonly LicenseNotice[] {
  return typeof window === 'undefined' ? bundled : (window.__SATIN_ACKNOWLEDGEMENTS__ ?? bundled)
}
export function renderNotices(notices: readonly LicenseNotice[]): string {
  return notices
    .map(
      notice =>
        `## ${notice.name}${notice.version ? ` ${notice.version}` : ''}\n\n` +
        `License: ${notice.license}\nSource: ${notice.source}\n\n${notice.text}\n`,
    )
    .join('\n')
}
