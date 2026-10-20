# create-satin

Create a Vite + React app for the iPhone Home Screen runtime.

After the beta is published:

```sh
npm create satin@latest -- my-app --yes --name "My App" --id my-app
# or
pnpm create satin@latest my-app --yes --name "My App" --id my-app
```

Run `create-satin --help` for all flags, including launch colours and a local
Satin tarball override. The command copies a bundled template, refuses to
overwrite a nonempty directory, and leaves installation to you. It has no
runtime dependencies. Node 22.12+ on the 22.x line, or Node 24+, is required.

Quote destination paths containing spaces. The folder keeps its requested name;
the npm package name and default app ID use a lowercase name with other characters
replaced by hyphens and edge hyphens removed. An empty result uses `my-app`.
For example, `"My App #%?"` creates that folder with package name `my-app` and ID `my-app`.

`--icon` copies one square PNG source; the build derives the install icon sizes.
`--accent` writes `appearance.tint`; Satin applies the tint at runtime. Without it no tint is written and the app uses the system blue.
Launch colours write the light/dark `appearance` backgrounds. If a bundled
template cannot apply a flag, the command fails before creating the destination.

The template has Home and Settings tabs with independent navigation stacks, a
saved-item detail route and a Your data route that exports JSON. It uses useQuery
and useRecord for local data. It does not import data. Add validation, a preview,
backup and confirmation before building an import flow.

The app includes README.md, AGENTS.md, IOS-DESIGN.md and GETTING-STARTED.md.
The packaged API reference documents each export and its limitations.

Maintainers edit `templates/basic/` in the repository. `npm run build` copies it
into this package before packing, so the published CLI works outside the repo.

Set `SATIN_DOCS_BASE_URL` when building or packing the CLI to choose where the
generated `GETTING-STARTED.md` links resolve. It is an HTTP(S) repository-root
URL containing both `docs/` and `packages/`; include the release revision for
versioned source documentation. For example:

```sh
SATIN_DOCS_BASE_URL=https://docs.example.com/satin/v0.1.0-beta.0/ npm run build
```

The default uses the configured source repository at its default revision. Before publication,
set the docs base URL to the chosen public repository and release revision.
The build normalizes the trailing slash and rejects credentials, query strings,
fragments and non-HTTP schemes. External service links and page anchors keep
their original targets. This is a packaging option; app creators do not need to
set it. Packaging checks every shipped template Markdown file, the generated
guide and both package READMEs for private project-status language.

## Upgrade an app

In the existing app directory, run `npx create-satin@latest upgrade --dry-run`,
then `npx create-satin@latest upgrade`. Use an explicit generator version to choose
a target release. The command pins existing Satin dependencies, refreshes only
byte-identical generated guidance and tooling files, and reports modified files for
manual review. App source, assets and entry HTML remain intact. It prints
the release notes between the app's exact current kit pin and the target version.
Run your package manager install afterwards to update the lockfile, then validate
your app. No installer runs automatically.
