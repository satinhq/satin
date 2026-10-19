import { defineApp, defineNavigation, defineRoutes, param, route } from '@satinhq/kit'
import { app as appInput } from './app'
import { HomeScreen, DetailScreen, SettingsScreen, YourDataScreen } from './screens'

export const app = defineApp(appInput)

export const routes = defineRoutes({
  home: route(HomeScreen, { title: app.name, titleDisplay: 'large' }),
  detail: route(DetailScreen, {
    params: { id: param.string(), title: param.string() },
    title: ({ title }) => title,
  }),
  settings: route(SettingsScreen, { title: 'Settings', titleDisplay: 'large' }),
  data: route(YourDataScreen, { title: 'Your data' }),
})
export const navigation = defineNavigation(routes, {
  tabs: [
    { id: 'home', label: 'Home', symbol: 'house', root: 'home' },
    { id: 'settings', label: 'Settings', symbol: 'gearshape', root: 'settings' },
  ],
})
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}
