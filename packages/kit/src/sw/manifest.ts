import { open } from 'node:fs/promises'
import { mediaTypes } from '../app/mediaTypes.ts'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join, posix, relative, resolve, sep } from 'node:path'

const GENERATED_FILE = /(?:^|\/)(?:sw\.js|satin-version\.json|precache-manifest\.[a-f0-9]+\.json)$/u
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2'])
const ICON_EXTENSIONS = new Set(['.avif', '.ico', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const SCRIPT_AND_STYLE_EXTENSIONS = new Set(['.css', '.js', '.mjs'])
const ICON_FILE = /(?:^|[-_.])(?:apple-touch-)?(?:favicon|icon|icons)(?:[-_.]|$)/iu
const VITE_HASH = /(?:^|[-_.])[a-z0-9_-]{8,}(?=\.[^.]+$)/iu

export interface AppShellPrecacheEntry {
  readonly bytes?: number
  readonly revision: string | null
  readonly url: string
}

export interface AppShellPrecacheManifest {
  /** Network-only transport probe; null explicitly means no bundled media. */
  readonly mediaProbe?: {
    readonly url: string
    readonly bytes: number
    readonly prefix: string
    readonly type: string
  } | null
  readonly buildId: string
  /** Build-local identifier; the worker prefixes its exact registration scope at runtime. */
  readonly cacheName: string
  readonly cachePrefix: string
  readonly entries: readonly AppShellPrecacheEntry[]
  readonly format: 1
  readonly shellUrl: string
}

export interface DeriveAppShellManifestOptions {
  readonly mediaProbe?: string
  readonly shellFile?: string
  readonly shellUrl?: string
  readonly additionalPrecache?: readonly string[]
  readonly base?: string
  readonly bundleFiles?: ReadonlySet<string>
  readonly cachePrefix?: string
  readonly outDir: string
}

function digest(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeBase(base = '/') {
  if (!base.startsWith('/')) {
    throw new Error(
      `Satin app-shell base must be a same-origin absolute path; received ${JSON.stringify(base)}.`,
    )
  }

  const normalized = posix.normalize(base)
  return normalized === '/' ? '/' : `/${normalized.replace(/^\/+|\/+$/gu, '')}/`
}

function normalizeOutputPath(file: string) {
  const normalized = file.split(sep).join('/').replace(/^\/+/, '')
  if (!normalized || normalized === '.' || normalized.startsWith('../')) {
    throw new Error(`Satin app-shell entry escapes the build output: ${JSON.stringify(file)}.`)
  }
  return normalized
}

function outputUrl(file: string, base: string) {
  if (file === 'index.html') return base
  return posix.join(base, file)
}

function isDefaultPrecacheFile(file: string) {
  if (file === 'index.html') return true

  const extension = extname(file).toLowerCase()
  if (SCRIPT_AND_STYLE_EXTENSIONS.has(extension)) return true
  if (FONT_EXTENSIONS.has(extension)) return true
  if (extension === '.webmanifest') return true
  return ICON_EXTENSIONS.has(extension) && ICON_FILE.test(basename(file))
}

function isHashedBuildAsset(file: string) {
  return file.startsWith('assets/') && VITE_HASH.test(basename(file))
}

async function outputFiles(outDir: string) {
  const files: string[] = []

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async entry => {
        const absolute = join(directory, entry.name)
        if (entry.isDirectory()) {
          await visit(absolute)
          return
        }
        if (!entry.isFile()) return
        files.push(normalizeOutputPath(relative(outDir, absolute)))
      }),
    )
  }

  await visit(outDir)
  return files.sort()
}

function assertCachePrefix(cachePrefix: string) {
  if (!cachePrefix || !/^[a-z0-9._-]+$/iu.test(cachePrefix)) {
    throw new Error(
      'Satin app-shell cachePrefix must contain only letters, numbers, dot, underscore, and hyphen.',
    )
  }
}

export async function deriveAppShellManifest({
  mediaProbe: requestedMediaProbe,
  shellFile = 'index.html',
  shellUrl: requestedShellUrl,
  additionalPrecache = [],
  base: requestedBase,
  bundleFiles = new Set<string>(),
  cachePrefix = 'satin-app-shell-',
  outDir: requestedOutDir,
}: DeriveAppShellManifestOptions): Promise<AppShellPrecacheManifest> {
  assertCachePrefix(cachePrefix)
  const base = normalizeBase(requestedBase)
  const outDir = resolve(requestedOutDir)
  const actualFiles = await outputFiles(outDir)
  const actualFileSet = new Set(actualFiles)
  const probeFile =
    requestedMediaProbe === undefined
      ? actualFiles.find(file => mediaTypes[extname(file).toLowerCase()])
      : normalizeOutputPath(requestedMediaProbe)
  let mediaProbe: AppShellPrecacheManifest['mediaProbe'] = null
  if (probeFile) {
    if (!actualFileSet.has(probeFile) || !mediaTypes[extname(probeFile).toLowerCase()])
      throw new Error(`Satin media probe must be an emitted media file: ${probeFile}.`)
    const handle = await open(resolve(outDir, probeFile), 'r')
    try {
      const { size } = await handle.stat()
      if (size < 2 || !Number.isSafeInteger(size))
        throw new Error('Satin media probe needs at least two bytes.')
      const prefix = Buffer.alloc(2)
      const read = await handle.read(prefix, 0, 2, 0)
      if (read.bytesRead !== 2) throw new Error('Satin media probe changed during build.')
      mediaProbe = {
        url: outputUrl(probeFile, base),
        bytes: size,
        prefix: prefix.toString('hex'),
        type: mediaTypes[extname(probeFile).toLowerCase()]!,
      }
    } finally {
      await handle.close()
    }
  }
  const normalizedBundleFiles = new Set(
    [...bundleFiles].map(normalizeOutputPath).filter(file => extname(file) !== '.map'),
  )
  const normalizedAdditional = additionalPrecache.map(normalizeOutputPath)

  for (const file of [...normalizedBundleFiles, ...normalizedAdditional]) {
    if (!actualFileSet.has(file)) {
      throw new Error(`Satin precache entry ${JSON.stringify(file)} is absent from ${outDir}.`)
    }
  }

  const selectedFiles = actualFiles.filter(
    file =>
      !GENERATED_FILE.test(file) &&
      (file === shellFile ||
        normalizedBundleFiles.has(file) ||
        normalizedAdditional.includes(file) ||
        isDefaultPrecacheFile(file)),
  )

  if (!selectedFiles.includes(shellFile)) {
    throw new Error(`Satin app-shell could not find index.html in ${outDir}.`)
  }

  const entries = await Promise.all(
    selectedFiles.map(async (file): Promise<AppShellPrecacheEntry> => ({
      bytes: (await readFile(resolve(outDir, file))).byteLength,
      revision: isHashedBuildAsset(file) ? null : digest(await readFile(resolve(outDir, file))),
      url: file === shellFile ? (requestedShellUrl ?? base) : outputUrl(file, base),
    })),
  )
  entries.sort((left, right) => left.url.localeCompare(right.url))

  const shellUrl = requestedShellUrl ?? base
  const buildId = digest(JSON.stringify({ entries, format: 1, shellUrl, mediaProbe })).slice(0, 20)

  return {
    buildId,
    mediaProbe,
    cacheName: `${cachePrefix}${buildId}`,
    cachePrefix,
    entries,
    format: 1,
    shellUrl,
  }
}
