import { useState } from 'react'
import {
  defineApp,
  defineNavigation,
  defineRoutes,
  route,
  param,
  runApp,
  TabView,
  NavigationStack,
  Screen,
  ToolbarItem,
  Button,
  NavigationLink,
  List,
  Form,
  Section,
  TextField,
  TextEditor,
  SecureField,
  GlassEffect,
  Toggle,
  Picker,
  Stepper,
  Sheet,
  Menu,
  ContextMenu,
  LabeledContent,
  type Action,
  useNavigation,
  useSceneStorage,
  type RouteProps,
  type RouteParameters,
} from '@satinhq/kit'
import { InstallationDiagnostics } from '@satinhq/kit/diagnostics'
import '@satinhq/kit/styles.css'

const app = defineApp({
  id: '/api-workout-log',
  name: 'Workout Log',
  icons: [{ src: '/icon.png', sizes: '180x180', type: 'image/png' }],
})
const detailParams = { id: param.string(), set: param.int().optional() }
// Schema-first props have no dependency on the route map being declared.
const detail = route(Workout, { params: detailParams, title: ({ id }) => `Workout ${id}` })
const routes = defineRoutes({
  workouts: route(Workouts, { title: 'Workouts', titleDisplay: 'large' }),
  workout: detail,
  settings: route(Settings, { title: 'Settings', titleDisplay: 'large' }),
})
function Workouts() {
  const [status, setStatus] = useState('Ready')
  const actions: readonly Action[] = [
    { id: 'archive', label: 'Archive', onPress: () => setStatus('Archived') },
    {
      section: [
        {
          id: 'more',
          label: 'More',
          submenu: [
            { id: 'duplicate', label: 'Duplicate', onPress: () => setStatus('Duplicated') },
          ],
        },
      ],
    },
  ]
  const interactions = {
    swipeActions: { edge: 'trailing' as const, actions, allowsFullSwipe: false },
    contextMenu: { actions, preview: <p>Workout preview</p> },
  }
  return (
    <Screen
      toolbar={
        <ToolbarItem placement="topBarTrailing">
          <Menu label="Actions" actions={actions} />
        </ToolbarItem>
      }
    >
      <List id="workouts">
        <Section header="Today">
          <NavigationLink<typeof routes> {...interactions} to="workout" params={{ id: 'one' }}>
            Morning workout
          </NavigationLink>
          <Button {...interactions} onPress={() => setStatus('Ready')}>
            Reset
          </Button>
          <LabeledContent {...interactions} label="Status" value={status} />
        </Section>
      </List>
      <ContextMenu actions={actions}>
        <p>Workout card</p>
      </ContextMenu>
    </Screen>
  )
}
function Workout({ id, set }: RouteParameters<typeof detailParams>) {
  const navigation = useNavigation<typeof routes>()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useSceneStorage('name', '')
  return (
    <Screen
      title={name || `Workout ${id}`}
      toolbar={
        <ToolbarItem placement="topBarTrailing">
          <Button onPress={() => setEditing(true)}>Edit</Button>
        </ToolbarItem>
      }
    >
      <List id="workout">
        <Section header={`Set ${set ?? 1}`}>
          <Button onPress={() => navigation.pop()}>Finish workout</Button>
        </Section>
      </List>
      <Sheet isPresented={editing} onPresentedChange={setEditing} title="Edit workout">
        <Form id="workout-editor">
          <Section>
            <TextField
              label="Name"
              prompt="Your name"
              textFieldStyle="plain"
              value={name}
              onChange={setName}
            />
            <SecureField label="Secret" textFieldStyle="plain" value={name} onChange={setName} />
            <GlassEffect>
              <TextField
                label="Message"
                axis="vertical"
                lineLimit={{ min: 1, max: 6 }}
                value={name}
                onChange={setName}
              />
            </GlassEffect>
            <TextEditor label="Notes" value={name} onChange={setName} />
            <Button onPress={() => setEditing(false)}>Done</Button>
          </Section>
        </Form>
      </Sheet>
    </Screen>
  )
}
function Settings() {
  const [enabled, setEnabled] = useState(false),
    [goal, setGoal] = useState(3),
    [units, setUnits] = useState('kg')
  return (
    <Form id="settings">
      <Section header="Preferences">
        <Toggle label="Reminders" isOn={enabled} onChange={setEnabled} />
        <Stepper label="Weekly goal" value={goal} onChange={setGoal} min={1} max={7} />
        <Picker
          label="Units"
          selection={units}
          onSelectionChange={setUnits}
          options={[
            { id: 'kg', label: 'Kilograms' },
            { id: 'lb', label: 'Pounds' },
          ]}
        />
      </Section>
    </Form>
  )
}
declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof structure
  }
}

// Compile-only public contract checks. These are never rendered or called.
function checkTypes(
  navigation: ReturnType<typeof useNavigation<typeof routes>>,
  props: RouteProps<typeof routes, 'workout'>,
) {
  navigation.push('workout', props)
  // @ts-expect-error Unknown routes cannot be pushed.
  navigation.push('missing')
  // @ts-expect-error Required params cannot be omitted.
  navigation.push('workout')
  // @ts-expect-error Integers are numbers, never transport strings.
  navigation.push('workout', { id: 'one', set: '2' })
  // @ts-expect-error Registered route parameters are required even without a generic.
  const missing = <NavigationLink to="workout">Missing params</NavigationLink>
  void missing
  // @ts-expect-error Unknown declarative routes are rejected.
  const invalid = <NavigationLink<typeof routes> to="missing">Invalid</NavigationLink>
  return invalid
}
void checkTypes
const structure = defineNavigation(routes, {
  tabs: [
    {
      id: 'workouts',
      label: 'Workouts',
      icon: <span role="presentation">W</span>,
      root: 'workouts',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <span role="presentation">S</span>,
      root: 'settings',
    },
  ],
})
// @ts-expect-error The declared tab IDs do not include typo.
const invalidTab = <TabView selection="typo" />
// @ts-expect-error A primary root cannot be declared in JSX.
const invalidPrimary = <NavigationStack root="workouts" />
void invalidTab
void invalidPrimary
runApp({ app: app, routes: routes, navigation: structure })

export const installationDiagnostics = <InstallationDiagnostics scope="/api-workout-log" />
