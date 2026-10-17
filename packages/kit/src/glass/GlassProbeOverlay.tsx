import type { RefObject } from 'react'
import { lensLabel, storedFlag } from './glassProbeSettings.ts'
import type { ContentPage, tabPresentation } from './lens/tabPresentation.ts'
import type { ScreenId } from './lens/Scene.tsx'
import { previousTrace } from './lens/trace.ts'
import type { LensMode } from './renderSpecs.ts'
import type { PresentationGlassRuntime } from './GlassPresentation.tsx'

type OutputRef = RefObject<HTMLOutputElement | null>

/** Everything the probe page's diagnostics strip and controls panel read and drive. */
export type ProbeOverlayProps = {
  captureClean: boolean
  bridgeOutputRef: OutputRef
  pacingOutputRef: OutputRef
  gpuOutputRef: OutputRef
  passesOutputRef: OutputRef
  domOutputRef: OutputRef
  syncOutputRef: OutputRef
  clockOutputRef: OutputRef
  debugOutputRef: OutputRef
  buildStatusRef: OutputRef
  runtimeRef: RefObject<PresentationGlassRuntime | undefined>
  buildHealthRef: RefObject<Record<string, unknown>>
  loadedBuild: string
  tabBarVisible: boolean
  controlsOpen: boolean
  setControlsOpen: (open: boolean) => void
  bridgeEnabled: boolean
  glassEnabled: boolean
  lensMode: LensMode
  rimEnabled: boolean
  velocityFadeEnabled: boolean
  markers: boolean
  telemetryEnabled: boolean
  toggleBridge: () => void
  toggleGlass: () => void
  toggleLens: () => void
  toggleRim: () => void
  toggleVelocityFade: () => void
  toggleMarkers: () => void
  toggleTelemetry: () => void
  contentPage: ContentPage
  tabPolicy: ReturnType<typeof tabPresentation>
  tabBarProbe: boolean | undefined
  screen: ScreenId
  navigate: (next: ScreenId) => void
  selectPage: (next: ContentPage, offset?: number) => void
  backgroundOffset: number
  runtimeReady: boolean
  runtimeError: string | undefined
}

/** The probe page's diagnostics strip, build status, controls panel and runtime status. A render
 * function (called inline by GlassPresentation), not a component: the element tree is unchanged. */
export function renderProbeOverlay(props: ProbeOverlayProps) {
  const {
    captureClean,
    bridgeOutputRef,
    pacingOutputRef,
    gpuOutputRef,
    passesOutputRef,
    domOutputRef,
    syncOutputRef,
    clockOutputRef,
    debugOutputRef,
    buildStatusRef,
    runtimeRef,
    buildHealthRef,
    loadedBuild,
    tabBarVisible,
    controlsOpen,
    setControlsOpen,
    bridgeEnabled,
    glassEnabled,
    lensMode,
    rimEnabled,
    velocityFadeEnabled,
    markers,
    telemetryEnabled,
    toggleBridge,
    toggleGlass,
    toggleLens,
    toggleRim,
    toggleVelocityFade,
    toggleMarkers,
    toggleTelemetry,
    contentPage,
    tabPolicy,
    tabBarProbe,
    screen,
    navigate,
    selectPage,
    backgroundOffset,
    runtimeReady,
    runtimeError,
  } = props
  return (
    <>
      <aside
        style={{ visibility: captureClean ? 'hidden' : undefined }}
        className="satin-lens-diagnostics-strip"
        aria-label="Satin Glass rendering diagnostics"
      >
        <span>
          <b>BRIDGE</b>
          <output ref={bridgeOutputRef}>starting</output>
        </span>
        <span>
          <b>PACING</b>
          <output ref={pacingOutputRef}>--</output>
        </span>
        <span>
          <b>DIRECT GPU</b>
          <output ref={gpuOutputRef}>--</output>
        </span>
        <span>
          <b>PASSES</b>
          <output ref={passesOutputRef}>--</output>
        </span>
        <span>
          <b>DOM/MIRROR</b>
          <output ref={domOutputRef}>--</output>
        </span>
        <span>
          <b>SYNC</b>
          <output ref={syncOutputRef}>--</output>
        </span>
        <span className="satin-lens-diagnostics-wide">
          <b>DEBUG</b>
          <output ref={clockOutputRef}>0.0s</output> <output ref={debugOutputRef}>--</output>
        </span>
        <span className="satin-lens-diagnostics-wide">
          <b>PREV RUN</b>
          <output>{previousTrace()}</output>
        </span>
      </aside>

      <div
        style={{
          visibility: captureClean ? 'hidden' : undefined,
          position: 'absolute',
          top: 10,
          left: 12,
          zIndex: 70,
          maxWidth: 245,
          fontSize: 11,
          padding: '4px 6px',
          borderRadius: 5,
          background: '#fff',
          color: '#111',
          pointerEvents: 'none',
        }}
      >
        <output ref={buildStatusRef} style={{ display: 'block' }}>
          9c {loadedBuild} · checking server
        </output>
      </div>
      {!captureClean && tabBarVisible && storedFlag('trace', '1') === '1' ? (
        <button
          type="button"
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 70 }}
          onClick={() => setControlsOpen(true)}
        >
          Frame trace
        </button>
      ) : null}
      {controlsOpen ? (
        <aside className="satin-lens-controls-panel" aria-label="Satin Glass controls">
          <header>
            <strong>Satin Glass</strong>
            <button type="button" onClick={() => setControlsOpen(false)}>
              Done
            </button>
          </header>
          <div className="satin-lens-control-grid">
            <button type="button" onClick={toggleBridge}>
              {bridgeEnabled ? 'Bridge: on' : 'Bridge: off'}
            </button>
            <button type="button" onClick={toggleGlass}>
              {glassEnabled ? 'Glass: on' : 'Glass: off'}
            </button>
            <button type="button" onClick={toggleLens}>
              Lens: {lensLabel(lensMode)}
            </button>
            <button type="button" onClick={toggleRim}>
              {rimEnabled ? 'Rim: on' : 'Rim: off'}
            </button>
            <button type="button" onClick={toggleVelocityFade}>
              {velocityFadeEnabled ? 'Velocity fade: on' : 'Velocity fade: off'}
            </button>
            <button type="button" onClick={toggleMarkers}>
              {markers ? 'Markers: on' : 'Markers: off'}
            </button>
            <button type="button" onClick={toggleTelemetry}>
              {telemetryEnabled ? 'Telemetry: on' : 'Telemetry: off'}
            </button>
            <button type="button" onClick={() => runtimeRef.current?.resetMetrics()}>
              Reset metrics
            </button>
            <button
              type="button"
              onClick={() => {
                const data = {
                  build: document.querySelector<HTMLScriptElement>('script[type="module"]')?.src,
                  buildHealth: buildHealthRef.current,
                  appState: {
                    page: contentPage,
                    tabPresentation: tabPolicy,
                    tabProbeOverride: tabBarProbe ?? 'default',
                  },
                  ...runtimeRef.current?.exportFrameTrace(),
                }
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data)], { type: 'application/json' }),
                )
                const link = document.createElement('a')
                link.href = url
                link.download = 'satin-glass-frames.json'
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 60000)
              }}
            >
              Export frames + GPU report
            </button>
            <button type="button" onClick={() => runtimeRef.current?.setScroll(620)}>
              Seam position
            </button>
            <button type="button" onClick={() => navigate(screen === 'root' ? 'general' : 'root')}>
              {screen === 'root' ? 'Open General' : 'Back to root'}
            </button>
            <button
              type="button"
              onClick={() =>
                selectPage(
                  contentPage === 'settings'
                    ? 'shapes'
                    : contentPage === 'shapes'
                      ? 'wallpaper'
                      : contentPage === 'wallpaper'
                        ? 'drag'
                        : 'settings',
                )
              }
            >
              Page: {contentPage}
            </button>
            <button
              type="button"
              onClick={() => selectPage(contentPage, (backgroundOffset + 137) % 702)}
            >
              Background offset: {backgroundOffset}
            </button>
          </div>
          <p>
            Semantic WebKit DOM remains visible. The moving WebGPU layer contains refracted content
            only; fixed DOM optics own tint, rims and highlights outside the bridge track.
          </p>
        </aside>
      ) : null}

      {!runtimeReady && !runtimeError ? (
        <div className="satin-lens-runtime-status">Initializing the WebGPU glass renderer…</div>
      ) : null}
      {runtimeError ? (
        <div className="satin-lens-runtime-error" role="alert">
          {runtimeError}
        </div>
      ) : null}
    </>
  )
}
