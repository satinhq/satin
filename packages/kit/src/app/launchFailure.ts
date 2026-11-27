/** Only source-authored recovery copy may replace the generic launch sentence. */
export function launchFailure(reason: string, detail = reason, options?: ErrorOptions) {
  return Object.assign(new Error(detail, options), { satinLaunchReason: reason })
}

export function launchFailureReason(
  error: unknown,
  fallback = 'The app could not open. Please retry.',
) {
  return error !== null &&
    typeof error === 'object' &&
    'satinLaunchReason' in error &&
    typeof error.satinLaunchReason === 'string'
    ? error.satinLaunchReason
    : fallback
}
