# Form

A scrollable group of fields and settings.

```tsx
import { Form, Toggle, TextField } from '@satinhq/kit'
```

## Example

Click Notifications to change the setting.

<!-- example: form open -->

```tsx
import { useState } from 'react'
import { Form, Screen, Section, TextField, Toggle } from '@satinhq/kit'

function Example() {
  const [name, setName] = useState('Alex')
  const [notifications, setNotifications] = useState(true)

  return (
    <Screen>
      <Form id="settings">
        <Section header="Preferences">
          <TextField label="Name" value={name} onChange={setName} />
          <Toggle label="Notifications" isOn={notifications} onChange={setNotifications} />
        </Section>
      </Form>
    </Screen>
  )
}
```

## Bind each field

Store editable values in React state. Pass the current value and its setter to each control.

## Describe a group

Use a Section header for its name and a footer for explanatory text. Form uses grouped rows without extra CSS.

## API

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | A stable scroll region name. |
| `children` | `ReactNode` | Sections and controls. |
| `searchable` | `Searchable` | Optional search configuration. |

Related: [Quick start](../learn/quick-start.md), [List](../components/list.md), [Screen](../components/screen.md).
