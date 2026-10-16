/** Calibrated acceptance devices, in portrait CSS screen coordinates. */
export const STARTUP_SCREENS = [
  { width: 402, height: 874, ratio: 3 },
  { width: 440, height: 956, ratio: 3 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 1032, height: 1376, ratio: 2 },
] as const

export function startupImages(
  stem: string,
  light: string,
  dark: string,
  screens: readonly { width: number; height: number; ratio: number }[] = STARTUP_SCREENS,
) {
  // WebClips cache one startup bitmap at installation. Distinct palettes use
  // an icon on transparent pixels so the native cover can supply its current
  // system background. Identical palettes can safely bake in their color.
  return screens.flatMap(screen =>
    ['portrait', 'landscape'].flatMap(orientation =>
      [false, true].map(isDark => {
        const width = (orientation === 'portrait' ? screen.width : screen.height) * screen.ratio
        const height = (orientation === 'portrait' ? screen.height : screen.width) * screen.ratio
        return {
          file: `${stem}-launch-${screen.width}-${orientation}-${isDark ? 'dark' : 'light'}.png`,
          media: `(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: ${orientation}) and (prefers-color-scheme: ${isDark ? 'dark' : 'light'})`,
          width,
          height,
          ratio: screen.ratio,
          color: light === dark ? light : null,
        }
      }),
    ),
  )
}
