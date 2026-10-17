import { expect, it } from 'vitest'
import { build } from 'vite'
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { bundledLicenseNotices, renderNotices } from './bundledNotices.ts'
import type { LicenseNotice } from './inventory.ts'

it('delivers exact upstream notices for modules in a real consumer bundle, excluding build-only dependencies', async () => {
  const root = await mkdtemp(join(process.env.SATIN_SCRATCH_ROOT ?? '/tmp', 'license-consumer-'))
  try {
    const react = fileURLToPath(import.meta.resolve('react'))
    const dom = fileURLToPath(import.meta.resolve('react-dom/client'))
    await writeFile(
      join(root, 'entry.js'),
      `import React from ${JSON.stringify(react)}; import {createRoot} from ${JSON.stringify(dom)}; createRoot(document.body).render(React.createElement('p', null, 'Consumer'));`,
    )
    let notices: readonly LicenseNotice[] = []
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      build: { write: false, rollupOptions: { input: join(root, 'entry.js') } },
      plugins: [
        {
          name: 'license-consumer-proof',
          async generateBundle(_options, bundle) {
            notices = await bundledLicenseNotices(
              Object.values(bundle).flatMap(item =>
                item.type === 'chunk' ? Object.keys(item.modules) : [],
              ),
            )
          },
        },
      ],
    })
    for (const notice of notices) {
      expect(notice.sha256, `${notice.name} license text hash`).toBe(
        createHash('sha256').update(notice.text).digest('hex'),
      )
    }
    const names = notices.map(notice => notice.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Satin',
        'Framework7 Icons',
        'liquid-glass-web-react',
        'react',
        'react-dom',
        'scheduler',
      ]),
    )
    expect(names).not.toContain('sharp')
    expect(names).not.toContain('typescript')
    const upstream = await readFile(
      fileURLToPath(import.meta.resolve('react')).replace(/index\.js$/, 'LICENSE'),
      'utf8',
    )
    expect(renderNotices(notices)).toContain(upstream)
    const preserved = await readFile(join(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8')
    expect(preserved).toContain('Pallav Agarwal')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
