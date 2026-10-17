import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { focusFromFramework } from '../focus/programmaticFocus.ts'
import { validateSearchPresentation, type Searchable, type SearchSuggestion } from './searchable.ts'

/*
 * The state of one `searchable` field, whatever draws it: presentation (owned or controlled by
 * `isPresented:`), text changes, submission and suggestion completion search
 * controller. The bottom toolbar field uses it (SearchToolbarField.tsx); the navigation bar drawer
 * keeps its own copy until reference adopts this hook (spec notes, reference construction update).
 */
export function useSearchPresentation(
  configuration: Searchable,
  input: RefObject<HTMLInputElement | null>,
) {
  validateSearchPresentation(configuration)
  const [ownPresented, setOwnPresented] = useState(false)
  const presented = configuration.isPresented ?? ownPresented
  const [submittedText, setSubmittedText] = useState<string | null>(null)
  const configurationRef = useRef(configuration)
  useLayoutEffect(() => {
    configurationRef.current = configuration
  })
  const mounted = useRef(false)

  const setPresented = useCallback((next: boolean) => {
    const current = configurationRef.current
    if (current.isPresented === undefined) setOwnPresented(next)
    current.onPresentedChange?.(next)
  }, [])

  const present = () => {
    if (!presented) setPresented(true)
  }
  const dismiss = () => {
    input.current?.blur()
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
  const complete = (suggestion: SearchSuggestion) => {
    change(suggestion.text)
    if (input.current) focusFromFramework(input.current, { preventScroll: true })
  }

  // Native presents the field focused, including a programmatic `isPresented`.
  useEffect(() => {
    const element = input.current
    if (presented && element && document.activeElement !== element && mounted.current) {
      focusFromFramework(element, { preventScroll: true })
    }
    mounted.current = true
  }, [presented, input])

  const suggestions =
    presented && submittedText !== configuration.text ? (configuration.suggestions ?? []) : []
  return { presented, present, dismiss, change, submit, complete, suggestions }
}
