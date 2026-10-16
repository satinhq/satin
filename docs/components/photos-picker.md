# PhotosPicker

Selects one photo or video using a real file input. The browser chooses the source menu and picker UI. This does not embed Apple's PhotosUI framework.

`selection` is the accepted `File | null`; `onSelectionChange` receives a new File. `matching` accepts `images`, `videos`, or `imagesAndVideos`. `capture="user"` or `"environment"` supplies a browser camera preference, not a camera guarantee. No photo-library permission probe runs.

The browser may offer Photo Library, camera or Files. The control does not expose PhotosPickerItem identifiers, ordered multi-selection, persistent library access, or native filter objects. File decoding, object URLs, storage and validation belong to the app.

## Example

Choose a photo to read its file name. Cancel keeps the current selection.

<!-- example: photos-picker open -->

```tsx
import { useState } from 'react'
import { PhotosPicker, LabeledContent, List, Screen, Section } from '@satinhq/kit'

function Example() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [message, setMessage] = useState('No photo selected')

  return (
    <Screen>
      <List id="example">
        <Section>
          <PhotosPicker
            selection={photo}
            onSelectionChange={file => {
              setPhoto(file)
              setMessage(file.name)
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
