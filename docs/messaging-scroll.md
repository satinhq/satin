# Messaging scroll

`ScrollView` and `List` own scrolling geometry. Use the public `defaultScrollAnchor`,
`maintainVisibleContentPosition`, `scrollPosition` and target contracts in their
typed props. Do not reach into framework scroll nodes or add a second scroll owner.

For a bottom-anchored conversation, `defaultScrollAnchor="bottom"` controls initial
and short-content alignment. `maintainVisibleContentPosition` preserves a visible
message when items are inserted or removed. Use stable item identities and declare
targets with `ScrollTarget`. Do not use array indices as message identities.

The `scrollPosition` binding reads and requests the supported target or edge
position. The framework owns pinning, layout observation and restore. Use `SafeAreaInset edge="bottom"` for supported bottom content. Its accessory
height feeds the enclosed scroll geometry and aligned overlays. Do not add a separate application inset or scroll owner.

## Growing message composer

Put the composer in the bottom `SafeAreaInset` accessory. It reserves room for
the composer and owns keyboard and home-indicator clearance for the thread.
The field is configured to grow from one to six lines; after that, the editor
scrolls internally. The send button is laid out beside the field at its bottom
edge. Growth and send motion have unresolved limitations described below.

<!-- compile -->

```tsx
import { useRef, useState } from 'react'
import {
  Button,
  Divider,
  GlassEffect,
  HStack,
  SafeAreaInset,
  Screen,
  ScrollTarget,
  ScrollView,
  Text,
  TextEditor,
  VStack,
  semanticColor,
} from '@satinhq/kit'

export function Conversation() {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([
    { id: 'welcome', text: 'Where shall we meet?' },
  ])
  const nextId = useRef(1)

  function submit() {
    const text = draft.trim()
    if (!text) return
    const message = { id: `message-${nextId.current++}`, text }
    setMessages(current => [...current, message])
    setDraft('')
  }

  return (
    <Screen title="Conversation">
      <SafeAreaInset
        edge="bottom"
        spacing={0}
        content={
          <HStack
            alignment="bottom"
            spacing={8}
            padding={{ horizontal: 16, vertical: 8 }}
            frame={{ maxWidth: 'infinity' }}
          >
            <GlassEffect
              shape={{ kind: 'roundedRectangle', cornerRadius: 22 }}
              style={{ flex: 1, minWidth: 0, padding: '11px 16px' }}
            >
              <TextEditor
                aria-label="Message"
                prompt="Message"
                value={draft}
                onChange={setDraft}
                minLines={1}
                maxLines={6}
              />
            </GlassEffect>
            <Button
              symbol="arrow.up"
              iconOnly
              aria-label="Send message"
              buttonStyle="glassProminent"
              disabled={!draft.trim()}
              onPress={submit}
            />
          </HStack>
        }
      >
        <ScrollView
          id="conversation"
          defaultScrollAnchor="bottom"
          maintainVisibleContentPosition
        >
          <VStack
            alignment="leading"
            spacing={12}
            padding
            frame={{ maxWidth: 'infinity' }}
          >
            <Text font="caption" foregroundStyle="secondary">Today</Text>
            <Divider />
            {messages.map(message => (
              <ScrollTarget key={message.id} id={message.id}>
                <VStack
                  alignment="leading"
                  padding={{ horizontal: 16, vertical: 8 }}
                  frame={{ maxWidth: 'infinity', alignment: 'leading' }}
                  background={semanticColor('secondarySystemBackground')}
                >
                  <Text>{message.text}</Text>
                </VStack>
              </ScrollTarget>
            ))}
          </VStack>
        </ScrollView>
      </SafeAreaInset>
    </Screen>
  )
}
```

This example keeps messages in memory. Connect `submit` to your save policy
before using it for persistent conversations.

`GlassEffect` selects the plain field style automatically. It supplies the
material and shape, but no padding. The example puts the field's content inset
on the glass wrapper once. The row's horizontal and vertical padding separates
the controls from the thread and screen edges. `spacing={0}` removes the inset's
default gap because the row already supplies that separation. These are recipe
choices; the default `padding` remains 16 points and the default inset gap remains
8 points.

`Text` and `semanticColor` follow appearance. `Divider` uses the framework's
separator color and device-pixel thickness. Give your message content deliberate
insets rather than copying raw label colors or drawing another separator.

Do not add keyboard height as thread padding, duplicate the safe-area bottom
inset, force the editor height, or measure a hidden copy of the draft.
`useKeyboardMetrics` reports keyboard state; `SafeAreaInset` owns avoidance.

### Append motion and remaining limitations

The stable `ScrollView` API provides insertion motion for a bottom-anchored
thread when the reader is at the bottom and is not touching the scroll surface.
Append a new message while retaining the preceding messages' keys and elements,
as `submit` does above. An empty thread's first insertion is also supported.
Readers who have scrolled up keep their reading position. Reduce Motion disables
the insertion animation. No `withAnimation` call or app-owned transform is needed.

While the thread is bottom-pinned, the framework also eases displacement from
composer inset changes and replacement of a terminal typing row, including when
a decorative tail remains. Streaming changes to an existing message and
prepending history do not trigger append motion. Stable keys preserve identity;
they do not supply keyed `List` reorder animation or a general message transition API.

Keep keyboard avoidance and composer sizing in the framework. If a layout fails,
report it with an installed-runtime recording rather than adding another app-owned
inset, text measurement or row-motion path.

Use the emitted `ScrollViewProps`, `ListProps`, `ScrollPositionBinding` and
`ScrollViewHandle` declarations for the exact options and handle methods. The
supported contract implements only the declared scroll options and does not provide a
general virtualization API.

## Floating control above a composer

Use this thread in place of the recipe's `ScrollView`, inside `SafeAreaInset`.
`Overlay alignment="bottom"` places the control above the composer, including
when the field grows. The button requests the last message's stable target.

<!-- compile -->

```tsx
import { useRef } from 'react'
import {
  Button,
  Overlay,
  ScrollTarget,
  ScrollView,
  Text,
  VStack,
  type ScrollViewHandle,
} from '@satinhq/kit'

export function ThreadWithJumpToLatest({ messages }: {
  messages: readonly { id: string; text: string }[]
}) {
  const scroll = useRef<ScrollViewHandle>(null)
  const latest = messages.at(-1)
  return (
    <Overlay
      alignment="bottom"
      content={
        <Button
          symbol="arrow.down"
          iconOnly
          aria-label="Scroll to latest message"
          buttonStyle="glass"
          disabled={!latest}
          onPress={() => {
            if (latest) scroll.current?.scrollTo(latest.id, 'bottom')
          }}
        />
      }
    >
      <ScrollView
        ref={scroll}
        id="conversation"
        defaultScrollAnchor="bottom"
        maintainVisibleContentPosition
      >
        <VStack alignment="leading" spacing={12} padding frame={{ maxWidth: 'infinity' }}>
          {messages.map(message => (
            <ScrollTarget key={message.id} id={message.id}>
              <Text>{message.text}</Text>
            </ScrollTarget>
          ))}
        </VStack>
      </ScrollView>
    </Overlay>
  )
}
```

The inset owns the gap; the overlay adds none. `Overlay` preserves the scroll
view's frame and leaves it drawable under the accessory. The framework moves the
control with the composer during keyboard changes. No app keyboard listener or
bottom-position calculation is needed. Installed touch and motion checks remain
separate from example compilation.
