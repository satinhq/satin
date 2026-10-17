import { contentTypography } from '../content/typography.ts'

/* Historical iOS 26.5 tokens except explicitly remeasured measured-reference values below. */
export const SETTINGS_ROOT_INLINE_INSET_PX = 16
export const SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX = 20

/* measured-reference: measured portrait widths only; no invented breakpoint between them. */
export function settingsRootInlineInset(
  viewportWidth: number,
  screen: { width: number; height: number },
): number {
  return viewportWidth === 440 && screen.width === 440 && screen.height === 956
    ? SETTINGS_ROOT_PRO_MAX_INLINE_INSET_PX
    : SETTINGS_ROOT_INLINE_INSET_PX
}
export const SETTINGS_DETAIL_INLINE_INSET_PX = 20
// measured-reference audit 11: native title 1.67 pt above old PWA; section origin remains unchanged.
export const SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX = 57 + 1 / 3
export const SETTINGS_LARGE_TITLE_FONT_SIZE_PX = contentTypography.largeTitle.size
export const SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX = contentTypography.largeTitle.lineAdvance
export const SETTINGS_NAVIGATION_BAR_HEIGHT_PX = 44
export const SETTINGS_BACK_BUTTON_INLINE_INSET_PX = 16
export const SETTINGS_BACK_BUTTON_SIZE_PX = 44
export const SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX = 72
// iOS 27.0 24A434, both appearances, Pro and Pro Max; measured-reference/settings/measurements.json.
export const SETTINGS_ROOT_ROW_HEIGHT_PX = 52
export const SETTINGS_DETAIL_ROW_HEIGHT_PX = 52
export const SETTINGS_GROUP_CORNER_RADIUS_PX = 25
// measured-reference native ParityView rowLabel: 30 pt tile + 8 pt HStack gap (label x78 from content x40).
export const SETTINGS_ROW_ICON_SIZE_PX = 30
export const SETTINGS_ROW_ICON_CORNER_RADIUS_PX = 7
// Native Settings: 20 pt row padding + 30 pt tile + 8 pt content gap.
export const SETTINGS_SEPARATOR_LEADING_INSET_PX = 58
export const SETTINGS_SEPARATOR_HAIRLINE_PX = 1
export const SETTINGS_SEPARATOR_OFFSET_Y_PX = 1 / 3
export const SETTINGS_SEPARATOR_TRAILING_INSET_PX = 20
export const SETTINGS_ROW_TRAILING_INSET_PX = 20
export const SETTINGS_DISCLOSURE_WIDTH_PX = 15
export const SETTINGS_DISCLOSURE_HEIGHT_PX = 18
export const SETTINGS_DISCLOSURE_OFFSET_X_PX = -2 / 3
export const SETTINGS_DISCLOSURE_OFFSET_Y_PX = 4 / 3
export const SETTINGS_DISCLOSURE_LIGHT_COLOR = '#c5c5c7'
export const SETTINGS_DISCLOSURE_DARK_COLOR = '#5a5a5e'
export const SETTINGS_GROUP_SPACING_PX = 35

export const settingsChromeTokens = Object.freeze({
  // measured-reference toolbar reference, iPhone 17 Pro / iOS 26.5, both appearances.
  menuToolbarWidthPx: 44,
  menuToolbarPanelOffsetYPx: 7,
  menuToolbarHeightPx: 44,
  // iOS 27.0 (iPhone 17 Pro Max Simulator, toolbar menu measurements): the trailing item's 44 pt glass
  // ends 20 pt from the screen edge; the iOS 26.5 reference's 16 pt put it 4-5 pt too far out.
  menuToolbarTrailingInsetPx: 20,
  backButtonInlineInsetPx: SETTINGS_BACK_BUTTON_INLINE_INSET_PX,
  backButtonSizePx: SETTINGS_BACK_BUTTON_SIZE_PX,
  detailContentTopOffsetPx: SETTINGS_DETAIL_CONTENT_TOP_OFFSET_PX,
  detailInlineInsetPx: SETTINGS_DETAIL_INLINE_INSET_PX,
  detailRowHeightPx: SETTINGS_DETAIL_ROW_HEIGHT_PX,
  groupCornerRadiusPx: SETTINGS_GROUP_CORNER_RADIUS_PX,
  groupSpacingPx: SETTINGS_GROUP_SPACING_PX,
  disclosureDarkColor: SETTINGS_DISCLOSURE_DARK_COLOR,
  disclosureHeightPx: SETTINGS_DISCLOSURE_HEIGHT_PX,
  disclosureLightColor: SETTINGS_DISCLOSURE_LIGHT_COLOR,
  disclosureOffsetXPx: SETTINGS_DISCLOSURE_OFFSET_X_PX,
  disclosureOffsetYPx: SETTINGS_DISCLOSURE_OFFSET_Y_PX,
  disclosureWidthPx: SETTINGS_DISCLOSURE_WIDTH_PX,
  largeTitleFontSizePx: SETTINGS_LARGE_TITLE_FONT_SIZE_PX,
  largeTitleLineHeightPx: SETTINGS_LARGE_TITLE_LINE_HEIGHT_PX,
  navigationBarHeightPx: SETTINGS_NAVIGATION_BAR_HEIGHT_PX,
  rootInlineInsetPx: SETTINGS_ROOT_INLINE_INSET_PX,
  rootLargeTitleTopOffsetPx: SETTINGS_ROOT_LARGE_TITLE_TOP_OFFSET_PX,
  rootRowHeightPx: SETTINGS_ROOT_ROW_HEIGHT_PX,
  rowIconCornerRadiusPx: SETTINGS_ROW_ICON_CORNER_RADIUS_PX,
  rowIconSizePx: SETTINGS_ROW_ICON_SIZE_PX,
  separatorHairlinePx: SETTINGS_SEPARATOR_HAIRLINE_PX,
  separatorLeadingInsetPx: SETTINGS_SEPARATOR_LEADING_INSET_PX,
  separatorOffsetYPx: SETTINGS_SEPARATOR_OFFSET_Y_PX,
  separatorTrailingInsetPx: SETTINGS_SEPARATOR_TRAILING_INSET_PX,
  rowTrailingInsetPx: SETTINGS_ROW_TRAILING_INSET_PX,
})

/* measured-reference base with 12p/12n iOS 27 candidates. Per-value provenance: parity/calibrations/ipad-ios27.json. */
export const sidebarTokens = Object.freeze({
  width: 320,
  inset: 0,
  radius: 0,
  rowInset: 16,
  rowHeight: 52,
  rowRadius: 26,
  rowPadding: 16,
  iconSize: 28,
  iconGap: 8,
  sectionHeight: 54,
  tabHeight: 44,
  tabFontWeight: 500,
  tabSelectedFontWeight: 600,
  tabLineHeight: 20.5,
  tabReserve: 54,
  titleOffset: 0,
  contentTop: 54,
  toggleSize: 44,
  toggleTrailing: 10,
  fontSize: 17,
  lineHeight: 20.5,
  tracking: 0,
  detailTop: 89,
  detailInset: 20,
  detailLeading: 10,
  detailRadius: 25,
  sectionTop: 20,
  sectionBottom: 13,
  sectionInline: 16,
  toggleWidth: 54.5,
  toggleInset: 4,
  toggleHeight: 36,
  tabPadding: 4,
  tabInline: 16,
  tabRadius: 22,
  tabSelectionRadius: 18,
  shadowY: 8,
  shadowBlur: 32,

  light: Object.freeze({
    material: '#e2e6f0',
    selection: '#ced2dc',
    tint: '#000000',
    background: '#f2f2f7',
    label: '#000000',
    secondary: '#8a8a8e',
    tab: '#fbfbfd',
    tabTint: '#0081f5',
    // iPad native plain tab row, reference light pairs.
    tabSelection: '#e5e4ea',
  }),
  dark: Object.freeze({
    material: '#181d20',
    selection: '#2d3235',
    tint: '#ffffff',
    background: '#000000',
    label: '#ffffff',
    secondary: '#8e8e93',
    tab: '#1b1b1b',
    tabTint: '#0697ff',
    // iPad native plain and sidebarAdaptable tab rows, reference dark pairs.
    tabSelection: '#0a0a0a',
  }),
})

/** CSS projection shared by the host and portalled tabs, including retained compact sidebars. */
export const sidebarCssTokens = Object.freeze(
  Object.fromEntries(
    Object.entries(sidebarTokens).flatMap(([key, value]) =>
      typeof value === 'number'
        ? [[`--satin-sidebar-${key}`, key.endsWith('FontWeight') ? String(value) : `${value}px`]]
        : Object.entries(value).map(([name, color]) => [`--satin-sidebar-${key}-${name}`, color]),
    ),
  ),
)
