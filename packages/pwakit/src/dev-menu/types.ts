export interface DevMenuBuild {
  readonly version: string
  readonly branch: string
  readonly commit: string
  readonly frameworkVersion: string
  readonly builtAt: string
  readonly statusUrl?: string
}
