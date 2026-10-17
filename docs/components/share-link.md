# ShareLink

Opens the platform share sheet using Web Share. Pass prepared `item` data containing `title`, `text`, `url`, or `files`. For files, prepare real File objects before the press; the framework checks `navigator.canShare({ files })` and never silently drops unsupported attachments.

`onCompletion` reports the browser's completed handoff, not delivery to a recipient. `onError` is required. An AbortError can mean dismissal or no suitable target; it is not proof of a user cancellation. Unsupported sharing or files report NotSupportedError. Other browser errors retain their names.

The operating system chooses share targets and previews. Structured transfer objects, custom previews and custom activity lists are unsupported. Keep `item` stable while sharing; changing its identity invalidates delivery to the old owner.

## Example

Press Share Note to open the system share sheet.

<!-- example: share-link open -->

```tsx
import { useState } from 'react'
import { ShareLink, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [message, setMessage] = useState('Ready to share')
  const [item] = useState(() => ({ text: 'A note shared from my app.' }))

  return (
    <Screen>
      <List id="example">
        <Section>
          <ShareLink
            item={item}
            onCompletion={() => setMessage('Share handoff complete')}
            onError={error =>
              setMessage(
                error.name === 'AbortError'
                  ? 'Share dismissed or no target available'
                  : error.message,
              )
            }
          >
            Share Note
          </ShareLink>
          <LabeledContent label="Result" value={message} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Action lifetime

Repeated presses are disabled while the browser operation is pending. An observed disabled, covered-screen or mount change suppresses its result. Key the control by draft identity when replacing a draft. This does not dismiss a system sheet or revoke work the platform has already accepted.

## Platform limits and evidence

Use an HTTPS installed app. Browser capability and permission policy still apply. Embedded docs previews may block these APIs; open the example in its own page when needed. The framework does not replace a system prompt with a simulated picker, share sheet or paste menu.

Software regression coverage is separate from installed-device acceptance. Installed selection, cancellation, focus return and touch feedback for this revision are pending; no native visual or motion parity is claimed.

Platform reference: [Web Share specification](https://www.w3.org/TR/web-share/).
