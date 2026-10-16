# LazyVGrid, LazyHGrid and GridItem

Arrange a small collection in fixed, flexible or adaptive tracks. These are stable exports from `@satinhq/kit`. All children mount eagerly. There is no virtualization; use [List](list.md) for long data.

```tsx
import { GridItem, LazyVGrid, Text, VStack } from '@satinhq/kit'

<LazyVGrid
  columns={[GridItem.adaptive({ minimum: 150, spacing: 16 })]}
  spacing={20}
>
  {albums.map(album => (
    <VStack key={album.id} alignment="leading" frame={{ maxWidth: 'infinity' }}>
      <Text font="headline">{album.title}</Text>
      <Text foregroundStyle="secondary">{album.artist}</Text>
    </VStack>
  ))}
</LazyVGrid>
```

Each cell receives its track width. A fill frame uses it; an explicit width or intrinsic control may stay smaller. `GridItem` alignment places that smaller content within the cell.

| Option | Meaning |
| --- | --- |
| `GridItem.fixed({ size, spacing?, alignment? })` | Fixed track size in points. The older `fixed(size)` call also works. |
| `GridItem.flexible({ minimum?, maximum?, spacing?, alignment? })` | Flexible track, default minimum 10 points. |
| `GridItem.adaptive({ minimum, maximum?, spacing?, alignment? })` | Repeat one track to fit the available space. |
| Track `spacing` | Gap after this column in LazyVGrid or row in LazyHGrid. Default 8. No gap after the last explicit track. |
| Track `alignment` | Center, leading, trailing, top, bottom or a corner such as topLeading. Default center. |
| `LazyVGrid` | `columns`, horizontal `alignment` and `spacing` between rows. |
| `LazyHGrid` | `rows`, vertical `alignment` and `spacing` between columns. |

Grid line spacing defaults to 8 points independently of track spacing. Alignment is leading/center/trailing for LazyVGrid and top/center/bottom for LazyHGrid. Use ScrollView when the collection needs scrolling.

Mixed adaptive and explicit tracks, pinned headers and virtualization are unsupported. Adaptive tracks require a finite proposal on their track axis. Existing imports from `@satinhq/kit/unstable` remain compatible.
