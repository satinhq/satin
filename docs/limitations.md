# Current limitations

What each part of Satin does today, and where it stops. Limits that come from iOS itself are in [Known issues](https://github.com/satinhq/satin/blob/main/docs/known-issues.md).

## App structure

- **Navigation, lists and forms.** Typed routes, navigation stacks, tabs that keep their state, and split views on iPad.
- **Content and layout.** Lazy stacks and grids keep every row mounted, and pinned section headers and `Section` outside a `List` aren't available.
- **Geometry.** `GeometryReader` needs a definite size on a scrolling axis, and `ViewThatFits` keeps unused children mounted, so their effects keep running.
- **Tasks.** Task cancellation is cooperative.

## Controls and input

- **Date, color and progress.** `DatePicker` has the compact style only, and `ColorPicker` returns sRGB hex, converting Display P3 choices. See [controls](controls.md).
- **Editing and keyboard.** Fields keep themselves visible above the keyboard. On iPad, the first keyboard after launch won't open from a tap near the screen edge.
  - **Workaround:** tap further in. Later edge taps work.
- **Pull to refresh and scrolling.** `refreshable` adds pull to refresh to a scroll view.
  - **Workaround:** for threads that stream new content, follow [messaging scroll](messaging-scroll.md).

## Glass

- **Glass needs WebGPU.** Lumen draws glass with WebGPU. Without it, released apps use a lighter material and development builds report the error.
- **Some content is hidden from glass.** Glass can't show content the browser keeps private. See [Glass limitations](https://github.com/satinhq/satin/blob/main/docs/glass/limitations.md).

## Data, notifications and updates

- **Local data.** iOS can evict web storage, an app closed by the system can lose its newest unsaved changes, and presentations start closed after a launch.
  - **Workaround:** keep important records in collections, offer backups, and save drafts yourself.
- **Notifications.** Permission, subscription, badge and tap-routing APIs are available. Notifications arrive by push from a server, and the push sender sends immediately.
  - **Workaround:** schedule reminders on your own server. See [server-scheduled reminders](https://github.com/satinhq/satin/blob/main/docs/server-reminders.md).
- **Installation and updates.** A deployment check runs before install. Release builds never reload while in use; preview builds may.
- **Status bar.** Apps use iOS's opaque status bar strip. iOS can dim it under system overlays. Satin `Sheet` and `Alert` can leave the strip bright while the page dims; see [Known issues](https://github.com/satinhq/satin/blob/main/docs/known-issues.md#platform-limitations). Satin doesn't offer the translucent style because iOS 27 blurs app content beneath it.
- **Acknowledgements.** An Acknowledgements screen with your app's open-source notices is on by default. Remove it with `acknowledgements: false`.

## Not available yet

- **Video player.** There's no general video player control.
- **Full search tab.** `searchable` gives a search field and results, but not the full search tab.

`@satinhq/kit/unstable` exports are experimental and may change. The [API reference](https://github.com/satinhq/satin/blob/main/packages/pwakit/api/swiftui-reference.md) lists every export.
