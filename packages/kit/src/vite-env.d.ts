interface ImportMetaEnv {
  readonly BASE_URL?: string
  readonly SATIN_FLOW_SHELL?: boolean
  readonly DEV: boolean
  readonly SATIN_BUILD_INFO?: import('./app/buildInfo.ts').BuildInfo
  readonly MODE: string
  readonly SATIN_STRICT_GLASS?: boolean | '1'
  readonly SATIN_DEV_MENU?: boolean
  readonly SATIN_DEV_MENU_CONFIG?: import('./dev-menu/types.ts').DevMenuBuild
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
