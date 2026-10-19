import { useContext } from 'react'
import { SearchEnvironmentContext } from './SearchEnvironment.tsx'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { validateSearchPresentation, type Searchable, type SearchSuggestion } from './searchable.ts'

/*
 * Drawer and toolbar fields share presentation, focus, submission and suggestion completion.
 * Placement must not change whether clearing, submitting or controlled dismissal exits search.
 */
export function useSearchPresentation(
  configuration: Searchable,
  input: RefObject<HTMLInputElement | null>,
  pad = false,
) {
  validateSearchPresentation(configuration)
  const [ownPresented, setOwnPresented] = useState(false)
  const [focused, setFocused] = useState(false)
  const presented = configuration.isPresented ?? ownPresented
  const [submittedText, setSubmittedText] = useState<string | null>(null)
  const configurationRef = useRef(configuration)
  useLayoutEffect(() => {
    configurationRef.current = configuration
  })
  const mounted = useRef(false)
  const dismissing = useRef(false)

  const setPresented = useCallback((next: boolean) => {
    const current = configurationRef.current
    if (current.isPresented === undefined) setOwnPresented(next)
    current.onPresentedChange?.(next)
  }, [])

  const present = () => {
    if (pad) setFocused(true)
    if (!presented) setPresented(true)
  }
  const dismiss = () => {
    dismissing.current = true
    input.current?.blur()
    dismissing.current = false
    setSubmittedText(null)
    if (configurationRef.current.text) configurationRef.current.onTextChange('')
    setPresented(false)
  }
  const change = (text: string) => {
    setSubmittedText(null)
    configuration.onTextChange(text)
  }
  const submit = () => {
    setSubmittedText(configuration.text)
    input.current?.blur()
    configuration.onSubmit?.()
  }
  // An empty iPad field collapses on resigning focus. Submitted text stays
  // visible and expanded; clearing is a separate action from keyboard dismissal.
  const resign = () => {
    if (pad) setFocused(false)
    if (pad && !dismissing.current && presented && !configurationRef.current.text)
      setPresented(false)
  }
  const complete = (suggestion: SearchSuggestion) => {
    change(suggestion.text)
    if (input.current) focusFromFramework(input.current, { preventScroll: true })
  }

  // Native presents the field focused, including a programmatic `isPresented`.
  useEffect(() => {
    const element = input.current
    if (presented && element && document.activeElement !== element && (pad || mounted.current)) {
      focusFromFramework(element, { preventScroll: true })
    }
    if (!presented && element === document.activeElement) element?.blur()
    mounted.current = true
  }, [presented, input, pad])

  const environment = useContext(SearchEnvironmentContext)
  useLayoutEffect(() => {
    environment?.update(presented, dismiss)
  })

  useLayoutEffect(() => () => environment?.update(false, () => {}), [environment])

  const suggestions =
    presented && (!pad || focused) && submittedText !== configuration.text
      ? (configuration.suggestions ?? [])
      : []
  return { presented, present, dismiss, change, submit, complete, suggestions, resign }
}
