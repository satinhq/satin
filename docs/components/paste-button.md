# PasteButton

Reads plain text with the async Clipboard API inside the user's press. `onPaste` receives a string, which can be empty. `onError` is required and receives permission, unsupported-platform or read failures.

WebKit may show its own Paste confirmation before returning text. Dismissal and denial cannot be reliably distinguished. The component never reads clipboard contents during render or probes whether a paste is available. It cannot pre-disable itself based on clipboard contents.

This version supports plain text only. Structured clipboard objects and images are unsupported. No hidden editable field, synthetic paste, permission polling or clipboard cache bypasses WebKit's prompt.

## Example

Copy some text, then press Paste and approve WebKit’s paste prompt if shown.

<!-- example: paste-button open -->

```tsx
import { useState } from 'react'
import { PasteButton, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [message, setMessage] = useState('No text pasted')

  return (
    <Screen>
      <List id="example">
        <Section>
          <PasteButton
            onPaste={text => setMessage(text || 'Clipboard contains no text')}
            onError={error => setMessage(error.message)}
          />
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

Platform reference: [WebKit async clipboard](https://webkit.org/blog/10855/async-clipboard-api/).
