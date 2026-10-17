---
name: satin-best-practices
description: How to build a correct Satin app, an installable iPhone and iPad web app written in React. Covers the framework's ownership rules, which component to reach for, navigation and presentation, local data and drafts, geometry and scrolling, keyboard and text input, glass, symbols, install and updates, notifications, lint rules and the checks to run before calling an app done. Use when writing, reviewing or debugging code that imports '@satinhq/kit', when a project contains a Satin app definition, or when the user asks for an iOS-style web app, PWA or Home Screen app built with Satin.
license: MIT
metadata:
  version: '0.1.0'
---

# Satin best practices

Satin apps run from the iPhone or iPad Home Screen in WebKit. React renders your screens. The
framework owns everything a native app gets from the system: navigation, scrolling, safe areas, the
keyboard, glass, motion, installation and updates. Most bugs in Satin apps come from app code
taking one of those jobs back.

For how the app should look, load the `satin-design` skill. This skill is about building it right.

## The five rules that prevent most bugs

1. **Mount once through `runApp`.** Declare the app with `defineApp`, routes with `defineRoutes`, and
   tabs or a single stack with `defineNavigation`. Never create your own React root, router, browser
   history entries or service worker.
2. **Compose with framework components.** Screens are `Screen`; scrolling content is `List`, `Form`
   or `ScrollView`; actions are `Button` with `onPress`; navigation is `NavigationLink`. Do not
   rebuild a control, gesture, scroller, bar or material from `div`s, even when the framework one is
   missing a feature. Reduce the feature or report it as blocked.
3. **Let the framework own geometry.** No `100vh`, no `env(safe-area-inset-*)`, no
   `position: fixed` chrome, no global CSS reset, no `overflow: scroll` containers. Use
   `SafeAreaInset`, toolbars and `useSafeAreaInsets()`.
4. **Keep records in collections, drafts in scene storage, presentation flags in `useState`.**
   Sheets and alerts always start closed after a relaunch.
5. **Test in WebKit only.** Safari on iPhone or iPad, the iOS Simulator, then the installed Home
   Screen app. Desktop Chrome and Firefox show an unsupported page by design; never bypass the
   platform gate to make them work. The Simulator has no WebGPU, so test a release build there
   (see [done](references/done.md)).

## A screen, the Satin way

```tsx
import { useState } from 'react'
import { Button, List, NavigationLink, NavigationStack, Screen, Section, Sheet, ToolbarItem, useQuery } from '@satinhq/kit'
import { db } from './data'

export function HabitsScreen() {
  const habits = useQuery(db.habits)
  const [adding, setAdding] = useState(false)
  return (
    <Screen
      toolbar={
        <ToolbarItem placement="primaryAction">
          <Button symbol="plus" iconOnly aria-label="Add habit" onPress={() => setAdding(true)} />
        </ToolbarItem>
      }
    >
      <List id="habits">
        <Section>
          {habits.data?.map(habit => (
            <NavigationLink key={habit.id} to="habit" params={{ id: habit.id }}>
              {habit.name}
            </NavigationLink>
          ))}
        </Section>
      </List>
      <Sheet title="New Habit" isPresented={adding} onPresentedChange={setAdding}>
        <NavigationStack modal root="newHabit" />
      </Sheet>
    </Screen>
  )
}
```

The title comes from the route declaration. The list owns scrolling, insets, separators and the
large title collapse. The toolbar button is glass because the framework draws it. The pushed screen
receives only the record ID and reads the record itself with `useRecord`, so it never shows a stale
copy. The sheet's own stack gives the editor a title bar and Cancel and Save buttons through its
route's `Screen` toolbar.

## Where the facts live

Read the reference that matches the task before writing code. Each one is short.

| Task | native reference |
| --- | --- |
| Find the right export, entry point or lint rule | [references/api-map.md](references/api-map.md) |
| Routes, tabs, push, sheets, alerts, menus, swipe actions, iPad columns | [references/navigation.md](references/navigation.md) |
| Records, queries, drafts, preferences, backup, relaunch behaviour | [references/data-and-state.md](references/data-and-state.md) |
| Safe areas, scrolling, keyboard, text fields, custom layout | [references/layout-and-input.md](references/layout-and-input.md) |
| Glass, symbols, images, appearance | [references/rendering.md](references/rendering.md) |
| `defineApp`, install page, updates, push notifications, servers | [references/install-and-updates.md](references/install-and-updates.md) |
| What to check before saying the app is done | [references/done.md](references/done.md) |

The installed package is the authority on exact props. Search
`node_modules/@satinhq/kit/dist/docs/reference.md` for an export name and follow its declaration
link, and copy complete examples from `node_modules/@satinhq/kit/README.md` and
`node_modules/@satinhq/kit/dist/docs/app-recipes.md` before adapting them. If this skill and the
installed package disagree, the package wins.

## When something is missing

An export that compiles is not a promise of native behaviour, and some native controls do not exist
yet. When the app needs something the framework lacks:

- Use a documented composition from the package docs, or
- reduce the feature to what the framework supports, or
- tell the user it is blocked and why.

Never fill the gap with a hand-rolled control, gesture recogniser, geometry adapter or fake glass,
and never import `@satinhq/kit/internal` to reach one. Those workarounds break on the device in ways the
desktop never shows.
