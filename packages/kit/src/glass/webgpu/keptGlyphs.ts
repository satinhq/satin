/** Chrome glyph ink the renderer keeps after its slot took other ink, so the same ink can be
 * installed again by key, with no capture and no upload.
 *
 * The tab bar's ink follows the backdrop under the bar (tabGlyphContextStyle): entering a tab
 * whose content differs under the bar changes it, and coming back changes it again. Each change
 * was a capture of every tab's label and icon, a bitmap and an upload: 36 to 47 ms of capture and
 * 15 to 85 ms of upload in the Catalyst host, on every such tab switch, and asynchronous, so the
 * new backdrop could not be installed in the frame that shows the tab. A tab bar alternates
 * between a handful of inks; the last four stay in the renderer (on a phone about 12 MB each: a
 * 6 MB image and its 6 MB texture).
 *
 * This is the page's ledger of what the renderer keeps: the renderer keeps exactly the keys it
 * was told to `keep` and not yet told to `unkeep` (worker protocol, `source-images`). */
export class KeptGlyphs {
  /** Kept ink by slot and signature, least recently used first. */
  private kept = new Map<string, string>()
  /** Keys the renderer still holds for ink this ledger has forgotten. */
  private dropped: string[] = []
  private readonly limit: number
  constructor(limit = 4) {
    this.limit = limit
  }
  private static entry(id: string, signature: string) {
    return `${id}\n${signature}`
  }
  /** The key of the kept image of this ink, when the renderer has one. */
  find(id: string, signature: string) {
    return this.kept.get(KeptGlyphs.entry(id, signature))
  }
  /** A slot is taking other ink: its outgoing ink is kept (most recently used), and the least
   * recently used ink beyond the limit is let go, never one that is `installed` now. Returns
   * the keys the batch that replaces the slot tells the renderer to keep and to let go. */
  replace(
    id: string,
    outgoing: { signature: string; key: string } | undefined,
    installed: readonly string[],
  ) {
    const keep: string[] = []
    if (outgoing) {
      const entry = KeptGlyphs.entry(id, outgoing.signature)
      this.kept.delete(entry)
      this.kept.set(entry, outgoing.key)
      keep.push(outgoing.key)
    }
    const unkeep = this.dropped.splice(0)
    for (const [entry, key] of this.kept) {
      if (this.kept.size <= this.limit) break
      if (installed.includes(key) || keep.includes(key)) continue
      this.kept.delete(entry)
      unkeep.push(key)
    }
    return { keep, unkeep }
  }
  /** Ink was installed again from its kept image: it is the most recently used. */
  used(id: string, signature: string) {
    const entry = KeptGlyphs.entry(id, signature)
    const key = this.kept.get(entry)
    if (key === undefined) return
    this.kept.delete(entry)
    this.kept.set(entry, key)
  }
  /** Forget every kept ink (fonts changed, or a failed batch left the renderer's slots unknown):
   * nothing is reused, and the next batch lets the renderer's images go. */
  reset() {
    this.dropped.push(...this.kept.values())
    this.kept.clear()
  }
}

/** The ink a surface installs in one source revision.
 *
 * Ink that would have to be captured while a new backdrop is being installed does not hold that
 * backdrop back: its capture is asynchronous (icon decodes, a bitmap), and waiting for it showed
 * the new tab's content over the previous tab's backdrop for the capture's whole duration. Such
 * a revision commits with the ink the surface has (`deferred`), and the next one captures the new
 * ink, whatever else it installs (`deferredBefore`). Ink the renderer keeps is installed at once, and so is the first ink of a surface (there
 * is nothing to commit with instead). Transformed tab DOM during minimize is never captured. */
export function inkForRevision(input: {
  /** The signature of the ink the page shows now. */
  signature: string
  installed: { signature: string; key: string } | undefined
  /** Whether the renderer keeps an image of that ink (KeptGlyphs.find). */
  kept: boolean
  /** The tab bar's DOM ink is under a minimize transform. */
  transformed: boolean
  /** This revision installs a new or restored backdrop plane. */
  backdropChanges: boolean
  /** The previous revision deferred this surface's ink. Ink is deferred once: content that keeps
   * changing under the bar would otherwise put a changed label or badge off for as long as it
   * does (every revision installs a plane). The second revision waits for the ink. */
  deferredBefore?: boolean
}) {
  const { signature, installed, kept, transformed, backdropChanges, deferredBefore } = input
  if (!installed || installed.signature === signature) return { signature, deferred: false }
  if (transformed) return { signature: installed.signature, deferred: false }
  if (backdropChanges && !kept && !deferredBefore)
    return { signature: installed.signature, deferred: true }
  return { signature, deferred: false }
}
