# Known issues

Satin is a public beta for iOS 27. This page lists what iOS limits, what we're working on, and what isn't planned. For what each part of the framework covers, see [Current limitations](limitations.md).

**iPhone Duo isn't supported yet.** Apps run on it, but their layouts aren't designed for its two displays.

## Platform limitations

iOS and Safari decide these. Satin works around them where it can.

- **The status strip stays bright under app modals.** On tested iOS 27 installed iPad apps, `Sheet` and `Alert` dim the page while the opaque iOS strip stays bright. Updating `theme-color` with the scrim does not dim it.
- **Glass redraws at 60 fps.** Safari draws web content at about 60 fps even on 120 Hz screens, though bars, sheets and menus still move at the display's full rate.
- **Some content is hidden from glass.** Browsers keep other sites' frames, images without CORS and DRM video private.
  - **Workaround:** keep glass off that content. See [Glass limitations](glass/limitations.md).
- **Plainer glass without WebGPU.** Released apps fall back to a lighter material that blurs but doesn't refract.
- **Blank screen after a long break.** After a long time in the background, iOS can show a blank screen for a second or two while the app returns.
- **Notifications come from a server.** Web apps can't schedule notifications on the device.
  - **Workaround:** send them from a server. See [Server-scheduled reminders](server-reminders.md).
- **iOS can clear web storage.** iOS may evict a web app's stored data.
  - **Workaround:** keep records in Satin collections and offer backups. See [Data](learn/data.md).
- **First iPad keyboard near the edge.** On iPad, the first keyboard after launch won't open from a tap within about 20 points of the screen edge.
  - **Workaround:** tap further in. Later edge taps work.

## Working on

- **Menu trigger typing.** The public `Menu` type omits a top-level `disabled` prop.
- **Custom stacks in list rows.** A custom stack containing text can stay at its intrinsic width instead of filling the row.
- **Keyboard and gesture coordination.** Keyboard dismissal, back swipes and sheet dragging may interact poorly with scrolling in some layouts.
- **Offline and update recovery.** Launching offline or returning during an update may need recovery. Keep important work saved before leaving the app.
- **Notification routing.** Badge updates and notification taps may behave differently after the app has been closed.
- **Text layout.** Text sizing and line spacing may differ from iOS across system text sizes.
- **Pull to refresh.** The root web view can still expose browser refresh behavior in some scrolling layouts. Pull activation and indicator timing may also vary with the scroll layout.
- **Overlay alignment.** Nested safe-area insets and keyboard-following composers may position overlays incorrectly.
- **Navigation-bar minimization.** Scroll-driven transitions and restoration may be uneven. Use `never` to keep the bar expanded.
- **Grey frame at launch.** Opening an app from scratch can show a brief grey frame before the launch screen.
- **iPad status bar color.** If light and dark switch while an app is open, the status bar can keep the old color until relaunch.
- **Full search tab.** `searchable` gives you a search field and results, but not yet the search tab that turns into a field as you scroll.
- **Missing controls.** There's no video player control yet, and `DatePicker` has the compact style only.
- **Long lists keep every row.** Lazy stacks and grids don't recycle rows yet, so very long lists use more memory.

## Not planned

- **Desktop browsers and Android.** Satin targets iPhone and iPad, and other browsers show an "unsupported" page.
- **Older iOS versions.** Each release targets the current iOS version, which is iOS 27 for this one.
- **Browser history navigation.** Navigation lives in the app, as in a native app, with no back and forward through browser history.
- **Restoring the screen after a cold launch.** An app opened from scratch starts at its first screen, while one returning from the background keeps everything.
  - **Workaround:** save what should survive with `useSceneStorage`.

---

About the previews in these docs: one example runs live at a time, and opening another resets the previous one. Browsers without WebGPU play a recording, and posters use the light appearance.

To report a problem, open an issue on [GitHub](https://github.com/satinhq/satin/issues).
