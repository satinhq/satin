import { collection, defineDatabase } from '@satinhq/kit'

export type Favourite = { id: string; savedAt: number; label: string }

// Keep the database name stable across app renames. Change its version only
// with an ordered migration; TypeScript types do not validate imported JSON.
export const db = defineDatabase({
  name: 'my-satin-app',
  version: 2,
  collections: { favourites: collection<Favourite>({ key: 'id', indexes: { byDate: 'savedAt' } }) },
  migrations: {
    2: async tx => {
      await tx.favourites.updateAll(item => ({ ...item, label: item.label ?? item.id }))
    },
  },
})
