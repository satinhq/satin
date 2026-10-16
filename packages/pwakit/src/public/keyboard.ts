import {
  useKeyboardMetrics as useInternalKeyboardMetrics,
  type KeyboardMetrics as InternalKeyboardMetrics,
} from '../keyboard/adapter.ts'
export type KeyboardMetrics = Omit<InternalKeyboardMetrics, 'presentation' | 'anticipated'>
/** Keyboard geometry in points, including the expected software-keyboard height. */
export function useKeyboardMetrics(): KeyboardMetrics {
  const {
    presentation: _presentation,
    anticipated: _anticipated,
    ...geometry
  } = useInternalKeyboardMetrics()
  return geometry
}
