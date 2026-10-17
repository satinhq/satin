# Code style

Satin's source is read by the owner and, after the public beta, by other developers. Write it
for them: clear names, small functions, comments that explain why. Prettier
(`.prettierrc.json`) and oxlint settle formatting and the mechanical rules; this page covers what
they can't. Each area that has been cleaned up adds its section here.

## Public API (`src/index.ts`, `src/public/`)

Use clear public names, explicit props and stability markers. The conventions below apply to the public API layer.

**Every export has JSDoc at its declaration.** The API report prints it and editors show it as
the tooltip, so it is what app authors read first. Describe what the Satin export does,
when to use it, who owns its state and the limitation a caller is most likely to miss.
Add a short `@example` when the signature does not make usage obvious. Keep measurements
and capture names in implementation comments beside the constants they justify.

**One module per API family in `public/`.** `Screen.tsx` holds `Screen`, `toolbar.tsx` the toolbar
components, `controls.tsx` the controls, and so on. Engine-facing glue that the facades share
(`screenChrome.tsx`, `context.ts`, `routeRegistry.ts`) lives beside them under a name that says
what it holds. When a module mixes public components with engine plumbing, split it.

**`index.ts` is grouped by area.** Add a new export to its group, once.

**Declarations read one at a time.** One `const` per statement, not comma-joined lists:

```ts
// Not this
const runtime = useAppContext(),
  owningTab = useContext(PrimaryTabContext)

// This
const runtime = useAppContext()
const owningTab = useContext(PrimaryTabContext)
```

**Types are imported by name.** Use `import type { X } from '…'` at the top, not inline
`import('…').X` types in a signature.

**No `any` where `unknown` works.** Internal code that only passes a value through types it
`unknown`.

**Import from the module that owns a name.** Re-export modules (`public/chrome.tsx`) exist only to
keep other directories' import paths stable during parallel work; new code imports from
`Screen.tsx`, `toolbar.tsx` or `screenChrome.tsx` directly.

**Regenerate the API report with every public change.** Build, then run
`pnpm --filter @satinhq/kit api:write`. The report, the Satin API reference and the template's API table
are generated; review their diff as part of the change. If you change `push/schema.ts`, also run
`node packages/push/scripts/sync-routes.mjs`, which copies it into the server package.

## Shared test fixtures and retired prototypes

Keep a controller fixture shared by navigation suites in `packages/kit/test/`.
The helper owns only its test state; production code must not import it. Keep
fixtures used by one suite local, including the deferred navigation controller.
When test bodies differ only by an input, use named parameter rows that retain
each regression case. The service-worker header tests retain both 7,000 and
9,000 ms delays and include the delay in the reported case name.

Delete an unused prototype with its tests after checking package, app, template
and script imports. Explain its retirement and any policy disagreement in the
phase notes. Mark old source pointers as historical, and preserve attribution,
licenses and measurements. Git history holds the retired implementation.
