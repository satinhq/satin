# FileImporter

Imports file bytes through the system file chooser. `FileImporter` requires a user gesture and does not expose a presentation flag that would open a chooser outside a user gesture.

Pass `selection` as the accepted File array and update it in `onSelectionChange`. `allowedContentTypes` accepts MIME strings or file extensions, for example `['application/pdf', '.txt']`. These are chooser hints, not content validation or Swift uniform type identifiers. `allowsMultipleSelection` defaults to false.

Returned Files are snapshots of selected bytes, not persistent filesystem URLs, directory access, or permission to overwrite the originals. WebKit owns the provider UI and may offer sources in addition to Files.

## Example

Choose files to read their names. Cancel keeps the current selection.

<!-- example: file-importer open -->

```tsx
import { useState } from 'react'
import { FileImporter, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [files, setFiles] = useState<File[]>([])
  const [message, setMessage] = useState('No files selected')

  return (
    <Screen>
      <List id="example">
        <Section>
          <FileImporter
            selection={files}
            allowsMultipleSelection
            onSelectionChange={selected => {
              setFiles(selected)
              setMessage(selected.map(file => file.name).join(', '))
            }}
            onError={error => setMessage(error.message)}
          />
          <LabeledContent label="Result" value={message} />
        </Section>
      </List>
    </Screen>
  )
}
```

## Selection lifetime

Cancel leaves the accepted selection unchanged. The input resets after delivery, allowing the same file to be selected again. Observed disabled, covered-screen, selection or mount changes invalidate an outstanding result. Key the picker by draft identity when replacing a draft whose selection has not changed. Browser events carry no chooser session ID, so overlapping choosers cannot be attributed exactly. Already-started decoding or storage is still app-owned.

## Platform limits and evidence

Use an HTTPS installed app. Browser capability and permission policy still apply. Embedded docs previews may block these APIs; open the example in its own page when needed. The framework does not replace a system prompt with a simulated picker, share sheet or paste menu.

Software regression coverage is separate from installed-device acceptance. Installed selection, cancellation, focus return and touch feedback for this revision are pending; no native visual or motion parity is claimed.

Platform reference: [HTML file upload state](https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)).
