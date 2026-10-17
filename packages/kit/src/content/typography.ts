/* iOS 27.0 (24A434), default Dynamic Type, reference native-sim-light/geometry.json.
 * lineHeight is the glyph line box; lineAdvance includes UIFont leading.
 * Keep Settings large-title geometry tied to this source of type metrics.
 */
export const contentTypography = {
  largeTitle: { size: 34, lineHeight: 40.57421875, lineAdvance: 41, weight: 400 },
  title: { size: 28, lineHeight: 33.4140625, lineAdvance: 34, weight: 400 },
  title2: { size: 22, lineHeight: 26.25390625, lineAdvance: 28, weight: 400 },
  title3: { size: 20, lineHeight: 23.8671875, lineAdvance: 25, weight: 400 },
  headline: { size: 17, lineHeight: 20.287109375, lineAdvance: 22, weight: 600 },
  subheadline: { size: 15, lineHeight: 17.900390625, lineAdvance: 20, weight: 400 },
  body: { size: 17, lineHeight: 20.287109375, lineAdvance: 22, weight: 400 },
  callout: { size: 16, lineHeight: 19.09375, lineAdvance: 21, weight: 400 },
  footnote: { size: 13, lineHeight: 15.513671875, lineAdvance: 18, weight: 400 },
  caption: { size: 12, lineHeight: 14.3203125, lineAdvance: 16, weight: 400 },
  caption2: { size: 11, lineHeight: 13.126953125, lineAdvance: 13, weight: 400 },
} as const

/** Shared Text/probe font policy. WebKit does not support the large-title or callout
 * keywords, so those styles retain Text's measured, fixed-size fallback. */
export const contentFonts = {
  largeTitle: `${contentTypography.largeTitle.weight} ${contentTypography.largeTitle.size}px -apple-system`,
  title: '-apple-system-title1',
  title2: '-apple-system-title2',
  title3: '-apple-system-title3',
  headline: '-apple-system-headline',
  subheadline: '-apple-system-subheadline',
  body: '-apple-system-body',
  callout: `${contentTypography.callout.weight} ${contentTypography.callout.size}px -apple-system`,
  footnote: '-apple-system-footnote',
  caption: '-apple-system-caption1',
  caption2: '-apple-system-caption2',
} as const
