# NavigationStack

A navigation container for moving between declared screens.

```tsx
import { NavigationStack, NavigationLink } from '@satinhq/kit'
```

## Example

Click Kyoto, change Visited, then click the back button.

<!-- example: navigation-stack open -->

```tsx
import { useState } from 'react'
import {
  List,
  NavigationLink,
  Screen,
  Section,
  Toggle,
  defineApp,
  defineNavigation,
  defineRoutes,
  param,
  route,
  runApp,
  type RouteParameters,
} from '@satinhq/kit'
import '@satinhq/kit/styles.css'
import { app as appInput } from './app'

const destinationParams = { name: param.string() }
function Places() {
  return (
    <Screen>
      <List id="places">
        <Section>
          <NavigationLink to="place" params={{ name: 'Kyoto' }}>
            Kyoto
          </NavigationLink>
          <NavigationLink to="place" params={{ name: 'Osaka' }}>
            Osaka
          </NavigationLink>
        </Section>
      </List>
    </Screen>
  )
}
function Place({ name }: RouteParameters<typeof destinationParams>) {
  const [visited, setVisited] = useState(false)
  return (
    <Screen title={name}>
      <List id="place">
        <Section>
          <Toggle label="Visited" isOn={visited} onChange={setVisited} />
        </Section>
      </List>
    </Screen>
  )
}

const routes = defineRoutes({
  places: route(Places, { title: 'Places', titleDisplay: 'large' }),
  place: route(Place, { params: destinationParams }),
})
const navigation = defineNavigation(routes, { stack: { root: 'places' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({
  app: defineApp(appInput),
  routes,
  navigation,
})
```

## Declare the routes

Use `defineRoutes` and `route` to name each screen. Declare typed parameters with `param` and register the routes so NavigationLink checks destinations.

## Choose the root

Declare the primary root in `defineNavigation`. Without custom `content`, `runApp` renders the declared stack. Render `NavigationStack` or `NavigationSplitView` yourself when supplying custom app content.

## Open a destination

NavigationLink uses `to` and `params`. The framework owns the in-memory stack and the back button. Try the left-edge back swipe on a device.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `tab` | `TabId` | Selects a declared primary tab. |
| `modal` | `true` | NavigationStack can own a modal stack. |
| `root` | `RouteId` | Required only for a modal stack. |
| `to` | `RouteId` | A declared destination on NavigationLink. |
| `params` | `RouteParameters` | Typed destination parameters. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
