/** A diagnostic installation failure recorded before app launch. */
export interface InstallationFailure {
  buildId: string
  url: string
  reason: string
  networkFailure: boolean
  recordedAt?: number
}

/** Reads the recorded installation failure for acceptance fixtures. */
export function readInstallationFailure(scope: string): InstallationFailure | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem('satin-install-failure:' + scope) ?? 'null',
    )
    if (!value || typeof value !== 'object') return null
    const failure = value as InstallationFailure
    if (typeof failure.url !== 'string' || typeof failure.reason !== 'string') return null
    const success = readInstallationSuccess(scope)
    if (success) {
      const successTime = Number.isFinite(success.recordedAt) ? success.recordedAt : undefined
      const failureTime = Number.isFinite(failure.recordedAt) ? failure.recordedAt : undefined
      if (successTime !== undefined && (failureTime === undefined || successTime >= failureTime))
        return null
      // Legacy records have no timestamp; success for that exact build supersedes its failure.
      if (
        successTime === undefined &&
        failureTime === undefined &&
        success.buildId === failure.buildId
      )
        return null
    }
    return failure
  } catch {
    return null
  }
}

export function readInstallationSuccess(
  scope: string,
): { buildId: string; recordedAt?: number } | null {
  try {
    const value = JSON.parse(localStorage.getItem('satin-install-success:' + scope) ?? 'null')
    return typeof value?.buildId === 'string'
      ? { buildId: value.buildId, recordedAt: value.recordedAt }
      : null
  } catch {
    return null
  }
}
