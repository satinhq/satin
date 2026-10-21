# LazyVStack and LazyHStack

Stable stack layouts for small collections. Both render every child eagerly and retain mounted state. They do not virtualize offscreen content; use [List](list.md) for long data.

```tsx
import { LazyHStack, LazyVStack, Text } from '@satinhq/kit'

<LazyVStack alignment="leading" spacing={8} frame={{ maxWidth: 'infinity' }}>
  {items.map(item => <Text key={item.id}>{item.title}</Text>)}
</LazyVStack>
```

LazyVStack accepts VStack props, including horizontal alignment, spacing, padding and frame. LazyHStack accepts HStack props, including vertical or text-baseline alignment. A frame passes its width to the stack body. Content can take that width with a fill frame or keep an explicit size.

These layouts do not scroll by themselves. Put them inside ScrollView when needed. Pinned headers are unsupported. Existing imports from `@satinhq/kit/unstable` remain compatible.
