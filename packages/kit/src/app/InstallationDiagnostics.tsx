import { useEffect, useState } from 'react'
import { NavigationRow, Section, ValueRow } from '../list-form/ListForm.tsx'

import { readInstallationFailure, readInstallationSuccess } from './installationFailure.ts'
export { readInstallationFailure, type InstallationFailure } from './installationFailure.ts'

/** The app scope whose installation receipts are shown. */
export type InstallationDiagnosticsProps = { scope: string }
/** Shows the app's installation receipts, for an optional diagnostics screen in Settings. Pass the
 * app's scope. */
export function InstallationDiagnostics({ scope }: InstallationDiagnosticsProps) {
  const [failure, setFailure] = useState(() => readInstallationFailure(scope))
  const [success, setSuccess] = useState(() => readInstallationSuccess(scope))
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const refresh = () => {
      setFailure(readInstallationFailure(scope))
      setSuccess(readInstallationSuccess(scope))
    }
    refresh()
    window.addEventListener('satin-install-diagnostics', refresh)
    return () => window.removeEventListener('satin-install-diagnostics', refresh)
  }, [scope])
  return (
    <Section header="Settings">
      <NavigationRow
        onPress={() => setExpanded(value => !value)}
        accessibilityLabel="Diagnostics"
        label="Diagnostics"
      />
      {expanded && <ValueRow label="Last installation" value={failure ? 'Failed' : 'Ready'} />}
      {expanded && (failure || success) && (
        <ValueRow label="Build" value={(failure ?? success)!.buildId} />
      )}
      {expanded && failure && <ValueRow label="Resource" value={failure.url} />}
      {expanded && failure && <ValueRow label="Reason" value={failure.reason} />}
      {expanded && failure && (
        <ValueRow
          label="Fix"
          value={
            failure.networkFailure
              ? 'Check your connection and try again.'
              : 'Deploy the complete matching build, then retry.'
          }
        />
      )}
    </Section>
  )
}
