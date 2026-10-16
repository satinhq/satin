import { licenseNotices } from './inventory.ts'
import { List } from '../public/controls.tsx'
import { Screen } from '../public/chrome.tsx'
import { useColorScheme } from '../public/environment.tsx'
import { Section, Row, NavigationRow } from '../list-form/ListForm.tsx'
import { ScrollSurface } from '../scroll/ScrollSurface.tsx'
import { Selectable } from '../root/SatinRoot.tsx'
import { createScreenRegistry, defineScreen, type ScreenRegistry } from '../navigation/registry.ts'
import { useNavigator, useParams } from '../navigation/navigationContext.tsx'

function NoticeList() {
  const navigator = useNavigator()
  return (
    <Screen title="Acknowledgements" titleDisplay="inline">
      <List id="satin-acknowledgements">
        <Section header="Satin">
          <Row label="Built with Satin" />
        </Section>
        <Section header="Open source">
          {licenseNotices().map((notice, index) => (
            <NavigationRow
              key={`${notice.name}:${notice.version}`}
              label={notice.name}
              onPress={() => navigator.push(LICENSE, { index })}
            />
          ))}
        </Section>
      </List>
    </Screen>
  )
}
function NoticeText() {
  const scheme = useColorScheme()
  const { index } = useParams() as { index: number }
  const notice = licenseNotices()[index]
  if (!notice) throw new Error('Acknowledgements notice is unavailable')
  return (
    <Screen title={notice.name} titleDisplay="inline">
      <ScrollSurface
        id="satin-license"
        axis="vertical"
        primary
        style={{ background: scheme === 'dark' ? '#000' : '#fff' }}
      >
        <Selectable
          style={{
            padding: 16,
            fontSize: 17,
            lineHeight: '22px',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {notice.text}
        </Selectable>
      </ScrollSurface>
    </Screen>
  )
}

export const ACKNOWLEDGEMENTS = '__satin:acknowledgements'
const LICENSE = '__satin:license'

/** Add transient framework destinations to the existing primary stack. */
export function acknowledgementsRegistry(registry: ScreenRegistry): ScreenRegistry {
  if (registry.has(ACKNOWLEDGEMENTS) || registry.has(LICENSE))
    throw new Error('Acknowledgements destination identities are reserved by Satin')
  return createScreenRegistry(
    ...registry.definitions,
    defineScreen(ACKNOWLEDGEMENTS, {
      component: NoticeList,
      navigation: { title: 'Acknowledgements', display: 'inline' },
    }),
    defineScreen<typeof LICENSE, { index: number }>(LICENSE, {
      component: NoticeText,
      navigation: { title: 'License', display: 'inline' },
    }),
  )
}
