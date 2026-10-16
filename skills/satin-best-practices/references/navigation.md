# Navigation and presentation

## Declare, then render

Navigation is declared once and rendered from that declaration. App code never constructs
navigators, scenes or route connections.

```tsx
const routes = defineRoutes({
  today: route(TodayScreen, { title: 'Today', titleDisplay: 'large' }),
  habit: route(HabitScreen, { params: { id: param.string() }, title: 'Habit' }),
  newHabit: route(NewHabitScreen, { title: 'New Habit' }),
})

const navigation = defineNavigation(routes, {
  tabs: [
    { id: 'today', label: 'Today', symbol: 'checkmark.circle', root: 'today' },
    { id: 'history', label: 'History', symbol: 'calendar', root: 'history' },
  ],
})

declare module '@satinhq/kit' {
  interface Register {
    routes: typeof routes
    navigation: typeof navigation
  }
}

runApp({ app, routes, navigation })
```

- Route params are declared with `param.string()`, `.int()`, `.number()`, `.boolean()` or
  `.enum([...])`, plus `.optional()`. Type screen props with `RouteParameters<typeof params>`.
- Keep params small and stable, usually a record ID. Read the record in the pushed screen with
  `useRecord`; never pass a copied record that can go stale.
- Navigation is in memory. Never touch `location`, `history.pushState` or `replaceState`, and never
  use `<a href>` for internal navigation.
- Read the navigator with `useNavigation()` for programmatic pushes and pops. `useDismiss()` pops a
  pushed screen or dismisses the enclosing presentation.

## Push, tab or present

| Situation | Use |
| --- | --- |
| A record and its detail, deeper settings, a long picker | Push with `NavigationLink` |
| Two to five enduring, top-level destinations | `TabView` with one stack per tab |
| A short, independent edit or creation flow | `Sheet` |
| A brief message, or one text entry | `Alert` (at most three actions) |
| A destructive choice | `ConfirmationDialog` with Cancel |
| An immersive flow the user must finish or cancel | `FullScreenCover` |
| A Week/Month style filter inside one screen | `Picker pickerStyle="segmented"` |

Tabs are destinations, not filters or actions. A tab change happens on finger-up. Switching tabs
keeps each tab's stack and scroll offset. Re-tapping the current tab pops to its root; re-tapping at
the root scrolls to the top. All of this is the framework's job. Pause screen-specific work with
`useScreenLifecycle`, because React effects in hidden tabs keep running.

## Sheets, alerts and dialogs

- Each takes `isPresented` and `onPresentedChange`. Keep that flag in the owning screen's
  `useState(false)`. Never persist it.
- Sheet detents: `medium`, `large`, `{ height: 320 }` or `{ fraction: 0.4 }`. Set
  `interactiveDismissDisabled` while a draft would be lost, and give the sheet explicit Cancel and
  Save.
- A sheet that needs a title bar, toolbar or pushes gets its own stack:
  `<NavigationStack modal root="editor" />` with a registered `editor` route. Never reuse the primary
  stack inside a sheet.
- Give dialog actions stable `id`s and the `cancel` or `destructive` role. Only the destructive
  action writes. Pass the trigger's ref as `anchor` so the dialog points at it on iPad.
- Alert and ConfirmationDialog close before their action's promise settles. Catch write failures
  in app state and show them; a returned promise does not keep the dialog open.
- Never call the browser's `alert`, `confirm` or `prompt`.

## Toolbars

Put toolbar content in the screen's `Screen toolbar` prop with `ToolbarItem`, `ToolbarItemGroup`
and `ToolbarSpacer`. Supported placements: `topBarLeading`, `topBarTrailing`, `primaryAction`,
`automatic`, `principal`, `bottomBar`, `confirmationAction` and `cancellationAction`. Other
placement names, such as `secondaryAction`, do not exist; don't substitute one and claim the same
behaviour. Never position an app button over the navigation bar with `position: absolute` or
`fixed`.

## Menus and row actions

Menus, context menus and swipe actions share one `Action` shape: `id`, `label`, optional `icon`,
`role: 'destructive'`, `disabled` and `onPress`. Group with `{ section: [...] }` or a submenu
`{ id, label, submenu: [...] }`.

- `Menu` for a button that opens actions.
- `contextMenu` and `swipeActions` on `NavigationLink`, `Button` or `LabeledContent` inside a `List`.
  The first trailing action is the full-swipe action; set `allowsFullSwipe: false` if that must
  never run.
- `ContextMenu` wraps any other content.
- `ForEach` with `onDelete` and `onMove` gives swipe-to-delete, edit-mode delete and reordering.
  Apply the offsets with `removing(items, offsets)` and `moving(items, { fromOffsets, toOffset })`,
  then store the result.

Persist a deletion inside the action and handle its failure. Do not build competing gestures, long
press timers or row transforms in app code.

## iPad and wide windows

- `NavigationStack` is always one stack, on every device. Columns are opt-in: render
  `<NavigationSplitView />` in a tab's `content` with a declared sidebar root. Compact width collapses
  it back to a stack.
- `<TabView tabViewStyle="sidebarAdaptable" />` offers the iPad tab sidebar. Group tabs with
  `TabSection`.
- iPhone always shows bottom tabs, including landscape. Decide by `useHorizontalSizeClass()` for
  layout, never by screen width.
- In a split view, the sidebar root's toolbar stays in the sidebar and a detail screen's toolbar
  stays in the detail column. The framework reserves room for the sidebar toggle; never add
  sidebar-dependent padding.

## Zoom transitions

Mark the source with `MatchedTransitionSource` (`id`, `namespace`) and give the pushed `Screen`
`navigationTransition={NavigationTransition.zoom({ sourceID, in })}`. Use `defineNamespace()` to
share a namespace between routes. This works for pushed screens only, and the source must be on
screen.
