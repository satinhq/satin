# FullScreenCover

A presentation that covers the whole screen.

```tsx
import { Button, LabeledContent, FullScreenCover } from '@satinhq/kit'
```

## Example

Click Open Editor, then Done to close it.

<!-- example: full-screen-cover open -->

```tsx
import { useState } from 'react'
import {
  Button,
  FullScreenCover,
  List,
  NavigationStack,
  Screen,
  Section,
  ToolbarItem,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
  useDismiss,
} from '@satinhq/kit'
import { app as appInput } from './app'

function Editor() {
  const dismiss = useDismiss()
  return (
    <Screen
      toolbar={
        <ToolbarItem placement="confirmationAction">
          <Button onPress={dismiss}>Done</Button>
        </ToolbarItem>
      }
    >
      <List id="cover">
        <Section>
          <p>Your editor content goes here.</p>
        </Section>
      </List>
    </Screen>
  )
}
function Example() {
  const [shown, setShown] = useState(false)
  return (
    <Screen>
      <List id="presentation">
        <Section>
          <Button onPress={() => setShown(true)}>Open Editor</Button>
        </Section>
      </List>
      <FullScreenCover title="Editor" isPresented={shown} onPresentedChange={setShown}>
        <NavigationStack modal root="editor" />
      </FullScreenCover>
    </Screen>
  )
}
const routes = defineRoutes({
  example: route(Example, {
    title: 'FullScreenCover',
    titleDisplay: 'large',
  }),
  editor: route(Editor, { title: 'Editor', titleDisplay: 'inline' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'example' } })
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
runApp({ app: defineApp(appInput), routes, navigation })
```

## Bind presentation state

Keep `isPresented` in React state and pass its setter to `onPresentedChange`. The presentation updates the binding when it closes.

## Finish the task

Use a Done button inside a cover. For an alert or dialog, supply actions with labels and optional roles. Presentation state starts closed after an app relaunch.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `isPresented` | `boolean` | Whether it is open. |
| `onPresentedChange` | `(presented: boolean) => void` | Receives dismissal changes. |
| `title` | `string` | The accessible title. |
| `children` | `ReactNode` | The cover content. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
