import type { AppDefinition } from './definition.ts'

/** Device support and installed-app admission are separate decisions. No URL can override them. */
export function resolvePlatformGate(
  platforms: AppDefinition['platforms'],
  iosWebKit: boolean,
  standalone: boolean,
  updateProfile: AppDefinition['updateProfile'],
  devServer: boolean,
): 'run' | 'install' | 'unsupported' {
  if (platforms === 'all') return 'run'
  if (!iosWebKit) return 'unsupported'
  if (standalone || devServer || updateProfile === 'preview') return 'run'
  return 'install'
}
