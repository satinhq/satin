# Screens and navigation

In this guide you declare screens and open a detail screen with typed parameters. It takes about 15 minutes.

You need:

- A Satin app from [Quick start](quick-start.md).
- React state and component basics.

## 1. Declare the screens

Create a root screen for places and a detail screen for one place. The detail route declares a string parameter. `runApp` renders the declared stack automatically.

<!-- example: screens-and-navigation -->

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

Click Kyoto, change Visited, then click the back button.

What the code does:

- `Screen` supplies the screen title.
- `List` and `Section` group content, to create grouped rows.
- React state and setter functions supply controlled values, for editable content.

## 2. Open the detail

NavigationLink sends the destination id and its typed params. Screen overrides the detail title with the place name.

## 3. Return to the list

Click the back button in the preview. Try the left-edge back swipe on a device. Internal navigation is an in-memory stack.

## Next steps

- [Screens and navigation](screens-and-navigation.md)
- [Lists and forms](lists-and-forms.md)
- [Sheets and alerts](sheets-and-alerts.md)
- [Using glass](using-glass.md)
