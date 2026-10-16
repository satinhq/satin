# Link

Use `NavigationLink` for typed screen destinations. Use `Link` or `useOpenURL` for a URL. Registered URLs in your app scope use the existing navigation stack and retain the document. An unknown app URL returns `unavailable`; it never turns a route typo into a page reload.

<!-- example: link open -->

```tsx
import { Link, Screen } from '@satinhq/kit'

function Example() {
  return (
    <Screen>
      <p>Open a page outside this preview.</p>
      <Link destination="https://example.com">Visit example.com</Link>
    </Screen>
  )
}
```

Call URL actions directly from a press. External HTTP and HTTPS pages open an auxiliary browsing context with its opener removed. The browser chooses its presentation. On the installed target, this can be a page with Safari controls above it; use its Close control to return. `dispatched` means the browser accepted the request, not that the page loaded. There is no reliable generic dismissal callback. The app remains alive while the platform permits it; enable scene restoration for eviction.

`prefersInApp` defaults to true. Setting it to false returns `unavailable` because web code cannot guarantee a switch to a separate browser. A blocked auxiliary window also returns `unavailable`. There is no automatic document-replacing fallback. Only HTTP and HTTPS URLs are supported. Executable URLs, embedded credentials, custom schemes and private Safari schemes are rejected.

`Link` uses the framework press policy and exposes link accessibility semantics. It is a URL action, not an HTML anchor with a browser context menu. It takes `destination`, `children`, `disabled`, `className`, `style`, `prefersInApp` and `onResult`.
