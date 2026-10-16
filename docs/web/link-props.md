# LinkProps

Configure a URL action with destination, its accessible children and optional disabled state. onResult receives the synchronous dispatch outcome. Internal destinations use the registered in-memory scene stack. A URL action does not expose a generic browser dismissal event.

```ts
export interface LinkProps extends OpenURLOptions {
  destination: string
  children: ReactNode
  disabled?: boolean
  className?: string
  style?: CSSProperties
  /** Receives dispatch or rejection immediately, never inferred page completion. */
  onResult?: (result: OpenURLResult) => void
}
```

See [Web pages and sign in](../web-handoff.md) for complete examples and the hosting contract. The runnable HTTPS example is in `fixtures/web-handoff/`.
