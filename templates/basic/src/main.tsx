import { runApp, TabView } from '@satinhq/kit'
import { app, routes, navigation } from './routes'
import './styles.css'

runApp({ app, routes, navigation, content: TabView })
