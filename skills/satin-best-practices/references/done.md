# Before calling the app done

## Run

- `npm run typecheck` and `npm run build`. Run `satin-lint` too if it is available, and say so if
  it isn't. Never claim a check you didn't run.

## Exercise every state

- Empty, loading, error and saved states for each screen. Empty and failed are different screens.
- A failed write keeps the user's input and offers Retry.
- Drafts survive switching tabs and backgrounding. Destructive actions ask first.
- Each tab keeps its stack and scroll position; re-tapping a tab pops to root, then scrolls up.
- Keyboard: fields stay visible, focus order follows the screen, Return does what its label says.
- Light and dark, large text and the largest accessibility size, Reduce Motion, VoiceOver labels on
  every icon-only control.
- A regular-width iPad layout if the app supports iPad.
- If the app uses push: permission denied and retry, and a tap on a notification with the app warm
  and cold.

## Test where it runs

Check in Safari on an iPhone or iPad or in the iOS Simulator, then from the installed Home Screen
icon. Desktop browsers are unsupported and prove nothing about touch, the keyboard, safe areas or
glass.

The iOS Simulator has no WebGPU. In development Satin refuses its lighter fallback material so a
missing renderer shows up as an error: glass doesn't draw, and sheets wait for glass that never
arrives. That is a development signal, not how the app behaves for people. To see what someone
without WebGPU gets, build for release (`npm run build`, then `npm run preview`), add it to the
Home Screen in the Simulator and test there. Don't report a sheet or tab bar as broken from a
development build in the Simulator. When you report, name the device, iOS version, appearance and the flows you tried, and list
every check you couldn't run.

Keep three kinds of evidence apart in your report: software checks (typecheck, build, lint),
rendered checks (screenshots in WebKit) and installed-device checks (touch, keyboard, VoiceOver,
notifications). A build passing doesn't prove the app feels right.

## Don't hide framework limits

If a framework component has a visible defect, report it. Don't paper over it with app offsets,
custom controls, alternative glass or different motion. The workaround will outlive the fix.
