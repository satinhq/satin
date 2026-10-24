# NavigationSplitView

A navigation container with a sidebar and detail at regular width.

```tsx
import { NavigationSplitView } from '@satinhq/kit'
```

## Example

Click Kyoto, change Visited, then click the back button.

<!-- example: navigation-split-view open -->

```tsx
import { useState } from 'react'
import {
  List,
  NavigationLink,
  NavigationSplitView,
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
  content: () => <NavigationSplitView />,
})
```

## Declare the routes

Use `defineRoutes` and `route` to name each screen. Declare typed parameters with `param` and register the routes so NavigationLink checks destinations.

## Choose the root

Declare the primary root in `defineNavigation`. Render NavigationStack or NavigationSplitView from runApp when supplying a custom app view.

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

## Sidebar selection

A `NavigationLink` in the sidebar automatically marks the destination shown in detail as current.
Links to the same route with different parameters remain distinct. Pushing another screen inside
the detail column keeps its parent sidebar row selected. A route's `sidebar` option can group
several destinations under the same sidebar identity. Compact navigation keeps ordinary stack rows.

Use `symbol` for the leading icon and `value` for a trailing count:

```tsx
<NavigationLink to="mailbox" params={{ id: 'inbox' }} symbol="tray" value={12}>
  Inbox
</NavigationLink>
```

For application-owned detail state, bind `List` selection to that same state and identify rows
with `ForEach`. A Button's action sets the binding; changes made elsewhere also update the highlight.
The framework cannot infer which destination an arbitrary Button callback displays. A Button row
can also declare `aria-current={mailbox === item.id ? 'page' : undefined}` when it owns the
selection directly; it receives the same sidebar treatment.

```tsx
<List id="mailboxes" selection={mailbox} onSelectionChange={setMailbox}>
  <Section>
    <ForEach data={mailboxes}>
      {item => <Button onPress={() => setMailbox(item.id)}>{item.title}</Button>}
    </ForEach>
  </Section>
</List>
```

A controlled List binding owns selection when it contains NavigationLinks too. Activating a link
updates its ForEach row selection. Programmatic navigation should update the binding as well. For mailbox → message list → message detail, retain the
mailbox as the sidebar identity while message selection belongs to the detail column.
