import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
async function compile(source) {
  const directory = await mkdtemp(resolve('node_modules/.tmp/api-types-'))
  try {
    const file = resolve(directory, 'app.tsx')
    await writeFile(
      file,
      `import { defineApp, defineRoutes, defineNavigation, route, param, runApp, useNavigation, NavigationStack, TabView, Tab, NavigationLink, Glass, GlassEffect, ScrollView, SensoryButton, defineNamespace, SymbolImage, type GlassShape, type VerticalScrollGeometry, type Searchable, Button, List, Sheet, ContextMenu, Menu, LabeledContent, type Action, type RouteParameters } from ${JSON.stringify(resolve('dist/index.js'))};\n` +
        `import { GridItem, LazyVGrid, Animation, withAnimation } from ${JSON.stringify(resolve('dist/index.js'))};\n` +
        source,
    )
    const config = resolve(directory, 'tsconfig.json')
    await writeFile(
      config,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: 'ES2023',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
          skipLibCheck: true,
        },
        files: [file],
      }),
    )
    const executable = resolve(
      'node_modules/.bin',
      process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
    )
    const result = spawnSync(executable, ['-p', config, '--pretty', 'false'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stdout + result.stderr)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
test('unregistered navigation fails closed; implementation details are unavailable', async () =>
  compile(`
const animationResult: number = withAnimation(Animation.snappy, () => 42);
const defaultAnimationResult: string = withAnimation(() => 'selected');
// @ts-expect-error Solver parameters are not part of the stable Animation type.
Animation.default.omega;
// @ts-expect-error Solver parameters are not part of the stable Animation type.
Animation.default.zeta;
// @ts-expect-error Handwritten grid tracks bypass validation and are not accepted.
const forgedTrack = <LazyVGrid columns={[{ kind: 'fixed', size: -10 }]} />;
const track = <LazyVGrid columns={[GridItem.fixed(100)]} />;
// @ts-expect-error A controlled search must provide its update callback.
const fixedSearch: Searchable = { text: '', onTextChange() {}, isPresented: false };
// @ts-expect-error A controlled detent must provide its update callback.
const fixedSheet = <Sheet isPresented={true} onPresentedChange={() => {}} title="Editor" selection="large">Editor</Sheet>;
const uncontrolledSearch: Searchable = { text: '', onTextChange() {}, onPresentedChange() {} };
// @ts-expect-error Unsupported horizontal positioning must not compile.
const horizontalPosition = <ScrollView id="albums" axis="horizontal" scrollPosition={{ id: 'last', onChange() {} }} />;
// @ts-expect-error Unsupported horizontal geometry must not compile.
const horizontalGeometry = <ScrollView id="albums" axis="horizontal" onScrollGeometryChange={() => {}} />;
// @ts-expect-error Renderer-specific sheet shape is not an app API.
const sheetShape: GlassShape = { kind: 'roundedRectangle', cornerRadius: 12, bottomCornerRadius: 0 };
// @ts-expect-error Inert sensory feedback is not accepted.
const unsupportedFeedback = <SensoryButton sensoryFeedback="success" onPress={() => {}}>Save</SensoryButton>;
// @ts-expect-error CSS color tint and normalized RGBA tint are distinct contracts.
const cssTint = Glass.regular.tintRGBA('blue');
// @ts-expect-error Removed no-op bounce option.
const bounce = <ScrollView id="feed" bounce="native" />;
const identity = <GlassEffect id="actions" glassEffectID="morph" in={defineNamespace()} />;
const symbol = <SymbolImage name="star" weight="ultraLight" />;
const builtinSymbol = Symbol.for('still-the-language-builtin');
function App() {
 const nav = useNavigation();
 // @ts-expect-error No registered routes.
 nav.push('typo');
 // @ts-expect-error No registered routes.
 const link = <NavigationLink to="typo">Go</NavigationLink>;
 // @ts-expect-error No registered primary structure.
 const stack = <NavigationStack />;
 // @ts-expect-error No registered tabs.
 const tabs = <TabView selection="typo" />;
 // @ts-expect-error Presentation materials are internal.
 Glass.sheet;
 // @ts-expect-error Serialized material is internal.
 Glass.regular.material;
 // @ts-expect-error Press-state callbacks are internal to Button.
 const button = <Button onPress={() => {}} onPressStateChange={() => {}}>Go</Button>;
 // @ts-expect-error Screen owns titles.
 const list = <List id="list" navigationTitle="Title" />;
 // @ts-expect-error The framework owns restored sheet entrance.
 const sheet = <Sheet title="Editor" isPresented onPresentedChange={() => {}} restoreOnMount>Text</Sheet>;
 return null;
}`))
test('schema-first props compile without a route/component cycle and tabs come from the declaration', async () =>
  compile(`
const schema = { id: param.string(), page: param.int().optional() };
function Detail({ id, page }: RouteParameters<typeof schema>) { return <div>{id} {page}</div>; }
const routes = defineRoutes({ home: route(() => null), detail: route(Detail, { params: schema, title: ({ id }) => id }) });
const structure = defineNavigation(routes, { tabs: [{ id: 'home', label: 'Home', icon: null, root: 'home' }] });
// @ts-expect-error Default tab must name a declared ID.
defineNavigation(routes, { tabs: [{ id: 'home', label: 'Home', icon: null, root: 'home' }], defaultTab: 'typo' });
// @ts-expect-error Unknown root.
defineNavigation(routes, { stack: { root: 'missing' } });
// @ts-expect-error Detail requires params.
defineNavigation(routes, { stack: { root: 'detail' } });
// @ts-expect-error Unknown selected tab.
const bad = <TabView<typeof structure> selection="missing" />;
// @ts-expect-error Unknown tab identity.
const badTab = <Tab<typeof structure> id="missing" />;
const good = <NavigationLink<typeof routes> to="detail" params={{ id: 'one' }}>One</NavigationLink>;
const app = defineApp({ id: 'test', name: 'Test', icons: { source: '/icon.png' } });
runApp({ app, routes, navigation: structure, content: () => <TabView<typeof structure> /> });
`))

test('menus and all public row controls share the Action contract', async () =>
  compile(`
const actions: readonly Action[] = [{ id: 'delete', label: 'Delete', role: 'destructive', onPress() {} }, { section: [{ id: 'more', label: 'More', submenu: [{ id: 'pin', label: 'Pin', onPress() {} }] }] }];
const routes = defineRoutes({ home: route(() => null) });
const interactions = { swipeActions: [{ edge: 'leading' as const, actions, allowsFullSwipe: false }, { edge: 'trailing' as const, actions, allowsFullSwipe: false }], contextMenu: { actions, preview: <p>Preview</p> } };
const rows = <List id="rows"><Button {...interactions} onPress={() => {}}>Go</Button><NavigationLink<typeof routes> {...interactions} to="home">Home</NavigationLink><LabeledContent {...interactions} label="Value" value="42" /></List>;
const menu = <Menu label="Actions" actions={actions} />;
const context = <ContextMenu actions={actions}><p>Card</p></ContextMenu>;
// @ts-expect-error Legacy engine menu shape is not the public Action contract.
const legacy = <Menu label="Actions" actions={[{ id: 'delete', label: 'Delete', destructive: true, onPress() {} }]} />;
`))
