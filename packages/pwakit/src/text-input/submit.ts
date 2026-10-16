/** Enter confirms an IME candidate before it can submit the field. */
export function shouldSubmitField(event: {
  key: string
  defaultPrevented: boolean
  keyCode: number
  nativeEvent: { isComposing: boolean }
}) {
  return (
    !event.defaultPrevented &&
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing &&
    event.keyCode !== 229
  )
}
