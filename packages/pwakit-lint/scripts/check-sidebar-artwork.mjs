import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// A vector-only boundary prevents the previous UIImage PNG export from
// returning. Provenance still requires source review; this is not a license test.
const source = await readFile(
  resolve(process.argv[2] ?? 'src/navigation/SidebarSymbol.tsx'),
  'utf8',
)
if (/data:image|base64|<image\b|<img\b|url\s*\(/i.test(source))
  throw Error(
    'SidebarSymbol must use the shared Symbol renderer, never embedded/exported image assets.',
  )
if (
  !source.includes('<Symbol') ||
  !source.includes('Framework7 Icons (MIT)') ||
  /<svg|<path/.test(source)
)
  throw Error('SidebarSymbol must delegate to Symbol and retain its Framework7 MIT provenance.')
console.log('Sidebar symbol vector/provenance boundary passed.')
