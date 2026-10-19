# Quick start

In this guide you create a Satin app, change its first screen and open it on an iPhone or iPad. It takes about ten minutes.

You need:

- Node 22.12 or later (or Node 24) and npm.
- An iPhone or iPad on iOS 27, or the iOS Simulator in Xcode 27.

## 1. Create the app

```sh
npm create satin@beta my-app
cd my-app
npm install
```

The command asks for an app name and an app ID, then creates `my-app`: a Home tab with a small reading list saved on the device, and a Settings tab. Add `--yes` to accept the defaults.

<details>
<summary>Working from a clone of the repository</summary>

Run this at the root of the checkout. It packs the framework and the app generator into a temporary folder, then creates `my-app` there. Keep the folder: the app installs Satin from it.

```sh
pnpm install --frozen-lockfile
PREVIEW_DIR="$(mktemp -d "${TMPDIR:-/tmp}/satin-preview.XXXXXX")"
mkdir -p "$PREVIEW_DIR/packages" "$PREVIEW_DIR/scaffolder"
KIT_ARCHIVE="$(node -p "const { name, version } = require('./packages/kit/package.json'); name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz'")"
LINT_ARCHIVE="$(node -p "const { name, version } = require('./packages/lint/package.json'); name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz'")"
CREATE_ARCHIVE="$(node -p "const { name, version } = require('./packages/create-satin/package.json'); name.replace(/^@/, '').replaceAll('/', '-') + '-' + version + '.tgz'")"
pnpm --filter @satinhq/kit pack --pack-destination "$PREVIEW_DIR/packages"
pnpm --filter @satinhq/lint pack --pack-destination "$PREVIEW_DIR/packages"
pnpm --filter create-satin pack --pack-destination "$PREVIEW_DIR/packages"
tar -xzf "$PREVIEW_DIR/packages/$CREATE_ARCHIVE" -C "$PREVIEW_DIR/scaffolder"

cd "$PREVIEW_DIR"
node scaffolder/package/bin/create-satin.mjs my-app --yes --name "My App" --id my-app \
  --satin-package "$PREVIEW_DIR/packages/$KIT_ARCHIVE"
cd my-app
node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); pkg.devDependencies["@satinhq/lint"] = process.argv[1]; fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n")' "$PREVIEW_DIR/packages/$LINT_ARCHIVE"
npm install
```

</details>

## 2. Run it

```sh
npm run dev
```

Open the printed address at `/app/` in Safari on your iPhone, or in Safari in the iOS Simulator. A physical device needs a reachable trusted HTTPS address. You see the starter app: a Home tab and a Settings tab.

Desktop browsers are not a target. Satin only runs on iPhone and iPad WebKit, so Chrome and desktop Safari show an "unsupported" page.

## 3. Change the first screen

Replace `src/main.tsx` with this. It has two screens: a list of books, and a detail screen that the list pushes. Switch to Preview to try it here.

<!-- example: quick-start -->

```tsx
import { useState } from 'react'
import {
  defineApp,
  defineNavigation,
  defineRoutes,
  param,
  route,
  runApp,
  List,
  NavigationLink,
  Screen,
  Section,
  Toggle,
  type RouteParameters,
} from '@satinhq/kit'
import { app as appInput } from './app'

const bookParams = { title: param.string() }

function Books() {
  return (
    <Screen>
      <List id="books">
        <Section>
          <NavigationLink to="book" params={{ title: 'Middlemarch' }}>
            Middlemarch
          </NavigationLink>
          <NavigationLink to="book" params={{ title: 'Persuasion' }}>
            Persuasion
          </NavigationLink>
        </Section>
      </List>
    </Screen>
  )
}

function Book({ title }: RouteParameters<typeof bookParams>) {
  const [finished, setFinished] = useState(false)
  return (
    <Screen title={title}>
      <List id="book">
        <Section>
          <Toggle label="Finished" isOn={finished} onChange={setFinished} />
        </Section>
      </List>
    </Screen>
  )
}

const routes = defineRoutes({
  books: route(Books, { title: 'Books', titleDisplay: 'large' }),
  book: route(Book, { params: bookParams, title: ({ title }) => title }),
})
const navigation = defineNavigation(routes, { stack: { root: 'books' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: defineApp(appInput), routes, navigation })
```

Save, and the dev server updates the page. Tap a book: the detail screen slides in like a native push, with a Back button.

What the code does:

- `defineRoutes` names each screen. `route(Books, …)` sets the screen title.
- `NavigationLink` pushes a route with typed `params`.
- `declare module '@satinhq/kit'` registers your routes once, so `to` and `params` are type-checked everywhere.
- `runApp` starts the app. There is no router, `<html>` setup or service worker to write.

## 4. Add it to the Home Screen

A Satin app is meant to run from the Home Screen, where it opens full screen with no Safari toolbar and a swipe from the left edge goes back. [Add it to the Home Screen](installing-and-updates.md) shows how, in the Simulator and on a phone.

## Working with a coding agent

Every page of these docs is also plain Markdown. Point your agent at `/llms.txt` for the index, or `/llms-full.txt` for every page in one file, and it reads the same docs you do. Each generated app also ships `AGENTS.md`, the framework's rules for agents.

## Next steps

- [Build a list app](lists-and-forms.md): add a field and a list that grows.
- [Add it to the Home Screen](installing-and-updates.md): install your app and open it like any other.
- [Deploy and update](deploy.md): put it on the web so anyone can install it.
- [Known issues](../known-issues.md): what iOS limits, what we're fixing and what we won't do.
