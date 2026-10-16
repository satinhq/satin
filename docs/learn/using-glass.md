# Using glass

In this guide you put a glass effect behind a control. It takes about 10 minutes.

You need:

- A Satin app from [Quick start](quick-start.md).
- React state and component basics.

## 1. Add a glass effect

GlassEffect supplies the material behind its children. This example uses the regular interactive material.

<!-- example: learn-glass -->

```tsx
import { useState } from 'react'
import {
  Button,
  Glass,
  GlassEffect,
  GlassEffectContainer,
  LabeledContent,
  List,
  Screen,
  Section,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
} from '@satinhq/kit'
import '@satinhq/kit/styles.css'
import { app as appInput } from './app'

function Stops() {
  const [stops, setStops] = useState(0)
  return (
    <Screen>
      <List id="stops">
        <Section>
          <GlassEffectContainer>
            <GlassEffect glass={Glass.regular.interactive()}>
              <Button onPress={() => setStops(stops + 1)}>Add Stop</Button>
            </GlassEffect>
          </GlassEffectContainer>
          <LabeledContent label="Stops" value={stops} />
        </Section>
      </List>
    </Screen>
  )
}

const routes = defineRoutes({
  stops: route(Stops, { title: 'Stops', titleDisplay: 'large' }),
})
const navigation = defineNavigation(routes, { stack: { root: 'stops' } })

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app: defineApp(appInput), routes, navigation })
```

Click Add Stop to update the count.

What the code does:

- `Screen` supplies the screen title.
- `List` and `Section` group content, to create grouped rows.
- React state and setter functions supply controlled values, for editable content.

## 2. Group the effects

GlassEffectContainer groups related effects. Read [Using glass](../glass/using-glass.md) for glassEffectID, namespaces and glassEffectUnion.

## 3. Check the pixel sources

Glass needs WebGPU and readable pixels behind it. See [Known limitations](../glass/limitations.md) for cross-origin images, frames and protected video.

## Next steps

- [Screens and navigation](screens-and-navigation.md)
- [Lists and forms](lists-and-forms.md)
- [Sheets and alerts](sheets-and-alerts.md)
- [Using glass](using-glass.md)
