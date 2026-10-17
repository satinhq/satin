import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { preview, type PreviewServer } from 'vite'
import { satinApp } from './vite.ts'
import { defineApp } from '../public/definition.ts'
import { deriveAppShellManifest } from '../sw/manifest.ts'

it('serves real PCM media ranges and safe ordinary files through repository and Vite preview adapters', async () => {
  const root = await mkdtemp(
    resolve(process.env.SATIN_SCRATCH_ROOT ?? tmpdir(), 'media serving #%?-'),
  )
  const dist = resolve(root, 'dist')
  await mkdir(resolve(dist, 'app'), { recursive: true })
  await mkdir(resolve(dist, 'install'))
  await writeFile(resolve(dist, 'install/index.html'), '<script data-satin-install-check></script>')
  await mkdir(resolve(root, 'public'))
  await writeFile(
    resolve(root, 'public/icon.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64',
    ),
  )
  // A complete mono PCM WAV, four silent 16-bit samples. Not playback evidence.
  const wav = Buffer.alloc(52)
  wav.write('RIFF')
  wav.writeUInt32LE(44, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(8, 40)
  await writeFile(resolve(dist, 'song.wav'), wav)
  await writeFile(resolve(dist, 'index.html'), '<p>app</p>')
  await writeFile(resolve(dist, 'app/index.html'), '<p>app</p>')
  await writeFile(resolve(root, 'outside.wav'), 'outside')
  await symlink(resolve(root, 'outside.wav'), resolve(dist, 'escape.wav'))
  const inventory = await deriveAppShellManifest({ outDir: dist })
  let child: ChildProcess | undefined
  let vite: PreviewServer | undefined
  try {
    const free = createServer()
    await new Promise<void>(done => free.listen(0, '127.0.0.1', done))
    const port = (free.address() as { port: number }).port
    await new Promise<void>(done => free.close(() => done()))
    const serverScript = fileURLToPath(
      new URL('../../../../scripts/test-support/serve.mjs', import.meta.url),
    )
    child = spawn(process.execPath, [serverScript, dist, String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: root,
    })
    let serverError = ''
    child.stderr!.setEncoding('utf8').on('data', chunk => {
      serverError += chunk
    })
    await Promise.race([
      once(child.stdout!, 'data'),
      once(child, 'exit').then(([code]) => {
        throw new Error(`server exited ${code}: ${serverError}`)
      }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('server startup timeout')), 5000)
        timer.unref()
      }),
    ])
    const app = defineApp({
      name: 'Media',
      id: '/media',
      description: 'Transport fixture',
      advanced: { scope: '/fixed/', startRoute: '/fixed/' },
      icons: [{ src: '/fixed/icon.png', sizes: '512x512', type: 'image/png' }],
    })
    vite = await preview({
      configFile: false,
      root,
      base: '/fixed/',
      build: { outDir: 'dist' },
      plugins: satinApp(app),
      preview: { port: 0, host: '127.0.0.1', strictPort: true },
      logLevel: 'silent',
    })
    const vitePort = (vite.httpServer.address() as { port: number }).port
    for (const origin of [`http://127.0.0.1:${port}`, `http://127.0.0.1:${vitePort}/fixed`]) {
      const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
        fetch(origin + path, { headers, method })
      for (const [range, start, end] of [
        ['bytes=0-1', 0, 1],
        ['bytes=48-', 48, 51],
        ['bytes=-4', 48, 51],
        ['bytes=50-999999999999999999999999', 50, 51],
      ] as const) {
        const reply = await get('/song.wav', { Range: range })
        expect(reply.status).toBe(206)
        expect(reply.headers.get('content-type')).toBe('audio/wav')
        expect(reply.headers.get('content-range')).toBe(`bytes ${start}-${end}/52`)
        expect(reply.headers.get('content-length')).toBe(String(end - start + 1))
        expect(Buffer.from(await reply.arrayBuffer())).toEqual(wav.subarray(start, end + 1))
      }
      const bad = await get('/song.wav', { Range: 'bytes=999999999999999999999999-' })
      expect(bad.status).toBe(416)
      expect(bad.headers.get('content-range')).toBe('bytes */52')
      expect((await bad.arrayBuffer()).byteLength).toBe(0)
      const head = await get('/song.wav', { Range: 'bytes=0-1' }, 'HEAD')
      expect(head.status).toBe(200)
      expect(head.headers.get('content-length')).toBe('52')
      expect(head.headers.get('content-range')).toBeNull()
      expect((await head.arrayBuffer()).byteLength).toBe(0)
      for (const headers of [
        { Range: 'bytes=9-1' },
        { Range: 'bytes=0-1,4-5' },
        { Range: 'items=0-1' },
        { Range: 'bytes=0-1', 'If-Range': '"stale"' },
      ] as Record<string, string>[]) {
        const full = await get('/song.wav', headers)
        expect(full.status).toBe(200)
        expect(Buffer.from(await full.arrayBuffer())).toEqual(wav)
      }
      expect((await get('/missing.wav')).status).toBe(404)
      expect((await get('/escape.wav')).status).toBe(403)
      expect((await get('/%2e%2e%2foutside.wav')).status).toBe(403)
      expect((await get('/app/')).status).toBe(200)
      expect(await (await get('/install')).text()).toBe(
        '<script data-satin-install-check></script>',
      )
    }
    expect(inventory.mediaProbe).toEqual({
      url: '/song.wav',
      bytes: 52,
      prefix: '5249',
      type: 'audio/wav',
    })
    expect(inventory.entries.some(entry => entry.url === '/song.wav')).toBe(false)
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
    if (vite) {
      ;(vite.httpServer as Server).closeAllConnections()
      await new Promise<void>(done => vite!.httpServer.close(() => done()))
    }
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)
