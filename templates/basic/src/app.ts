import type { AppDefinitionInput } from '@satinhq/kit'

export const app = {
  id: 'my-satin-app',
  name: 'My Satin App',
  shortName: 'My Satin App',
  description: 'A personal app built with Satin.',
  icons: { source: '/icon-source.png' },
  appearance: {
    background: '#f2f2f7',
    darkLaunch: { background: '#000000' },
  },
} satisfies AppDefinitionInput
