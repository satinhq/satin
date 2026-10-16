# Sheets and alerts

In this guide you present a sheet for a short settings task. It takes about 10 minutes.

You need:

- A Satin app from [Quick start](quick-start.md).
- React state and component basics.

## 1. Add the sheet

Keep presentation state in the screen. Pass the Boolean and setter to the Sheet.

<!-- example: sheets-and-alerts -->

```tsx
import { useState } from 'react'
import {
  Button,
  List,
  Screen,
  Section,
  Sheet,
  Toggle,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
} from '@satinhq/kit'
import '@satinhq/kit/styles.css'
import { app as appInput } from './app'

function Trip() {
  const [showing, setShowing] = useState(false)
  const [offline, setOffline] = useState(true)
  return (
    <Screen>
      <List id="trip">
        <Section>
          <Button onPress={() => setShowing(true)}>Trip Settings</Button>
        </Section>
      </List>
      <Sheet
        title="Trip Settings"
        isPresented={showing}
        onPresentedChange={setShowing}
        detents={['medium', 'large']}
      >
        <List id="trip-settings">
          <Section>
            <Toggle label="Offline maps" isOn={offline} onChange={setOffline} />
            <Button onPress={() => setShowing(false)}>Done</Button>
          </Section>
        </List>
      </Sheet>
    </Screen>
  )
}

const routes = defineRoutes({
  trip: route(Trip, { title: 'Trip', titleDisplay: 'large' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'trip' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: defineApp(appInput), routes, navigation })
```

Click Trip Settings, change Offline maps, then Done.

What the code does:

- `Screen` supplies the screen title.
- `List` and `Section` group content, to create grouped rows.
- React state and setter functions supply controlled values, for editable content.

## 2. Choose the heights

The medium and large detents let the sheet move between two heights. Omit detents when you need the default presentation.

## 3. Confirm an action

Use [Alert](../components/alert.md) for a message that needs an answer, or [ConfirmationDialog](../components/confirmation-dialog.md) for a set of task choices. Both use the same presentation binding.

## Next steps

- [Screens and navigation](screens-and-navigation.md)
- [Lists and forms](lists-and-forms.md)
- [Sheets and alerts](sheets-and-alerts.md)
- [Using glass](using-glass.md)
