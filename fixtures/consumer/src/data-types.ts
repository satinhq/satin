import {
  collection,
  defineDatabase,
  param,
  useAppStorage,
  useSceneStorage,
  type Parameter,
} from '@satinhq/kit'
interface Reminder {
  id: string
  title: string
  completed: boolean
}
export const directCollection = collection<Reminder>({ key: 'id' })
const reminders = collection<Reminder>()({ key: 'id', indexes: { byTitle: 'title' } })
const db = defineDatabase({ name: 'consumer-data', version: 1, collections: { reminders } })
export async function readReminder(): Promise<Reminder | undefined> {
  return db.reminders.get('one')
}
const values: readonly ('home' | 'work')[] = ['home', 'work']
const choice = param.enum(values)
type Inferred = typeof choice extends Parameter<infer Value> ? Value : never
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
const literalInference: Equal<Inferred, 'home' | 'work'> = true
export { literalInference }
export const interfaceInference: Equal<
  Awaited<ReturnType<typeof db.reminders.get>>,
  Reminder | undefined
> = true
// @ts-expect-error Unknown fields remain errors for ordinary interfaces.
collection<Reminder>({ key: 'missing' })
// @ts-expect-error Collection primary keys must contain strings.
collection<Reminder>({ key: 'completed' })
// @ts-expect-error Only declared indexes are queryable.
db.reminders.query(query => query.index('missing'))
db.reminders.query(query => query.index('byTitle'))

export function NullableStorageConsumer() {
  const [photo, setPhoto] = useSceneStorage<string | null>('photo', null)
  const [preference, setPreference] = useAppStorage<string | null>('photo', null)
  setPhoto('photo.jpg')
  setPreference(previous => (previous === null ? 'photo.jpg' : null))
  // @ts-expect-error Values outside the declared nullable string type remain errors.
  setPhoto(1)
  // @ts-expect-error Functional app writes must return the declared value type.
  setPreference(() => false)
  return photo ?? preference
}
