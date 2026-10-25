# Changelog

## 0.1.2

### Fixed

- Apps draw every edge after rotation. On iPhone Duo, rotating or folding no longer leaves a black area over the Home indicator or shifts the app, and full-screen apps on iPad no longer leave a band at the bottom edge.
- The page itself can't scroll or bounce. App stylesheets that size or scroll `html`, `body` or `#root`, content outside the app root, and the keyboard's offset no longer move the page or trigger pull-to-refresh.
- Glass no longer fails with "undefined is not an object (evaluating 'e[0].container.spacing')" when a toolbar button leaves its group during navigation.

## 0.1.1

### Changed

- Toolbar glass morphs between bars as one surface. When a screen's bottom bar changes (for example a search field and compose button becoming a group of actions and a checkmark), each capsule changes shape while its content cross-fades inside it. Separated buttons split from and merge into groups, and symbols shared by both bars stay sharp.
- Sidebars in a split view show the current destination. `NavigationLink` rows highlight the destination shown in the detail column and keep it highlighted while you navigate deeper; a controlled `List` selection uses the same appearance.

### Fixed

- A slow app script no longer shows "Unable to Open App" during launch. The error appears only after a real load failure, or after the script has been pending for 60 seconds of visible time.
- Glass always renders a material. When WebGPU glass can't start or is lost, every surface uses the CSS material, including popover pointers, and navigation waits for it instead of cancelling. Registering more glass elements than the renderer supports falls back instead of failing.
- Glass no longer fails with "undefined is not an object (evaluating 'n.texture')" when a material changes appearance without changing size, and recovers instead of repeating the error.
- Closing sheets and scrolling right after a pop drop fewer frames, and dragging across a toolbar menu no longer recaptures the menu on every frame.

## 0.1.0

The first release without a beta suffix. The framework is unchanged from the last beta (beta.7). Install commands now use `@latest`, for example `npm create satin@latest my-app`, and the packages publish to the `latest` tag.

## 0.1.0-beta.7

- Generated install and unsupported pages use hashable stylesheet rules for their illustrations. Strict CSP deployments no longer need to allow inline style attributes on those pages.
- Same-origin `WebView` links open a separate browser context with scripts disabled. Only HTTP and HTTPS destinations without credentials are allowed. Set `allowsLinkOpening={false}` to remove destinations and withhold popup permissions. `onOpenURL` still requires trusted scripted content on WebKit.
- `npx create-satin@latest upgrade` pins Satin packages, refreshes untouched guidance and tooling files, preserves app code and modified files, and prints the intervening release notes. Use `--dry-run` to preview changes.

### Fixed

- Performed swipe actions keep their label, symbol and tint until the row closes.
- A launch that completes readiness after a temporary worker stall clears the launch error and stays open when late worker progress arrives.
- A leading-edge swipe over a `WebView` can navigate back. The framework reserves a 20 pt strip where embedded content does not receive taps.
- A short conversation follows the newest message when it first becomes long enough to scroll.
- A service-worker lookup timeout reports that the lookup did not finish.

## 0.1.0-beta.6

### Added

- Search mode with `useIsSearching()` and `useDismissSearch()`. Searchable lists keep their browsing content until the app chooses to render recents or results. The bottom search field follows the keyboard and returns on Cancel.
- `prefetch(signal)` on `NavigationLink`, `Button` and `Pressable`, shared request resources through `defineResource` and `useResource`, and `AsyncImage.prefetch`. A press that becomes a scroll or swipe cancels its speculative interest.
- `TabView.trailingAction` places a Button or Menu beside the tab bar.
- `WebView sizing="content"`, default width fitting, and `onOpenURL` for same-origin documents. In this release, sandboxed scripts-off documents cannot invoke that callback on WebKit and have no native link-opening path.

### Fixed

- Long-list swipe actions follow the finger without rows popping in during flings. Regrabbing a settling row continues the swipe in its existing direction.
- Tapping an embedded page dismisses an open menu and consumes that tap. Plain lists paint the status strip with the screen's background. Filling row stacks position trailing content at the trailing edge.
- Sheet content stays mounted during dismissal. Submenus close without a lingering edge or displaced chevron. Toolbar `iconOnly` buttons hide their title.
- Glass remains usable during graphics recovery and when WebGPU is unavailable. Simulator development can use the CSS fallback. Light search fields no longer show stripe artifacts.
- Background checks pause while hidden, launch monitoring no longer polls continuously, and conversations following the bottom restore to the newest messages after resume or relaunch.
- Hosting under Vite's `base` derives matching app, install, icon and probe paths. CSP output covers every generated page and includes runtime style hashes. Install and unsupported illustrations still require inline style attributes in beta.6; the fix is listed in a later release above.

### Starter and migration

- The starter includes the lint preset at the same exact version as the framework, runs `oxlint --deny-warnings` and `satin-lint`, and separates entry points from screens. Build warnings for the plugin configuration and default renderer chunk budget are corrected.
- Removed unused glass code and its bundled notice. Deployment, subpath hosting, CSP and email recipes are updated.
- **Behavior change:** apps that previously relied on an empty searchable field replacing their list must explicitly render their search content from a child that reads `useIsSearching()`.

## 0.1.0-beta.5

- Tab destinations accept numeric and dot badges.
- Keyboard-attached safe-area content follows keyboard transitions more consistently and clips correctly. Scroll insertion motion and text-input handling receive fixes.
- Expanded guides cover remote data, deployment and web handoff. Shared `defineResource` / `useResource` loaders and press prefetch arrive in beta.6, not this release.

## 0.1.0-beta.4

- `satinApp()` automatically includes the framework stylesheet. Existing explicit stylesheet imports remain supported. Added setup guidance for Tailwind.
- The launch screen, download progress and connection errors render through a self-contained inline runtime before app code loads. Builds emit `satin-csp.json` with script and style hashes for deployment headers.
- iPad search expands into a field with an in-field clear button and anchored suggestions. Tab transitions adapt to that search presentation.
- Improved swipe contact tracking and full-swipe cancellation. Updated glass highlights, edge lighting and shadows.

## 0.1.0-beta.3

- Reorganized the repository and published documentation around Satin's public package names. App imports remain `@satinhq/kit`; the repository directory changes do not require changing imports.
- Expanded agent instructions, API examples and layout, input, list and form guidance shipped with the starter. The public API declarations remain compatible with beta.2.

## 0.1.0-beta.2

- First Home Screen launch shows download progress. Transient server reachability failures show an install retry screen; configuration errors continue to fail explicitly.
- Glass recovers after backgrounding, and the fallback tab bar updates correctly during transitions.
- Public package names and imports remain compatible with beta.1.

## 0.1.0-beta.1

- Improved deployment validation, installation checks and launch monitoring.
- Improved graphics recovery and fallback handling when WebGPU is unavailable.
- Selected tabs use the app's tint instead of always using system blue.

## 0.1.0-beta.0

The first public beta targets installed iPhone and iPad apps on iOS 27. APIs may change before 1.0.

- `@satinhq/kit` provides the framework, `@satinhq/lint` the fidelity lint preset, `@satinhq/push` the server-side push sender, and `create-satin` the Vite + React starter. App APIs come from `@satinhq/kit`, build integration from `@satinhq/kit/vite`, and experimental APIs from `@satinhq/kit/unstable`. At beta.0, apps import `@satinhq/kit/styles.css` explicitly.
- Navigation stacks with edge back swipe, state-preserving tabs, toolbars, search and iPad split views.
- Lists, forms, sections, rows, swipe actions, context menus, controls, text input and compact date picking.
- Sheets, alerts, confirmation dialogs and full-screen covers. Images, symbols, scrolling, lazy layouts, safe-area insets and zoomable content.
- WebGPU glass with a CSS fallback for released apps where WebGPU is unavailable.
- Local collections, backup and restore, scene and app storage, push notifications, badges and tap routing.
- Installation pages, icons, launch screens, offline app shell, deployment checks and updates applied at relaunch. Embedded web pages, URL handoff and web authentication.
- An Acknowledgements screen for open-source notices, enabled by default.

See [Known issues](https://github.com/satinhq/satin/blob/main/docs/known-issues.md) for platform limits and current limitations.
