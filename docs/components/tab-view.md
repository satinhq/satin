# TabView

A container for primary tabs, each with its own navigation stack.

```tsx
import { TabView } from '@satinhq/kit'
```

## Example

Click Favorites, then Library. Each tab keeps its own screen.

<!-- example: tab-view open -->

```tsx
import { useState } from 'react'
import {
  List,
  Screen,
  Section,
  TabView,
  Toggle,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
} from '@satinhq/kit'
import '@satinhq/kit/styles.css'
import { app as appInput } from './app'

function Library() {
  const [downloaded, setDownloaded] = useState(true)
  return (
    <Screen>
      <List id="library">
        <Section>
          <Toggle label="Downloaded books" isOn={downloaded} onChange={setDownloaded} />
        </Section>
      </List>
    </Screen>
  )
}
function Favorites() {
  return (
    <Screen>
      <List id="favorites">
        <Section>Persuasion</Section>
      </List>
    </Screen>
  )
}
function App() {
  return <TabView />
}

const routes = defineRoutes({
  library: route(Library, { title: 'Library', titleDisplay: 'large' }),
  favorites: route(Favorites, {
    title: 'Favorites',
    titleDisplay: 'large',
  }),
})
const navigation = defineNavigation(routes, {
  tabs: [
    { id: 'library', label: 'Library', symbol: 'book', root: 'library' },
    {
      id: 'favorites',
      label: 'Favorites',
      symbol: 'star',
      root: 'favorites',
    },
  ],
})

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: defineApp(appInput), routes, navigation, content: App })
```

## Declare the tabs

Register tab ids and root routes in `defineNavigation`. Use its `defaultTab` option for the initial tab. TabView renders those declarations, each with its own retained stack.

## Control selection

Omit `selection` to let the TabView manage it. Supply `selection` and `onSelectionChange` for a controlled tab.

## Adapt to larger windows

`tabViewStyle="sidebarAdaptable"` enables the supported sidebar adaptation. The compact preview shows the phone arrangement.

## Add a bottom accessory

Pass persistent content, such as a mini player, to `bottomAccessory`. TabView
places it relative to the tab bar, reserves its space in tab content, and owns
safe-area clearance and movement with the tab chrome. It also adjusts placement
for the supported iPad sidebar layout. Keep the accessory in this slot; do not
position it over each tab or add another bottom inset to the tab screens.

On iPhone, the expanded accessory occupies a fixed 48-point row. Taller app
content does not enlarge that row. On iPad, the slot has a 48-point minimum and
can grow for taller content. Keep the phone composition compact.

TabView supplies regular capsule glass by default. Your app supplies the content,
internal spacing and actions. When the app draws its own material, set
`bottomAccessoryMaterial="custom"` to avoid a second glass wrapper.

Return `<PlayerTabs />` from `App` in the tabs example above. The button toggles
local state here; connect it to your media player's playback action in your app.

<!-- compile -->

```tsx
import { useState } from 'react'
import { Button, HStack, TabView, Text, VStack } from '@satinhq/kit'

export function PlayerTabs() {
  const [playing, setPlaying] = useState(false)
  return (
    <TabView
      bottomAccessory={
        <HStack
          spacing={12}
          padding={{ horizontal: 12, vertical: 2 }}
          frame={{ maxWidth: 'infinity', minHeight: 48 }}
        >
          <VStack alignment="leading" spacing={0} style={{ flex: 1, minWidth: 0 }}>
            <Text font="headline" lineLimit={1}>Evening walk</Text>
            <Text font="caption" foregroundStyle="secondary" lineLimit={1}>
              Harbor sessions
            </Text>
          </VStack>
          <Button
            symbol={playing ? 'pause.fill' : 'play.fill'}
            iconOnly
            aria-label={playing ? 'Pause' : 'Play'}
            buttonStyle="plain"
            onPress={() => setPlaying(current => !current)}
          />
        </HStack>
      }
    />
  )
}
```

The full-width row and its content insets belong to this recipe. Text colors
follow appearance. Accessory motion uses the framework's existing behavior;
there is no public accessory-morph setting to configure.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `selection` | `TabId` | Optional controlled active tab. |
| `onSelectionChange` | `(id: TabId) => void` | Receives a tab change. |
| `tabViewStyle` | `'automatic' \| 'sidebarAdaptable'` | The adaptive style. |
| `bottomAccessoryMaterial` | `'glass' \| 'custom'` | Defaults to glass. Use custom when the app supplies its own material. |
| `bottomAccessory` | `ReactNode` | Persistent accessory content. TabView owns placement, clearance and default capsule glass; the app supplies content and controls. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).

## Bottom accessory material

`bottomAccessory` receives regular capsule glass by default. Pass ordinary content:

```tsx
<TabView bottomAccessory={<HStack><Text>Now Playing</Text></HStack>}>
  {/* tabs */}
</TabView>
```

Existing accessories that contain their own `GlassEffect`, including a custom
component that renders glass, must set `bottomAccessoryMaterial="custom"`.
This leaves material ownership with the caller and avoids nested glass. The option
changes material ownership only; placement and minimization remain TabView-owned.

For an existing mini-player component, migration is one prop:

```tsx
<TabView bottomAccessoryMaterial="custom" bottomAccessory={<MiniPlayer />} />
```
