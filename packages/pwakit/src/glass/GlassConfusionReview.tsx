/** THESIS: recorded glass pairs lead; the viewer decides which is native.
 * OWN-WORLD: the lab's system type, neutral canvas and plain controls.
 * STORY: inspect at 2x, commit one guess, reveal, export the complete session.
 * FIRST VIEWPORT: one matched pair with its guess controls immediately below.
 * FORM: side-by-side experiment; no inferred acceptance verdict.
 */
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { useSafeAreaMetrics } from '../safe-area/useSafeAreaMetrics.ts'
import {
  makeConfusionSession,
  scoreConfusion,
  type ConfusionManifest,
  type ConfusionSession,
} from './confusionSession.ts'

function ReviewButton({ disabled, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        minHeight: 44,
        padding: '8px 14px',
        font: 'inherit',
        border: '1px solid #c5c5ca',
        borderRadius: 8,
        background: '#fff',
        color: '#171719',
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
    />
  )
}

export function GlassConfusionReview({ manifestUrl }: { manifestUrl: string }) {
  const [manifest, setManifest] = useState<ConfusionManifest>()
  const [session, setSession] = useState<ConfusionSession>()
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(2)
  const [frame, setFrame] = useState(0)
  const [storageNotice, setStorageNotice] = useState('')
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set())
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const pairViewport = useRef<HTMLDivElement>(null)
  const { layoutViewport, insets } = useSafeAreaMetrics()
  const key = `satin-glass-confusion:${manifestUrl}`
  useEffect(() => {
    let cancelled = false
    void fetch(manifestUrl, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Pair manifest returned ${response.status}`)
        const value = (await response.json()) as ConfusionManifest
        if (
          !Array.isArray(value.pairs) ||
          new Set(value.pairs.map(p => p.id)).size !== value.pairs.length
        )
          throw new Error('Invalid or duplicate comparison pairs')
        if (cancelled) return
        setManifest(value)
        let restored: ConfusionSession | undefined
        try {
          const raw = localStorage.getItem(key)
          if (raw) restored = JSON.parse(raw) as ConfusionSession
        } catch {
          setStorageNotice('Session storage is unavailable. Export your results before leaving.')
        }
        if (
          restored?.manifestVersion !== value.version ||
          !Array.isArray(restored.trials) ||
          restored.trials.length !== value.pairs.length ||
          new Set(restored.trials.map(t => t.pairId)).size !== value.pairs.length ||
          restored.trials.some(
            t => typeof t.nativeLeft !== 'boolean' || !value.pairs.some(p => p.id === t.pairId),
          )
        )
          restored = undefined
        const next = restored ?? makeConfusionSession(value)
        setSession(next)
        const unfinished = next.trials.findIndex(t => !t.revealed)
        setIndex(unfinished < 0 ? 0 : unfinished)
      })
      .catch(reason => {
        if (!cancelled) setError(String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [key, manifestUrl])
  useEffect(() => {
    if (!session) return
    try {
      localStorage.setItem(key, JSON.stringify(session))
    } catch {
      setStorageNotice('Session storage is unavailable. Export your results before leaving.')
    }
  }, [key, session])
  useEffect(() => {
    setFrame(0)
    setError('')
  }, [index])
  if (!manifest || !session) return <p role="status">{error || 'Loading recorded pairs…'}</p>
  const trial = session.trials[index]
  const pair = trial && manifest.pairs.find(p => p.id === trial.pairId)
  const score = scoreConfusion(session.trials.filter(t => t.revealed))
  const mediaReady = pair && loaded.has(pair.native) && loaded.has(pair.pwa)
  const mediaLoaded = (path: string) => setLoaded(previous => new Set([...previous, path]))
  const commit = (change: Partial<typeof trial>) =>
    setSession({
      ...session,
      trials: session.trials.map((t, i) => (i === index ? { ...t, ...change } : t)),
    })
  const seek = (next: number) => {
    setFrame(next)
    for (const video of videos.current)
      if (video && pair?.fps) {
        video.pause()
        video.currentTime = next / pair.fps
      }
  }
  const syncPan = (source: HTMLDivElement) => {
    for (const pane of pairViewport.current?.querySelectorAll<HTMLDivElement>(
      '[data-review-pane]',
    ) ?? []) {
      if (pane !== source && pane.scrollLeft !== source.scrollLeft)
        pane.scrollLeft = source.scrollLeft
    }
  }
  const exportResults = () => {
    const strata = ['appearance', 'backdrop', 'state'] as const
    const groups = Object.fromEntries(
      strata.map(field => [
        field,
        Object.fromEntries(
          [...new Set(manifest.pairs.map(p => p[field]))].map(value => [
            value,
            scoreConfusion(
              session.trials.filter(
                t => manifest.pairs.find(p => p.id === t.pairId)?.[field] === value,
              ),
            ),
          ]),
        ),
      ]),
    )
    const blob = new Blob(
      [
        JSON.stringify(
          {
            manifestUrl,
            manifest,
            session,
            score,
            groups,
            unscored: session.trials.filter(t => !t.guess).map(t => t.pairId),
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = `glass-confusion-${session.id}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <ScrollSurface
      id="glass-confusion-review"
      axis="vertical"
      style={{
        height: layoutViewport.height,
        padding: `20px 20px ${20 + insets.bottom}px`,
        background: '#f2f2f7',
        color: '#171719',
        fontFamily: '-apple-system, sans-serif',
        fontSize: 16,
        lineHeight: 1.4,
        colorScheme: 'light',
      }}
    >
      <header>
        <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Which one is native?</h1>
        <p>
          Inspect both recordings, then choose. Each pair appears once in a random order. Your first
          guess is final.
        </p>
      </header>
      {!pair ? (
        <p>No recorded pairs are available yet. Capture and registration are pending.</p>
      ) : (
        <>
          <p>
            {index + 1} of {session.trials.length} · {pair.appearance} · {pair.backdrop} ·{' '}
            {pair.state}
          </p>
          <label>
            Display size{' '}
            <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>
              <option value={1}>1× native size</option>
              <option value={2}>2× native size</option>
            </select>
          </label>
          <p>At 2×, drag either recording horizontally to pan both.</p>
          <div
            ref={pairViewport}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 16,
              margin: '16px 0',
              padding: 12,
              background: '#858585',
            }}
          >
            {(trial.nativeLeft ? [pair.native, pair.pwa] : [pair.pwa, pair.native]).map(
              (path, side) => (
                <figure key={`${pair.id}-${side}`} style={{ margin: 0, minWidth: 0 }}>
                  <figcaption style={{ background: '#fff', padding: 8, color: '#171719' }}>
                    {side === 0 ? 'Left' : 'Right'}
                    {trial.revealed
                      ? ` · ${(side === 0) === trial.nativeLeft ? 'Native' : 'PWA'}`
                      : ''}
                  </figcaption>
                  <ScrollSurface
                    id={`glass-confusion-pane-${side}`}
                    axis="horizontal"
                    data-review-pane
                    onScroll={event => syncPan(event.currentTarget)}
                  >
                    {pair.kind === 'still' ? (
                      <img
                        onLoad={() => mediaLoaded(path)}
                        src={path}
                        alt={`${side === 0 ? 'Left' : 'Right'} glass comparison`}
                        draggable={false}
                        style={{
                          display: 'block',
                          width: pair.widthPt * zoom,
                          maxWidth: 'none',
                          height: pair.heightPt * zoom,
                        }}
                        onError={() =>
                          setError('A comparison image could not load. Reload before guessing.')
                        }
                      />
                    ) : (
                      <video
                        onLoadedData={() => mediaLoaded(path)}
                        ref={element => {
                          videos.current[side] = element
                        }}
                        src={path}
                        playsInline
                        muted
                        preload="auto"
                        style={{
                          display: 'block',
                          width: pair.widthPt * zoom,
                          maxWidth: 'none',
                          height: pair.heightPt * zoom,
                        }}
                        onError={() =>
                          setError('A comparison clip could not load. Reload before guessing.')
                        }
                      />
                    )}
                  </ScrollSurface>
                </figure>
              ),
            )}
          </div>
          {pair.kind === 'clip' ? (
            <div>
              <ReviewButton
                type="button"
                onClick={() => {
                  for (const video of videos.current)
                    if (video) {
                      video.currentTime = 0
                      void video
                        .play()
                        .catch(() => setError('Playback failed. Use frame inspection.'))
                    }
                }}
              >
                Play both
              </ReviewButton>
              <ReviewButton type="button" onClick={() => seek(Math.max(0, frame - 1))}>
                Previous frame
              </ReviewButton>
              <ReviewButton
                type="button"
                onClick={() => seek(Math.min((pair.frames ?? 1) - 1, frame + 1))}
              >
                Next frame
              </ReviewButton>
              <label>
                Frame {frame}
                <input
                  type="range"
                  min={0}
                  max={(pair.frames ?? 1) - 1}
                  value={frame}
                  onChange={event => seek(Number(event.target.value))}
                />
              </label>
              <p>
                Frame stepping uses the retained aligned {pair.fps} Hz clips. Playback starts
                together but browser playback synchronization is not measurement evidence.
              </p>
            </div>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <ReviewButton
              type="button"
              disabled={!!trial.guess || !!error || !mediaReady}
              onClick={() => commit({ guess: 'left', guessedAt: new Date().toISOString() })}
            >
              Left is native
            </ReviewButton>
            <ReviewButton
              type="button"
              disabled={!!trial.guess || !!error || !mediaReady}
              onClick={() => commit({ guess: 'right', guessedAt: new Date().toISOString() })}
            >
              Right is native
            </ReviewButton>
            <ReviewButton
              type="button"
              disabled={!trial.guess || trial.revealed}
              onClick={() => commit({ revealed: true })}
            >
              Reveal answer
            </ReviewButton>
            <ReviewButton
              type="button"
              disabled={!trial.revealed || index + 1 === session.trials.length}
              onClick={() => setIndex(index + 1)}
            >
              Next pair
            </ReviewButton>
          </div>
          <p role="status">
            {trial.guess ? `Guess recorded: ${trial.guess}.` : 'Answer hidden until you guess.'}
          </p>
        </>
      )}
      <p>
        {score.count
          ? `${score.hits} correct out of ${score.count} guesses (${((score.hitRate ?? 0) * 100).toFixed(1)}%).`
          : 'No guesses recorded.'}{' '}
        Chance is 50%. A small sample near 50% does not establish indistinguishability.
      </p>
      <p>{manifest.status}</p>
      {manifest.pending.length ? (
        <details>
          <summary>Pending coverage</summary>
          <ul>
            {manifest.pending.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <ReviewButton type="button" onClick={exportResults}>
        Export guesses and coverage
      </ReviewButton>
      {storageNotice ? <p role="status">{storageNotice}</p> : null}
    </ScrollSurface>
  )
}
