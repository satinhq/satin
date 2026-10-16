import { createHash } from 'node:crypto'
import type { AppDefinition } from './definition.ts'

/** Apple's public WebClip payload. Status-bar appearance remains head-owned. */
export function generateWebClipProfile(app: AppDefinition, icon: Uint8Array) {
  if (!app.mdm) throw new Error('Set mdm.origin to export a WebClip profile.')
  const escape = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const identity =
    'app.satin.' +
    createHash('sha256')
      .update(app.mdm.origin + app.id)
      .digest('hex')
      .slice(0, 24)
  const uuid = (suffix: string) => {
    const h = createHash('sha256')
      .update(identity + suffix)
      .digest('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
  }
  const field = (key: string, value: string) => `<key>${key}</key><string>${escape(value)}</string>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>${field('PayloadType', 'Configuration')}${field('PayloadIdentifier', identity)}${field('PayloadUUID', uuid('profile'))}${field('PayloadDisplayName', app.name)}<key>PayloadVersion</key><integer>1</integer><key>PayloadContent</key><array><dict>${field('PayloadType', 'com.apple.webClip.managed')}${field('PayloadIdentifier', identity + '.clip')}${field('PayloadUUID', uuid('clip'))}<key>PayloadVersion</key><integer>1</integer>${field('Label', app.shortName)}${field('URL', new URL(app.startRoute, app.mdm.origin).href)}<key>FullScreen</key><true/><key>IsRemovable</key><true/><key>Precomposed</key><true/><key>IgnoreManifestScope</key><false/><key>Icon</key><data>${Buffer.from(icon).toString('base64')}</data></dict></array></dict></plist>\n`
}
