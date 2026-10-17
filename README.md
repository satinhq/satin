# Satin

**Build the app you've always wanted.** Satin is a React framework for iPhone and iPad apps that install from Safari and feel native.

You write React. Satin gives you screens and navigation, lists and forms, sheets and menus, local data, and glass that refracts whatever is behind it. People install your app from a link: Share, then Add to Home Screen. It opens full screen, with its own icon and no browser around it.

> **Public beta for iOS 27.** APIs may change before 1.0. [Known issues](docs/known-issues.md) lists what iOS limits, what we're fixing and what we won't do.

Satin's APIs follow the declarative style people already use to build iPhone and iPad apps. If you've used SwiftUI, Jetpack Compose or Flutter, it will feel familiar.

## Start an app

You need Node 22.12 or later (or Node 24) and an iPhone or iPad on iOS 27, or the iOS Simulator.

```sh
npm create satin@beta my-app
cd my-app
npm install
npm run dev
```

Open the address it prints in Safari on your phone. The [Quick start](docs/learn/quick-start.md) takes it from there: your first screen, adding the app to the Home Screen, and deploying it.

## Use it with a coding agent

Add the Satin skills to your agent (Claude Code, Codex, Cursor and others that read Agent Skills):

```sh
npx skills add satinhq/satin
```

- `satin-best-practices`: how to build an app correctly, from navigation and data to updates and the checks to run before calling it done.
- `satin-design`: design defaults that make an app look and feel native. Your own design direction always comes first.

Add `--skill satin-design` to install one of them, or `-g` to install for every project. See [skills/](skills/README.md).

## Learn

- [Quick start](docs/learn/quick-start.md), then [Build a list app](docs/learn/lists-and-forms.md), [Add it to the Home Screen](docs/learn/installing-and-updates.md) and [Deploy and update](docs/learn/deploy.md).
- [Components](docs/components/index.md): one page per component, with examples.
- [Recipes](docs/app-recipes.md): longer examples, such as a messaging thread or local data with backups.
- [API reference](packages/kit/api/reference.md): every export, generated from the package.

The same docs, with live previews, are at https://satin.build/docs/. Every page is also plain Markdown, indexed at https://satin.build/llms.txt, so coding agents can read them too.

## What's in this repository

| Folder | What it is |
| --- | --- |
| `packages/kit` | The framework. |
| `packages/create-satin` | The app generator behind `npm create`. |
| `packages/lint` | Lint rules that keep apps on the framework's path. |
| `packages/push` | A small sender for push notifications. |
| `templates/basic` | The starter app. |
| `skills` | Agent skills that developers install into their coding agent. |
| `apps/docs` | The website and documentation. |
| `docs` | Guides, component pages and design notes. |

## Develop

```sh
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r lint
pnpm build
pnpm -r test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License and trademarks

Satin is released under the [MIT License](LICENSE). Third-party licenses and artwork credits are in [NOTICE](NOTICE).

Every app gets an Acknowledgements screen with its open-source notices; show it from an About or Settings button with `useNavigation().showAcknowledgements()`. A "Built with Satin" credit there is welcome but optional, and `acknowledgements: false` in `defineApp` removes the screen.

The Satin name and logo are covered by the [trademark policy](TRADEMARKS.md). iPhone, iPad, iOS and Safari are trademarks of Apple Inc. Satin is not affiliated with or endorsed by Apple.
