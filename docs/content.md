# Content

Prefer Satin's optional content components for new app content. The framework owns their defaults. Plain React and semantic HTML remain supported; there is no adoption lint rule or warning. Keep framework chrome and geometry in Screen, List, Form and ScrollView.

Text rendering has differences from the iOS reference. See [Known issues](https://github.com/satinhq/satin/blob/main/docs/known-issues.md#working-on).

## Text

```tsx
import { Text } from '@satinhq/kit'

<Text font="headline" foregroundStyle="secondary" lineLimit={2}>
  A familiar heading
</Text>
```

`font` accepts largeTitle, title, title2, title3, headline, subheadline, body, callout, footnote, caption and caption2. Typography uses a shared iOS 27 default-size metric table, also consumed by Settings large-title tokens. Supported WebKit semantic styles retain system tracking; largeTitle and callout use explicit system-font sizes because their WebKit keywords are unsupported. Single-line glyph height is rounded to the device pixel. `fontWeight` accepts ultraLight through black. Serif design is deferred under the current system-font-only product policy. `fontDesign` selects the platform's default, rounded or monospaced system design. Nested Text inherits the enclosing font and foreground unless overridden. Text uses a span; place it in a semantic heading when a heading is intended. Text does not change the existing Selectable policy.

`multilineTextAlignment` is leading, center or trailing. `lineLimit` is a positive integer. `truncationMode` currently supports tail; head and middle truncation are deferred. Multiline limiting uses WebKit line clamping and ends in an ellipsis. `lineLimit` does not reserve empty lines.

## VStack

```tsx
import { VStack, Text } from '@satinhq/kit'

<VStack alignment="leading" spacing={12}>
  <Text font="headline">Inbox</Text>
  <Text foregroundStyle="secondary">No new messages</Text>
</VStack>
```

Alignment defaults to center. An explicit spacing, including zero, is exact. Omitted vertical spacing uses the measured iOS 27 direct-child gaps: Text/Text and automatic Button/Button 2 points, Text/SymbolImage 0. Other pairs fall back to 8 points; wrappers and custom controls do not yet propagate child spacing preferences. Use explicit spacing for those cases.

## HStack

```tsx
import { HStack, Text } from '@satinhq/kit'

<HStack alignment="firstTextBaseline" spacing={8}>
  <Text font="title">42</Text>
  <Text>items</Text>
</HStack>
```

Alignment accepts top, center, bottom, firstTextBaseline or lastTextBaseline. Defaults center. Leading/trailing directions follow document direction. Compression uses CSS flex rules; proposal-based ordering and a layoutPriority contract are not provided.

## ZStack

```tsx
import { ZStack, Text } from '@satinhq/kit'

<ZStack alignment="bottomTrailing">
  <div style={{ width: 120, height: 80, background: '#ddd' }} />
  <Text padding={8}>3</Text>
</ZStack>
```

Children share a CSS grid cell. The default alignment is center and later children paint above earlier children. Content remains in source order for accessibility.

## Spacer

```tsx
import { HStack, Spacer, Text } from '@satinhq/kit'

<HStack spacing={0} frame={{ maxWidth: 'infinity' }}>
  <Text>Title</Text>
  <Spacer minLength={12} />
  <Text>Value</Text>
</HStack>
```

Spacer grows along its direct stack parent's axis. `minLength` defaults to 8 points; zero is supported. Wrapping Spacer in arbitrary DOM changes its direct layout parent. Give the parent a bounded frame when remaining space should be consumed.

## Divider

```tsx
import { VStack, Divider, Text } from '@satinhq/kit'

<VStack alignment="leading" spacing={8}>
  <Text>Above</Text>
  <Divider />
  <Text>Below</Text>
</VStack>
```

Divider is decorative and uses the framework device-pixel token. It is vertical inside a direct HStack and horizontal otherwise. Its semantic separator colors follow appearance.

## LazyVStack

```tsx
import { Text } from '@satinhq/kit'
import { LazyVStack } from '@satinhq/kit'

<LazyVStack alignment="leading" spacing={8}>
  {['One', 'Two'].map(item => <Text key={item}>{item}</Text>)}
</LazyVStack>
```

## LazyHStack

```tsx
import { Text } from '@satinhq/kit'
import { LazyHStack } from '@satinhq/kit'

<LazyHStack spacing={12}>
  {['One', 'Two'].map(item => <Text key={item}>{item}</Text>)}
</LazyHStack>
```

Both lazy stacks currently retain all children. They do not create a scroll surface. Use ScrollView for scrolling. They do not virtualize rows.

## GridItem and LazyVGrid

```tsx
import { Text } from '@satinhq/kit'
import { GridItem, LazyVGrid } from '@satinhq/kit'

const columns = [GridItem.fixed(80), GridItem.flexible({ minimum: 40 })]
<LazyVGrid columns={columns} spacing={8}>
  <Text>Label</Text>
  <Text>Value</Text>
</LazyVGrid>
```

`GridItem.fixed({ size: 80, spacing: 12, alignment: 'leading' })`, `GridItem.flexible({ minimum: 40 })` and `GridItem.adaptive({ minimum: 150, spacing: 16 })` create validated, frozen tracks. The numeric `fixed(80)` form remains supported. Track spacing follows its column or row; the last explicit track has no trailing gap. Flexible tracks default to a 10-point minimum. Maximum bounds are optional. One adaptive descriptor repeats to fit the available space. Mixed adaptive descriptors remain unsupported.

## LazyHGrid

```tsx
import { Text } from '@satinhq/kit'
import { GridItem, LazyHGrid } from '@satinhq/kit'

<LazyHGrid rows={[GridItem.fixed(44), GridItem.fixed(44)]} spacing={8}>
  <Text>Top</Text>
  <Text>Bottom</Text>
</LazyHGrid>
```

All five layout APIs are stable exports. They render eagerly with no viewport virtualization; use List for long data. `LazyVGrid.spacing` is row spacing and `LazyHGrid.spacing` is column spacing. Track spacing and line spacing each default to 8 points independently. Grid alignment is leading/center/trailing for vertical grids and top/center/bottom for horizontal grids. Track alignment places intrinsic content inside its cell; a content `frame={{ maxWidth: 'infinity' }}` consumes the full cell width. Grid/GridRow and pinned headers remain unsupported.

## Shared props

```tsx
import { Text } from '@satinhq/kit'

<Text
  padding
  frame={{ maxWidth: 'infinity', alignment: 'leading' }}
  background="#eee"
>
  Full-width label
</Text>
```

`padding` means the default 16-point inset. A number applies to every edge; an object accepts top, bottom, leading, trailing, horizontal and vertical, with explicit edges taking precedence. `frame` accepts width, height, minimum and maximum bounds; maximum width/height may be `infinity`. Percentage height needs a bounded parent, as in CSS. `background` accepts a CSS background value. Shared foregroundStyle accepts primary, secondary, tertiary or a CSS color. An explicit `style` overrides generated CSS.

Padding applies to the content, frame wraps it with independent horizontal and vertical alignment, and background covers that frame. A wrapper is created only when a frame is requested. Arbitrary modifier ordering and proposal-priority layout remain deferred. The API is opt-in.

LazyVStack/LazyVGrid do not yet support `pinnedViews`. Section outside List still has list styling; use ordinary semantic headings and grouping for now. Neutral Section and pinned headers are unsupported.
