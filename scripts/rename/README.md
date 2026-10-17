# Public identity

`names.json` owns the brand, PascalCase identifier prefix, lowercase slug, domain,
repository and npm coordinates. `applied.json` records the last completed
migration; it is generated state, not a second set of choices.

Edit the desired values in `names.json`, then run:

```sh
node scripts/rename/apply.mjs
```

Change `packageProfile` between `scoped` and `unscoped` to select a package family.
The profile defines the framework, lint and push package coordinates. The map
separately defines the create package, workspace scope, version and dist-tag.
Keep `createPackage` and `slug` consistent with the intended `npm create` command.

To include staged owner-app patches and launch copy, add these optional arguments:

```sh
node scripts/rename/apply.mjs --extra-file /path/to/owner-apps.patch --extra-directory /path/to/launch-copy
```

The script rewrites identifiers, imports, CSS/data attributes, diagnostics,
public build options, source links, manifests and the lockfile. It renames branded
source basenames and skill directories. It preserves other file contents and
refuses filename collisions. Run it in a checkout without unrelated identity
edits. Rebuild and regenerate API reports afterward; ignored build output and
historical capture receipts are not rewritten. Existing capture hashes must still
match, or the affected example must use the site's explicit live-only mode.

The rename adds no legacy API or CSS aliases. The unbranded stable API, including
`defineApp` and `runApp`, retains its names. The rendering engine keeps its own
name from the map.

Source directories (`packages/kit`, `packages/lint`,
`packages/push`, `packages/create-satin`) are configured in `names.json` so checkout tools
can locate them independently of npm names. `SATIN_SCRATCH_ROOT` and `SATIN_CONSUMER_EVIDENCE` select temporary test
directories outside the checkout. The public build switch is `SATIN_STRICT_GLASS`. Historical specs, design notes, build-plan
history, evidence and native reference projects retain their original names.

Software validation uses directory filters so a name change cannot silently skip a package.

Run `pnpm --filter ./packages/kit build`, then `pnpm --filter ./packages/kit api:write` and `node scripts/check-skills.mjs`.
Run the workspace typecheck, lint, build, tests and packed consumer proof after changing identity.
