# Glass playground

The Satin Glass playground runs the same glass API as an app. Browsers without WebGPU use the CSS material.

<!-- example: glass-playground -->
```tsx
import {
  Image,
  Screen,
  ScrollView,
  TabView,
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  runApp,
  useColorScheme,
} from '@satinhq/kit'
import { app as appInput } from './app'
import GlassPlayground from './playground'

function FieldNotes() {
  const appearance = useColorScheme()
  return (
    <Screen toolbarVisibility="hidden">
      <ScrollView id="glass-field-notes" className="glass-playground-feed">
        <article>
          <header className="glass-playground-feed-heading">
            <h1>Along the contour</h1>
            <p>Scroll through the studies and watch the glass follow.</p>
          </header>
          {['Tidal field', 'Crossing currents', 'Soundings'].map(
            (title, index) => (
              <figure key={title}>
                <Image
                  src={`/preview/glass-playground/study-${index}-${appearance}.webp`}
                  alt={`Original ${title.toLowerCase()} study of fine lines, type and intersecting shapes.`}
                  contentMode="fit"
                />
                <figcaption>
                  <span>{title}</span>
                  <span>0{index + 1}</span>
                </figcaption>
              </figure>
            ),
          )}
        </article>
      </ScrollView>
    </Screen>
  )
}
function App() {
  return <TabView />
}
const routes = defineRoutes({
  studio: route(GlassPlayground, { title: 'Studio', titleDisplay: 'none' }),
  field: route(FieldNotes, { title: 'Field notes', titleDisplay: 'none' }),
})
const navigation = defineNavigation(routes, {
  tabs: [
    { id: 'studio', label: 'Studio', symbol: 'viewfinder', root: 'studio' },
    {
      id: 'field',
      label: 'Field notes',
      symbol: 'square.stack',
      root: 'field',
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
