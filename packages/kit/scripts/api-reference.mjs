import { SymbolFlags } from 'typescript/unstable/sync'
import { SyntaxKind, getLeadingCommentRanges } from 'typescript/unstable/ast'
import { openDeclarationProject } from './native-api.mjs'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicDeclarationGraph } from './api-graph.mjs'
import {
  apiBehaviors,
  frameworkExtensions,
  unavailableExports,
  unavailableProperties,
} from './api-behaviors.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cell = value => value.replaceAll('|', '\\|').replaceAll('\n', ' ')
const identity = (module, name) => `${module}:${name}`

// The JSDoc block nearest a declaration. A `const` export documents its variable
// statement, not the declaration inside it.
function leadingDocumentation(declaration) {
  const node =
    declaration.kind === SyntaxKind.VariableDeclaration
      ? (declaration.parent?.parent ?? declaration)
      : declaration
  const file = node.getSourceFile()
  const block = (getLeadingCommentRanges(file.text, node.pos) ?? [])
    .map(range => file.text.slice(range.pos, range.end))
    .findLast(comment => comment.startsWith('/**'))
  return block?.match(/^\/\*\*([\s\S]*?)\*\/$/)?.[1]
}

async function sourceFingerprint(root) {
  const hash = createHash('sha256')
  const sourceRoot = resolve(root, 'src')
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT' && directory === sourceRoot) return []
      throw error
    })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (/\.(?:ts|tsx|css)$/.test(path) && !/\.test\.tsx?$/.test(path)) {
        hash.update(relative(sourceRoot, path))
        hash.update('\0')
        hash.update(await readFile(path))
        hash.update('\0')
      }
    }
  }
  await visit(sourceRoot)
  return hash.digest('hex')
}

export async function referenceInventory(root = packageRoot) {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  const inventory = []
  const hashes = []
  for (const [path, config] of Object.entries(pkg.exports)) {
    if (!config.types || path.endsWith('.css')) continue
    const entry = resolve(root, config.types)
    const module = path === '.' ? pkg.name : `${pkg.name}/${path.slice(2)}`
    const project = openDeclarationProject(entry)
    try {
      const { program, checker } = project
      const file = program.getSourceFile(entry)
      if (!file) throw new Error(`Build before generating the reference: ${entry}`)
      const graph = publicDeclarationGraph(project, entry).replaceAll(`${root}/`, '')
      hashes.push(`${module}:${createHash('sha256').update(graph).digest('hex')}`)
      for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(file))) {
        const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
        const declaration = target.declarations?.[0]?.resolve()
        if (!declaration) throw new Error(`Missing declaration for ${module}:${symbol.name}`)
        const value = !!(target.flags & SymbolFlags.Value)
        if (module === '@satinhq/kit' && unavailableProperties[symbol.name]) {
          const properties = checker
            .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(target))
            .map(property => property.name)
          for (const property of unavailableProperties[symbol.name]) {
            if (properties.includes(property))
              throw new Error(
                `Review unavailable concept metadata: ${symbol.name}.${property} now exists`,
              )
          }
        }
        const summary = leadingDocumentation(declaration)
          ?.split('\n')
          .map(line => line.replace(/^\s*\* ?/, '').trim())
          .join('\n')
          .split(/(?:^|\n)@/)[0]
          .replace(/\s+/g, ' ')
          .trim()
        inventory.push({
          module,
          summary: summary || undefined,
          name: symbol.name,
          kind: value ? 'Value' : 'Type',
          declaration: relative(resolve(root, 'dist/docs'), declaration.getSourceFile().fileName),
        })
      }
    } finally {
      project.close()
    }
  }
  inventory.sort((left, right) =>
    identity(left.module, left.name).localeCompare(identity(right.module, right.name)),
  )
  return { inventory, hashes, sourceHash: await sourceFingerprint(root) }
}

export function renderReference(
  { inventory, hashes, sourceHash },
  concepts = [...apiBehaviors, ...frameworkExtensions],
) {
  const names = new Set(inventory.map(entry => identity(entry.module, entry.name)))
  for (const name of unavailableExports) {
    if (names.has(identity('@satinhq/kit', name)))
      throw new Error(`Review unavailable concept metadata: ${name} now exists`)
  }
  const seen = new Set()
  const mappedExports = new Map()
  for (const concept of concepts) {
    if (seen.has(concept.concept)) throw new Error(`Duplicate concept: ${concept.concept}`)
    seen.add(concept.concept)
    if (!concept.behavior || !concept.limitations)
      throw new Error(`Missing behavior or limitation: ${concept.concept}`)
    for (const name of concept.exports) {
      const key = identity('@satinhq/kit', name)
      if (!names.has(key))
        throw new Error(`Concept ${concept.concept} maps unavailable export ${key}`)
      const mappings = mappedExports.get(key) ?? []
      mappings.push(concept.concept)
      mappedExports.set(key, mappings)
    }
  }
  const unreviewed = inventory.filter(
    entry =>
      entry.module === '@satinhq/kit' &&
      entry.kind === 'Value' &&
      !mappedExports.has(identity(entry.module, entry.name)),
  )
  if (unreviewed.length)
    throw new Error(
      `Review new public API behavior and unavailable descriptions: ${unreviewed.map(entry => entry.name).join(', ')}`,
    )
  const missing = inventory.filter(entry => !mappedExports.has(identity(entry.module, entry.name)))
  // Plain words people search for. Never another framework's API names.
  const searchTerms = {
    Alert: 'alert; dialog; popup',
    AsyncImage: 'remote image; image URL',
    Button: 'button; tap',
    ColorPicker: 'color picker; color well',
    ConfirmationDialog: 'action sheet; delete confirmation',
    ContentMargins: 'content inset',
    ContentUnavailableView: 'empty state; no results',
    ContextMenu: 'long press menu',
    DatePicker: 'date picker; time picker; calendar',
    DefaultToolbarItem: 'bottom search bar',
    defineApp: 'app manifest; app config',
    defineDatabase: 'local database; offline storage; IndexedDB',
    defineRoutes: 'router; routes; deep links',
    defineWebAuthentication: 'OAuth; sign in; PKCE',
    Divider: 'separator; hairline',
    EditButton: 'edit mode; Edit and Done',
    FileImporter: 'file upload; document picker',
    ForEach: 'swipe to delete; reorder rows',
    Form: 'settings screen; form',
    FullScreenCover: 'full screen presentation; modal',
    GeometryReader: 'measure size',
    GlassEffect: 'glass; refraction',
    GlassEffectContainer: 'glass morph; glass group',
    HStack: 'row; horizontal layout',
    IgnoresSafeArea: 'full bleed; edge to edge',
    Image: 'image; picture',
    LabeledContent: 'value row; detail row',
    LazyVGrid: 'grid; columns',
    LazyHGrid: 'horizontal grid',
    Link: 'link; open URL',
    List: 'list; rows; pull to refresh; swipe actions',
    ListRow: 'swipe actions; row insets',
    MatchedTransitionSource: 'zoom transition',
    Menu: 'dropdown menu; more button',
    moving: 'reorder rows',
    NavigationLink: 'push; disclosure row',
    NavigationSplitView: 'sidebar and detail; split view',
    NavigationStack: 'navigation stack; push; back button',
    NavigationTransition: 'zoom transition',
    NotificationPermissionExplainer: 'notification permission prompt',
    PasteButton: 'paste; clipboard',
    PhotosPicker: 'photo picker; image upload',
    Picker: 'dropdown; select; segmented control',
    preferredColorScheme: 'dark mode; light mode',
    ProgressView: 'spinner; activity indicator; progress bar; loading',
    removing: 'delete rows',
    RowIcon: 'settings icon',
    runApp: 'mount app; entry point',
    SafeAreaBar: 'bottom bar; top bar',
    SafeAreaInset: 'safe area; accessory; composer bar',
    Screen: 'navigation bar; title; toolbar',
    ScrollView: 'scrolling; pull to refresh; scroll to',
    Searchable: 'search bar; search field',
    SecureField: 'password field',
    Selectable: 'text selection; copy text',
    SensoryButton: 'haptics; vibration',
    ShareLink: 'share sheet; share button',
    Sheet: 'sheet; modal presentation; bottom sheet',
    Slider: 'slider; range input',
    Spacer: 'flexible space',
    Stepper: 'stepper; plus and minus buttons',
    SwipeActions: 'swipe actions; swipe to delete',
    SymbolImage: 'icon; glyph',
    TabView: 'tab bar; tabs',
    Text: 'text; font; typography',
    TextEditor: 'multiline text; text area',
    TextField: 'text field; text input',
    Toggle: 'switch; checkbox',
    ToolbarItem: 'toolbar button; bar button',
    useAppStorage: 'persistent settings; preferences; local storage',
    useColorScheme: 'dark mode',
    useDismiss: 'close; go back',
    useFocusChain: 'next field; return key',
    useHorizontalSizeClass: 'iPad layout; responsive layout',
    useKeyboardMetrics: 'keyboard height',
    useMediaPlayer: 'audio player; music player',
    useNotifications: 'push notifications; badge',
    useOpenURL: 'open link; open URL',
    useQuery: 'live query',
    useReachability: 'offline; network status',
    useSafeAreaInsets: 'safe area insets; notch; home indicator',
    useScaledMetric: 'text size scaling',
    useScenePhase: 'foreground; background; app state',
    useSceneStorage: 'restorable screen state; draft',
    useTask: 'cancellable task; data loading',
    useUnsavedChanges: 'unsaved changes',
    ViewThatFits: 'responsive layout; fallback layout',
    VStack: 'column; vertical layout',
    WebView: 'iframe; embedded web page',
    withAnimation: 'animated state update',
    Zoomable: 'pinch to zoom',
    ZStack: 'layers; overlay',
  }
  // Said once per section instead of on every row.
  const moduleIntros = {
    '@satinhq/kit': 'Components, hooks and types for building the app.',
    '@satinhq/kit/diagnostics':
      'Readers for installation and appearance records, for an optional diagnostics screen.',
    '@satinhq/kit/install':
      'Building blocks for a custom install page. They work only on the install page that `satinApp` builds.',
    '@satinhq/kit/internal':
      'Framework internals for Satin tooling and tests. App code must not import them; app lint rejects this module, and it changes without notice.',
    '@satinhq/kit/internal/vite':
      'Lower-level build tools for Satin tooling and tests. Apps use `satinApp` from `@satinhq/kit/vite`.',
    '@satinhq/kit/server':
      'Node helpers for serving a built app. Keep them out of the browser bundle.',
    '@satinhq/kit/testing':
      'Helpers for app tests. They do not prove real touches or notification delivery.',
    '@satinhq/kit/unstable': 'Experimental API. Its contract may change between beta releases.',
    '@satinhq/kit/vite':
      'The Vite plugin that builds the app, its install page and its service worker.',
  }
  const description = entry => {
    const reviews = concepts.filter(
      concept => concept.exports.includes(entry.name) && entry.module === '@satinhq/kit',
    )
    if (reviews.length)
      return {
        behavior: entry.summary ?? [...new Set(reviews.map(review => review.behavior))].join(' '),
        limits: [...new Set(reviews.map(review => review.limitations))].join(' '),
      }
    // Types and integration exports have no reviewed limits. An empty cell means there is
    // nothing to add beyond the declaration and the section note.
    return {
      behavior:
        entry.summary ??
        (entry.kind === 'Type' && entry.name.endsWith('Props')
          ? `Props for \`${entry.name.slice(0, -5)}\`.`
          : ''),
      limits: '',
    }
  }
  const modules = [...new Set(inventory.map(entry => entry.module))]
  const unavailable = concepts.filter(concept => !concept.exports.length)
  return [
    '# Satin API reference',
    '',
    'Search by Satin export name. Each entry describes its behavior and limits and links to its exact declaration. Plain-language search terms are included where they help find a control or capability.',
    '',
    'Generated from package declarations and reviewed behavior metadata. Run `pnpm --filter @satinhq/kit api:write` after building. Signature, export and source changes invalidate this reference; changes to behavior descriptions require review.',
    '',
    `Coverage: ${inventory.length} named exports across ${hashes.length} declaration entry points. ${mappedExports.size} exports have reviewed behavior metadata. ${missing.length} type and integration declarations are identified separately in the behavior review inventory. CSS is a stylesheet, not a named export.`,
    '',
    'An API description establishes the supported contract. It does not certify pixels, motion, touch or installed-app lifecycle behavior. Experimental entry points remain experimental. An empty Limits cell means there are no limits beyond what the declaration states.',
    '',
    ...modules.flatMap(module => [
      `## ${module === '@satinhq/kit' ? 'Core API' : module.replace('@satinhq/kit/', '').replaceAll('/', ' ') + ' API'}`,
      '',
      `Module: \`${module}\``,
      '',
      ...(moduleIntros[module] ? [moduleIntros[module], ''] : []),
      '| Satin export | Behavior | Limits | Also known as |',
      '| --- | --- | --- | --- |',
      ...inventory
        .filter(entry => entry.module === module)
        .map(entry => {
          const review = description(entry)
          return `| [\`${entry.name}\`](${entry.declaration}) | ${cell(review.behavior)} | ${cell(review.limits)} | ${searchTerms[entry.name] ?? ''} |`
        }),
      '',
    ]),
    '## Unsupported capabilities',
    '',
    'These capabilities have no public export. The listed alternatives describe supported compositions, not additional props or controls.',
    '',
    '| Capability | Supported alternative | Limits |',
    '| --- | --- | --- |',
    ...unavailable.map(
      concept =>
        `| ${cell(concept.concept)} | ${cell(concept.behavior)} | ${cell(concept.limitations)} |`,
    ),
    '',
    'See [application recipes](app-recipes.md), [local data](data.md), [geometry tokens](tokens.md) and [messaging scroll](messaging-scroll.md) for supported compositions.',
    '',
    '## Entry draft and editor visibility',
    '',
    'Render this component within a retained navigation screen. The draft checkpoints independently; the editor starts closed after relaunch.',
    '',
    '```tsx',
    "import { useState } from 'react'",
    "import { Button, Sheet, TextField, useSceneStorage } from '@satinhq/kit'",
    '',
    'export function DraftEditor() {',
    "  const [draft, setDraft] = useSceneStorage('draft', '')",
    '  const [open, setOpen] = useState(false)',
    '  return (',
    '    <>',
    '      <Button onPress={() => setOpen(true)}>Edit draft</Button>',
    '      <Sheet title="Draft" isPresented={open} onPresentedChange={setOpen}>',
    '        <TextField label="Draft" value={draft} onChange={setDraft} />',
    '      </Sheet>',
    '    </>',
    '  )',
    '}',
    '```',
    '',
    '## Behavior review inventory',
    '',
    'The declarations below have no dedicated reviewed behavior metadata. Type-only declarations are compile-time contracts; integration exports should be used with their module documentation. Adding a stable root value requires a reviewed behavior and limitation before generation can pass.',
    '',
    ...missing.map(entry => `- \`${identity(entry.module, entry.name)}\` (${entry.kind})`),
    '',
    '## Declaration graph fingerprints',
    '',
    ...hashes.map(hash => `- \`${hash}\``),
    '',
    '## Framework source fingerprint',
    '',
    `SHA-256 of sorted TS/TSX/CSS source paths and bytes, excluding tests: ${sourceHash}`,
    '',
  ].join('\n')
}

export async function generateReference(write = false, root = packageRoot) {
  const content = renderReference(await referenceInventory(root))
  const snapshot = resolve(root, 'api/reference.md')
  if (write) {
    await mkdir(dirname(snapshot), { recursive: true })
    await writeFile(snapshot, content)
  } else if ((await readFile(snapshot, 'utf8').catch(() => '')) !== content) {
    throw new Error(
      'Satin API reference is stale. Build and run pnpm --filter @satinhq/kit api:write.',
    )
  }
  await mkdir(resolve(root, 'dist/docs'), { recursive: true })
  await writeFile(resolve(root, 'dist/docs/reference.md'), content)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateReference(process.argv.includes('--write'))
}
