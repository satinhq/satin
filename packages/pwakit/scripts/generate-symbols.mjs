import { createHash } from 'node:crypto'
// Reproduce the curated catalogue from the pinned MIT dependency. No fonts are copied.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isExcludedSymbolName } from '../src/symbols/exclusions.ts'
const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(dirname(require.resolve('framework7-icons/package.json')), 'svg')
const mappings = {
  'square.and.arrow.up': 'square_arrow_up',
  'square.and.pencil': 'square_pencil',
  'questionmark.square': 'question_square',
  car: 'car_fill',
  gearshape: 'gear_alt',
  magnifyingglass: 'search',
  'sidebar.left': 'sidebar_left',
  'arrowshape.turn.up.left': 'arrowshape_turn_up_left',
  'clock.arrow.circlepath': 'clock_arrow_circlepath',
  'slider.horizontal.3': 'slider_horizontal_3',
  'rectangle.stack': 'rectangle_stack',
  'doc.text': 'doc_text',
  'chevron.up.chevron.down': 'chevron_up_chevron_down',
  // Additional Framework7 mappings
  'face.smiling': 'smiley',
  'line.3.horizontal': 'line_horizontal_3',
  'line.3.horizontal.decrease': 'line_horizontal_3_decrease',
  'speaker.wave.3': 'speaker_3',
  pawprint: 'paw',
  'bubble.left.and.bubble.right': 'bubble_left_bubble_right',
  // SF names whose Framework7 file is named differently
  'dot.radiowaves.left.and.right': 'dot_radiowaves_left_right',
  'arrow.uturn.backward': 'arrow_uturn_left',
  'arrow.uturn.forward': 'arrow_uturn_right',
  'line.3.horizontal.decrease.circle': 'line_horizontal_3_decrease_circle',
  'questionmark.circle': 'question_circle',
  'square.and.arrow.down': 'square_arrow_down',
  mappin: 'map_pin',
  'mappin.and.ellipse': 'map_pin_ellipse',
  display: 'desktopcomputer',
  'dollarsign.circle': 'money_dollar_circle',
}
const names =
  `pin pin.slash star house bell person calendar clock trash heart folder pencil checkmark checkmark.circle xmark xmark.circle info.circle ellipsis ellipsis.circle plus minus chevron.left chevron.right chevron.up chevron.down circle chart.bar photo envelope bookmark timer stopwatch book doc.text rectangle.stack slider.horizontal.3 square.and.arrow.up square.and.pencil gearshape magnifyingglass sidebar.left arrowshape.turn.up.left chevron.up.chevron.down questionmark.square play pause arrow.clockwise bolt flag tray cart list.bullet person.crop.circle dot.radiowaves.left.right square.grid.2x2 battery.100 camera car device.phone.portrait globe keyboard lock moon hand.raised sparkles textformat hourglass arrow.up arrow.down arrow.down.circle stop doc.on.doc face.smiling bell.slash envelope.open envelope.badge hand.thumbsup hand.thumbsdown line.3.horizontal line.3.horizontal.decrease photo.on.rectangle square.stack forward backward shuffle repeat repeat.1 music.note music.note.list music.mic music.house speaker speaker.wave.3 quote.bubble tv.music.note waveform play.circle play.rectangle plus.circle checkmark.square heart.slash flag.slash person.2 arrowshape.turn.up.right bubble.left.and.bubble.right text.insert text.append text.badge.plus viewfinder sun.max gift airplane pawprint briefcase list.number dot.radiowaves.left.and.right exclamationmark.triangle arrow.right arrow.left square.and.arrow.down gear link arrow.counterclockwise arrow.uturn.backward arrow.uturn.forward archivebox line.3.horizontal.decrease.circle questionmark.circle arrow.up.arrow.down tag paperplane flame location doc mappin mappin.and.ellipse arrow.up.right at drop headphones bed.double pause.circle display dollarsign.circle checkmark.seal tray.full person.badge.plus folder.badge.plus arrow.2.squarepath`.split(
    ' ',
  )
const catalogue = {}
const calibration = JSON.parse(
  await readFile(resolve(root, 'src/symbols/optical-calibration.json'), 'utf8'),
).scales
async function parseSvg(file, provenance) {
  const svg = await readFile(file, 'utf8')
  if (!/viewBox="0 0 56 56"/.test(svg)) throw Error(`Expected Framework7 56-unit viewBox: ${file}`)
  const paths = [...svg.matchAll(/<path\b([^>]*?)\/?\s*>/g)].map(([, attributes]) => {
    const d = attributes.match(/\bd="([^"]+)"/)?.[1]
    if (!d || /\b(style|stroke|on\w+)\s*=/.test(attributes))
      throw Error(`Unsupported path: ${file}`)
    const transform = attributes.match(/transform="([^"]+)"/)?.[1]
    const fillRule = attributes.match(/fill-rule="(evenodd|nonzero)"/)?.[1]
    const layer = attributes.match(/data-layer="(primary|secondary|tertiary)"/)?.[1]
    return {
      d,
      ...(transform ? { transform } : {}),
      ...(fillRule ? { fillRule } : {}),
      ...(layer ? { layer } : {}),
    }
  })
  const remainder = svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[^>]*>|<\/svg>|<path\b[^>]*\/?\s*>|<\/path>/g, '')
    .trim()
  if (!paths.length || remainder || /<(?:script|image|use|style)\b|\bon\w+\s*=|href\s*=/.test(svg))
    throw Error(`Path-only SVG required: ${file}`)
  return { paths, provenance }
}
const available = new Set(await readdir(source))
for (const name of names) {
  const fileName = mappings[name] ?? name.replaceAll('.', '_')
  if (!available.has(`${fileName}.svg`))
    throw Error(`Missing Framework7 mapping: ${name} (${fileName})`)
  for (const filled of [false, true]) {
    const candidate = `${fileName}${filled ? '_fill' : ''}.svg`
    if (!available.has(candidate)) continue
    catalogue[name + (filled ? '.fill' : '')] = await parseSvg(
      resolve(source, candidate),
      `Framework7 Icons 5.0.5 (MIT): ${candidate}`,
    )
  }
}
for (const name of ['dumbbell', 'figure.run', 'leaf', 'clock.arrow.circlepath', 'receipt']) {
  catalogue[name] = { ...catalogue['questionmark.square'], placeholder: true }
}
const customDirectory = resolve(root, 'src/symbols/glyphs')
const approvals = JSON.parse(await readFile(resolve(customDirectory, 'approved.json'), 'utf8'))
await mkdir(customDirectory, { recursive: true })
for (const file of (await readdir(customDirectory)).filter(file => file.endsWith('.svg')).sort()) {
  const name = file.slice(0, -4)
  const provenance = await readFile(resolve(customDirectory, `${name}.md`), 'utf8')
  const svg = await readFile(resolve(customDirectory, file))
  const hash = createHash('sha256').update(svg).digest('hex')
  if (approvals[file] && approvals[file] !== hash) throw Error(`Approval hash changed: ${file}`)
  catalogue[name] =
    approvals[file] === hash
      ? await parseSvg(resolve(customDirectory, file), provenance.trim())
      : { ...catalogue['questionmark.square'], placeholder: true }
}
for (const [name, opticalSize] of Object.entries(calibration)) {
  if (catalogue[name] && !catalogue[name].placeholder) catalogue[name].opticalSize = opticalSize
}
const normalization = JSON.parse(
  await readFile(resolve(root, 'src/symbols/ink-normalization.json'), 'utf8'),
)
for (const [name, metrics] of Object.entries(normalization)) {
  if (!catalogue[name] || catalogue[name].placeholder) throw Error(`Invalid normalization: ${name}`)
  for (const geometry of Object.values(metrics)) {
    if (
      !Object.values(geometry).every(Number.isFinite) ||
      geometry.scaleX <= 0 ||
      geometry.scaleY <= 0
    ) {
      throw Error(`Invalid ink geometry: ${name}`)
    }
  }
  catalogue[name].normalization = metrics
}
// Check the completed catalogue so renamed upstream aliases and custom drawings
// cannot restore the excluded mark through a different generator input path.
for (const [name, glyph] of Object.entries(catalogue)) {
  if (isExcludedSymbolName(name) || /\blogo_apple(?:_fill)?\.svg\b/.test(glyph.provenance))
    throw Error(`Excluded Apple logo: ${name}`)
}
await writeFile(
  resolve(root, 'src/symbols/catalogue.ts'),
  `// Generated by scripts/generate-symbols.mjs. Framework7 Icons 5.0.5, MIT.\nimport type { SymbolGlyph } from './types.ts'\n/** The core symbol name contract used by public app declarations. */\nexport type CoreSymbolName = ${Object.keys(
    catalogue,
  )
    .map(name => JSON.stringify(name))
    .join(
      ' | ',
    )}\nexport const coreSymbols: Readonly<Record<CoreSymbolName, SymbolGlyph>> = ${JSON.stringify(catalogue, null, 2)}\n`,
)
console.log(
  `Generated ${Object.keys(catalogue).length} glyphs, including ${Object.values(catalogue).filter(glyph => glyph.placeholder).length} marked placeholders.`,
)
