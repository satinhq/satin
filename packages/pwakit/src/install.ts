/**
 * `@satinhq/kit/install`: building blocks for a custom install page, set with
 * `satinApp(app, { installPage: './src/Install.tsx' })`. Satin wraps that page: its head,
 * the platform gate and the deployment check run first, and the page only loads when the
 * deployment is sound. These read the page Satin built; they throw anywhere else.
 */
export {
  copyInstallLink,
  readInstallContext,
  type CopyLinkResult,
  type InstallApp,
  type InstallBrowser,
  type InstallContext,
  type InstallDevice,
} from './app/installContext.ts'
export { InstallSteps, InstallTip, useInstallContext } from './app/InstallComponents.tsx'
