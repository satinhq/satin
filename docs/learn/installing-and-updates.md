# Add it to the Home Screen

In this guide you install your app from Safari and open it from the Home Screen, first in the iOS Simulator and then on a phone. It takes about five minutes.

You need:

- An app from [Quick start](quick-start.md).
- The iOS Simulator in Xcode 27, or an iPhone or iPad on iOS 27.

## 1. Build and serve the app

The development server is for editing in a Safari tab. Installing needs a release build, which adds the install page, the app's icons and its offline cache.

```sh
npm run build
npm run preview
```

`preview` serves the build at `http://localhost:5390`.

## 2. Install it in the Simulator

1. Open `http://localhost:5390` in Safari in the Simulator and follow its install link.
2. Tap **Share**, then **Add to Home Screen**. Keep **Open as Web App** on, and tap **Add**.
3. Open the new icon on the Home Screen.

Let the first launch finish while `preview` is still running, so the app can cache itself for offline launches.

## 3. Install it on a phone

A phone needs an HTTPS address. Plain HTTP to your computer's network address isn't enough. Either [deploy the app](deploy.md) or use an HTTPS tunnel to port 5390, then:

1. Open the address in Safari on the phone and follow its install link.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open the icon.

## What changes once it's installed

- The app opens full screen, with no Safari toolbar.
- A swipe from the left edge goes back, as in any app.
- It has its own icon and launch screen, taken from `src/app.ts`.
- Opened in a Safari tab, a release build shows its install page instead of the app.

The launch cover and progress ring are embedded in the page and isolated from app styles. First installation can show download progress; an applied update shows confirmation for at least 800 ms. Ordinary launches and resumes stay silent. If launch resources fail, the same independent surface offers Retry.

## Good to know

- Changing the app's `id` in `src/app.ts` creates a different installed app. Keep it stable once people have installed it.

## Next steps

- [Deploy and update](deploy.md): put the app on the web and ship new versions.
- [Notifications](notifications.md): ask for permission and send reminders.
