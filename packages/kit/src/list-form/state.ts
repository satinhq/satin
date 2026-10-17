export function clampStepper(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(step) || step === 0 || min > max)
    throw new Error('Invalid stepper bounds or step.')
  return Math.min(max, Math.max(min, value + step))
}

export function pickerSelection(
  options: readonly { id: string; label: string }[],
  id: string,
): string | undefined {
  return options.find(option => option.id === id)?.label
}
