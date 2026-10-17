# @satinhq/lint

Fidelity lint preset for Satin apps. Extend it from an app's `.oxlintrc.json`:

```json
{ "extends": ["../../packages/lint/oxlint.json"] }
```

The preset exists to make Satin's invariants hard to violate. It bans browser-history routers and any `pushState` or `replaceState` property access in app code. The framework package does not extend the preset, so its future URL-projection module can own the single allowed `replaceState` call.

Oxlint cannot inspect CSS or determine whether a style expression contains viewport geometry. Wire the companion check into each app's lint script:

```json
{
  "scripts": {
    "lint": "oxlint && node ../../packages/lint/scripts/check-fidelity.mjs src"
  }
}
```

The companion check uses the TypeScript compiler AST for `.js`, `.jsx`, `.mjs`, `.ts`, and `.tsx`. It resolves local style/props members and spreads, React `createElement`/JSX-runtime aliases and simple wrappers, runtime imports and re-exports, known CSS-in-JS tags, and direct DOM style mutations. A tokenized CSS declaration parser covers `.css` without treating comments or strings as code.

It rejects raw `vh` units, `env(safe-area-inset-*)`, raw `overflow: auto|scroll`, inline `overflow`/`overflowX`/`overflowY` scrolling, consumer-owned `-webkit-overflow-scrolling`, raw `<button>` controls, `onClick` activation, direct `navigator.serviceWorker.register(...)` calls, direct runtime imports from liquid-glass or OpenGlass package families, and full-width bottom-pinned geometry that omits `--satin-inset-bottom`. App scrolling must come from `ScrollView`; app activation must come from `Button` and `onPress`; service-worker registration must come from `runApp`; persistent glass chrome must come from Satin's `GlassEffect` and `TabView`. Framework CSS is outside the app lint target and owns the actual native overflow, pointer, service-worker update, and sibling scene/chrome policies. The dev runtime assertion independently scans computed layout so dynamic styles and nested raw scrollers cannot hide behind a declared ancestor.

Static expression evaluation has a shared per-file work budget, including string combinations and object-spread branches. If the budget is exhausted, the CLI reports `static-evaluation-budget-exceeded` with “analysis incomplete” and exits 2. This is an analysis error, not a fidelity rule or a clean result; simplify the combinatorial expression before relying on the check. Fidelity violations continue to exit 1.

The machine-readable manifest is exported without enabling any unsafe autofixes:

```js
import { ruleManifest } from '@satinhq/lint/rule-manifest'
```

Run `pnpm --filter @satinhq/lint test` for the rule and CLI suite.

`no-raw-persistent-storage` flags direct app access to `localStorage` and `indexedDB`; use `defineDatabase` for durable app records. A legacy import bridge can opt out with a source-file comment `// satin-data-allow-raw-storage: <reason>`. Keep that file small because the comment exempts the whole file. Session-only UI state is outside this rule.

<!-- measured-reference -->
For an entry point using `defineApp` / `satinApp`, include its HTML in the checker
command: `check-fidelity src index.html`. `no-handwritten-app-head` reserves the
manifest, touch icon, viewport, appearance metadata and title for the generated
head. Comments are ignored; attribute order, casing and quoting do not bypass it.
Only pass definition-owned HTML entry points to this rule.
<!-- End measured-reference -->

measured-reference adds `no-page-zoom` for CSS/inline `zoom` and `touch-action: pinch-zoom`.
Use the package's `Zoomable` role for component magnification. Startup-image tags
are covered by `no-handwritten-app-head`, alongside viewport and manifest policy.

`no-direct-react-root` reserves the initial commit for `mountSatin`. Runtime imports, re-exports and literal dynamic imports/requires of `react-dom/client` are rejected; type-only imports remain allowed.

`no-custom-linear-easing` rejects custom `linear(...)` curves in CSS animation
and transition declarations, inline timing styles, and statically resolved
`animate` / `updateTiming` options. Use Satin motion or explicit property
keyframes with ordinary `linear` easing. Dynamically constructed options are
outside this static check; installed busy-thread recordings verify the runtime.

`no-raw-text-input` rejects raw JSX and React factory `input`/`textarea` controls.
Use `TextField`, `SecureField`, or `TextEditor`. For an intentional native control
experiment, put a nonempty reason directly on that control, for example
`data-satin-native-input="Date picker capability probe"`. This escape does not
waive installed-PWA acceptance or the 16px minimum. `no-small-input-font` checks
literal pixel sizes on input/textarea CSS selectors and field JSX inline styles.
Computed, inherited, variable and dynamically generated sizes still require the
runtime `input-font-size` assertion and installed focus recordings.

## App contract checks

The template `AGENTS.md` maps its hard rules to the rule manifest. The checker includes
`no-browser-history` for browser history mutation/traversal, `no-app-reload` for
location reloads, `no-global-touch-listener` for document/window touch listeners,
and `no-global-selection-reset` for root/universal CSS selection declarations.
History/reload checks resolve simple aliases, destructuring and literal computed
properties and exclude shadowed local objects. Dynamic inter-module calls and
computed policies still need review; this checker is not a sandbox.

Intent cannot be linted: explain permission value, keep credentials server-side,
choose meaningful destinations, validate notification routes, preserve measured
motion, check icon licenses and record installed fidelity. The generated app
ships build/typecheck scripts. The lint checker is workspace-only and is not
installed by the starter. From a framework checkout, run it against the app
source, CSS and HTML; no standalone registry installation is available.

`no-hidden-focus-heading` rejects JSX headings with a `tabIndex` and a static
`hidden`, `aria-hidden={true}`, `sr-only` or `visually-hidden` declaration. Focus
must target a visible title or control with a real cursor frame. Dynamic CSS,
clipping and viewport visibility require the runtime geometry check and installed
VoiceOver acceptance; this static rule does not prove visibility.

`no-fixed-document` rejects fixed positioning on html, body, :root and #root CSS selectors. Satin owns document layout so an installed translucent viewport can grow to the physical bottom. Component-local fixed overlays remain allowed. Dynamic selectors/styles still require the installed viewport and bottom-marker check.

`no-internal-import` rejects value, type, dynamic and re-export access to `@satinhq/kit/internal`. The framework lab uses the explicit `--allow-internal` checker option; ordinary apps do not.

`no-internal-import` follows locally resolvable require aliases (including object/destructuring aliases) and constant module strings. It does not resolve tsconfig/bundler path aliases, imports hidden behind other modules, computed runtime strings, reassignment/control-flow effects or arbitrary loader wrappers. Keep app package aliases pointed at public entry points; review configuration and wrapper modules separately. This syntax rule is an authoring guard, not a module-loading security boundary.

Content components such as `Text` and `VStack` are the recommended default vocabulary for new content, but are optional. Custom React/HTML remains supported. No rule requires adoption; existing geometry and semantic-role invariants apply equally to either style.


App source must not read `--satin-*` CSS variables. `no-private-css-variable`
checks CSS values, inline styles and JavaScript strings. Use `Overlay`,
`SafeAreaInset`, public component props, or `useSafeAreaInsets` instead. The
framework lab can explicitly use `--allow-internal`; production apps must not.

`no-global-focus-reset` rejects document-wide removal of focus outlines. Satin
owns non-keyboard outline suppression on the active element; hardware-keyboard
focus remains available. Element-scoped role policies are not global resets.
