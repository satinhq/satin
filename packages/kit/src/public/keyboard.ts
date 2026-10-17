import {
  useKeyboardMetrics as useInternalKeyboardMetrics,
  type KeyboardMetrics as InternalKeyboardMetrics,
} from '../keyboard/adapter.ts'
/** The keyboard's current geometry in points, plus the software keyboard height to plan for at
 * this window size. */
export type KeyboardMetrics = Omit<InternalKeyboardMetrics, 'presentation' | 'anticipated'>
/** Returns the keyboard's geometry in points and re-renders as it changes. `expectedHeight` is the
 * keyboard height to plan for before the keyboard has shown. */
export function useKeyboardMetrics(): KeyboardMetrics {
  const {
    presentation: _presentation,
    anticipated: _anticipated,
    ...geometry
  } = useInternalKeyboardMetrics()
  return geometry
}
