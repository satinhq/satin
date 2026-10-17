# Using Tailwind with Satin

Add Tailwind v4 to a Satin starter:

```sh
npm install -D tailwindcss@4 @tailwindcss/vite@4
```

Keep `satinApp()` in `vite.config.ts` and add the Tailwind plugin:

```ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineApp, satinApp } from '@satinhq/kit/vite'
import { defineConfig } from 'vite'
import { app } from './src/app'

export default defineConfig({
  plugins: [react(), tailwindcss(), satinApp(defineApp(app))],
})
```

Put this in your app's `src/styles.css`, which the starter already imports:

```css
@layer theme, base, satin, components, utilities;
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);

@custom-variant dark (&:where([data-satin-appearance='dark'], [data-satin-appearance='dark'] *));
```

This follows Tailwind's [Preflight opt-out](https://tailwindcss.com/docs/preflight#disabling-preflight).
Importing all of `tailwindcss` also installs a global reset. Omit that reset:
Satin supplies control defaults, and Preflight changes plain headings, images
and other app content. Keep app resets out of the framework's document and controls.

`satinApp()` includes the framework stylesheet automatically, before app CSS.
Satin reserves the layer order shown above and puts its rules in `satin`.
Utilities therefore win over framework stylesheet declarations; ordinary unlayered
app CSS wins over both. Inline component styles and explicit component props
still take precedence over ordinary utility classes. Prefer the component's
props for control appearance, sizing and row geometry.

Use utilities on app content or components that accept `className`:

```tsx
import { Button, ListRow, Text } from '@satinhq/kit'

export function Example() {
  return (
    <ListRow>
      <Text className="text-fuchsia-600">A colored label</Text>
      <Button className="text-fuchsia-600" onPress={() => {}}>Save</Button>
    </ListRow>
  )
}
```

`ListRow` does not accept `className`. Use `listRowBackground`, `listRowInsets`
and `listRowSeparator`, or apply utilities to content inside the row.

The custom `dark` variant follows Satin's effective appearance, including an
in-app override. Tailwind's default media-query variant follows only the system.
For safe areas, continue using Satin containers and geometry tokens. Do not add
viewport-height, raw scrolling or `env(safe-area-inset-*)` utilities to the shell.

Run your app's typecheck, fidelity lint and build after adding classes.
Fidelity lint does not expand dependency imports or utility names, so a passing
lint cannot approve a reset or a geometry utility.
`satin check <url>` checks a deployment's files and headers; it does not inspect
the CSS cascade or certify the appearance of utility classes.

For a custom build integration that does not use `satinApp()`, the stylesheet
fallback is `import '@satinhq/kit/styles.css'` once, before app styles. Apps using
`satinApp()` need no framework CSS import; existing imports remain compatible.
