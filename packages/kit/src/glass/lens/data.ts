export type IconName =
  | 'accessibility'
  | 'airdrop'
  | 'apps'
  | 'battery'
  | 'book'
  | 'camera'
  | 'car'
  | 'clock'
  | 'device'
  | 'gear'
  | 'globe'
  | 'info'
  | 'keyboard'
  | 'lock'
  | 'moon'
  | 'notifications'
  | 'privacy'
  | 'search'
  | 'sparkles'
  | 'text'
  | 'time'

export type IconTone = 'black' | 'blue' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red'

export type SettingsRowData = Readonly<{
  id: string
  icon: IconName
  label: string
  tone?: IconTone
  trailing?: string
  navigates?: boolean
}>

export type SettingsGroupData = Readonly<{
  id: string
  header?: string
  footer?: string
  rows: readonly SettingsRowData[]
}>

export const ROOT_GROUPS: readonly SettingsGroupData[] = [
  {
    id: 'system',
    rows: [
      { id: 'general', icon: 'gear', label: 'General', navigates: true },
      {
        id: 'accessibility',
        icon: 'accessibility',
        label: 'Accessibility',
        tone: 'blue',
        navigates: true,
      },
      {
        id: 'action-button',
        icon: 'device',
        label: 'Action Button',
        tone: 'blue',
        navigates: true,
      },
      {
        id: 'intelligence',
        icon: 'sparkles',
        label: 'Apple Intelligence & Siri',
        tone: 'pink',
        navigates: true,
      },
      { id: 'camera', icon: 'camera', label: 'Camera', navigates: true },
      {
        id: 'home-screen',
        icon: 'device',
        label: 'Home Screen & App Library',
        tone: 'blue',
        navigates: true,
      },
      { id: 'search', icon: 'search', label: 'Search', navigates: true },
      { id: 'standby', icon: 'apps', label: 'StandBy', tone: 'black', navigates: true },
    ],
  },
  {
    id: 'attention',
    rows: [
      { id: 'screen-time', icon: 'time', label: 'Screen Time', tone: 'purple', navigates: true },
      { id: 'focus', icon: 'moon', label: 'Focus', tone: 'purple', navigates: true },
      {
        id: 'notifications',
        icon: 'notifications',
        label: 'Notifications',
        tone: 'red',
        navigates: true,
      },
    ],
  },
  {
    id: 'device',
    rows: [
      {
        id: 'sounds',
        icon: 'notifications',
        label: 'Sounds & Haptics',
        tone: 'pink',
        navigates: true,
      },
      { id: 'face-id', icon: 'lock', label: 'Face ID & Passcode', tone: 'green', navigates: true },
      { id: 'emergency', icon: 'device', label: 'Emergency SOS', tone: 'red', navigates: true },
      {
        id: 'privacy',
        icon: 'privacy',
        label: 'Privacy & Security',
        tone: 'blue',
        navigates: true,
      },
      { id: 'battery', icon: 'battery', label: 'Battery', tone: 'green', navigates: true },
      { id: 'apps', icon: 'apps', label: 'Apps', tone: 'blue', navigates: true },
    ],
  },
]

export const GENERAL_GROUPS: readonly SettingsGroupData[] = [
  {
    id: 'version',
    rows: [
      { id: 'about', icon: 'info', label: 'About', navigates: true },
      {
        id: 'software-update',
        icon: 'gear',
        label: 'Software Update',
        trailing: 'iOS 26.5',
        navigates: true,
      },
    ],
  },
  {
    id: 'continuity',
    rows: [
      {
        id: 'airdrop',
        icon: 'airdrop',
        label: 'AirDrop',
        trailing: 'Contacts Only',
        tone: 'blue',
        navigates: true,
      },
      {
        id: 'airplay',
        icon: 'device',
        label: 'AirPlay & Continuity',
        tone: 'blue',
        navigates: true,
      },
      {
        id: 'picture-in-picture',
        icon: 'device',
        label: 'Picture in Picture',
        trailing: 'On',
        tone: 'blue',
        navigates: true,
      },
      { id: 'carplay', icon: 'car', label: 'CarPlay', tone: 'blue', navigates: true },
    ],
  },
  {
    id: 'configuration',
    rows: [
      {
        id: 'storage',
        icon: 'device',
        label: 'iPhone Storage',
        trailing: '93.1 GB',
        navigates: true,
      },
      {
        id: 'background-refresh',
        icon: 'gear',
        label: 'Background App Refresh',
        trailing: 'On',
        navigates: true,
      },
      { id: 'date-time', icon: 'clock', label: 'Date & Time', navigates: true },
      { id: 'keyboard', icon: 'keyboard', label: 'Keyboard', trailing: '3', navigates: true },
      { id: 'fonts', icon: 'text', label: 'Fonts', trailing: '1', navigates: true },
      {
        id: 'language-region',
        icon: 'globe',
        label: 'Language & Region',
        trailing: 'English',
        tone: 'blue',
        navigates: true,
      },
      { id: 'dictionary', icon: 'book', label: 'Dictionary', tone: 'blue', navigates: true },
      { id: 'vpn', icon: 'gear', label: 'VPN & Device Management', navigates: true },
    ],
  },
]

export function filterGroups(
  groups: readonly SettingsGroupData[],
  query: string,
): readonly SettingsGroupData[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return groups
  return groups.flatMap(group => {
    const rows = group.rows.filter(row =>
      `${row.label} ${row.trailing ?? ''}`.toLocaleLowerCase().includes(normalized),
    )
    return rows.length === 0 ? [] : [{ ...group, rows }]
  })
}
