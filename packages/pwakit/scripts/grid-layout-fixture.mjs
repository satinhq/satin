// Generate from the built framework, then serve the output and inspect it in a WebKit host.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GridItem, LazyVGrid, Text, VStack } from '../dist/content/content.js'
import { checkGridLayout } from '../../../scripts/grid-layout/acceptance.mjs'

const out = resolve(process.argv[2])
const definitions = {
  adaptive: [GridItem.adaptive({ minimum: 150, spacing: 16 })],
  flexible: Array.from({ length: 4 }, () => GridItem.flexible({ minimum: 100, spacing: 16 })),
  fixed: Array.from({ length: 4 }, () => GridItem.fixed({ size: 150, spacing: 16 })),
}
const artwork =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#376f8a"/><circle cx="150" cy="150" r="65" fill="#a9d1cd"/></svg>',
  )
const markup = renderToStaticMarkup(
  h(
    'main',
    null,
    Object.entries(definitions).map(([kind, columns]) =>
      h(
        'section',
        { key: kind },
        h('h2', null, kind),
        h(
          'div',
          {
            'data-grid-layout-case': kind,
            style: { display: 'flex', width: 834, padding: '0 20px', boxSizing: 'border-box' },
          },
          h(
            LazyVGrid,
            { columns, spacing: 20, style: { width: '100%' } },
            Array.from({ length: 8 }, (_, index) =>
              h(
                'button',
                {
                  key: index,
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 0,
                    border: 0,
                    textAlign: 'start',
                    background: 'transparent',
                  },
                },
                h(
                  VStack,
                  { frame: { maxWidth: 'infinity' }, alignment: 'leading', spacing: 0 },
                  h('img', {
                    src: artwork,
                    alt: '',
                    'data-grid-layout-ink': '',
                    style: { display: 'block', width: '100%', aspectRatio: '1', marginBottom: 7 },
                  }),
                  h(
                    Text,
                    { 'data-grid-layout-ink': '', style: { fontSize: 13, lineHeight: '16px' } },
                    index === 0
                      ? 'A long album caption that wraps across several lines at portrait width'
                      : `Album ${index + 1}`,
                  ),
                  h(
                    Text,
                    { 'data-grid-layout-ink': '', style: { fontSize: 13, lineHeight: '16px' } },
                    'Artist metadata',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
)
const css = await readFile(new URL('../dist/styles.css', import.meta.url), 'utf8')
await mkdir(out, { recursive: true })
await writeFile(
  resolve(out, 'index.html'),
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grid layout regression</title><style>${css}\nbody{overflow:auto;height:auto;margin:0}h2{margin:8px 20px;font:17px -apple-system}</style><div data-satin-root data-satin-launch="ready">${markup}</div><script>performance.mark('satin-launch-ready');performance.mark('satin-glass-ready');window.checkGridLayout=${checkGridLayout.toString()};</script>`,
)
console.log(out)
