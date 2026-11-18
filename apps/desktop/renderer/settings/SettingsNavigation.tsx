import {
  AppWindow,
  BellRing,
  ChevronsUpDown,
  CircleUserRound,
  Download,
  Folder,
  NotebookPen,
  Palette,
  Settings2,
} from 'lucide-react'
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const sections = [
  { name: 'Application', icon: AppWindow },
  { name: 'LiveEditor', icon: NotebookPen },
  { name: 'Appearance', icon: Palette },
  { name: 'Shortcuts & Sound', icon: BellRing },
  { name: 'Categories', icon: Folder },
  { name: 'Updates', icon: Download },
  { name: 'Account', icon: CircleUserRound },
] as const

type Section = (typeof sections)[number]
export type SettingsSectionName = Section['name']
const CurrentSection = createContext<SettingsSectionName | 'standalone' | null>(
  'standalone',
)

/**
 * Keeps each mounted section in the layout only while its menu entry is selected.
 *
 * @example
 * const selected = useSettingsSectionSelected('Account')
 */
export function useSettingsSectionSelected(name: SettingsSectionName): boolean {
  const current = useContext(CurrentSection)
  return current === 'standalone' || name === current
}

// Electron also reports occlusion on macOS, which should pause visible-only effects without ending the visit.
function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return (): void => document.removeEventListener('visibilitychange', onChange)
}

/**
 * Guards effects that consume notices or move focus while the selected section can be seen.
 * An occluded macOS window retains its selected section and scroll position.
 *
 * @example
 * const visible = useSettingsSectionVisible('Account')
 */
export function useSettingsSectionVisible(name: SettingsSectionName): boolean {
  const selected = useSettingsSectionSelected(name)
  const documentVisible = useSyncExternalStore(
    subscribeToVisibility,
    () => document.visibilityState !== 'hidden',
  )
  return selected && documentVisible
}

/**
 * Keeps the current section visible in the bundled Settings window and retains its children's state.
 * A null section means Sync details covers those controls.
 *
 * @example
 * <SettingsNavigation section={section} onSelect={setSection}>{controls}</SettingsNavigation>
 */
export function SettingsNavigation({
  children,
  section,
  onSelect,
}: {
  children: ReactNode
  section: SettingsSectionName | null
  onSelect: (section: SettingsSectionName) => void
}) {
  const selected = sections.find(({ name }) => name === section) ?? sections[0]
  const Icon = selected.icon
  return (
    <CurrentSection value={section}>
      <div hidden={section === null}>
        <nav
          aria-label="Settings sections"
          className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-2 border-b bg-background px-4 py-2 text-sm font-medium"
        >
          <Settings2 aria-hidden="true" className="size-4 shrink-0" />
          <span>Settings</span>
          <span aria-hidden="true" className="text-muted-foreground">
            /
          </span>
          <label className="relative inline-flex min-w-0 items-center rounded-lg bg-muted">
            <Icon
              aria-hidden="true"
              className="pointer-events-none absolute left-2 size-4"
            />
            <select
              aria-label="Current settings section"
              className="min-h-11 min-w-0 cursor-pointer appearance-none rounded-lg bg-transparent pl-8 pr-7 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring"
              value={selected.name}
              onChange={(event) => {
                const section = sections[event.currentTarget.selectedIndex]
                if (section) {
                  onSelect(section.name)
                  window.scrollTo(0, 0)
                }
              }}
            >
              {sections.map(({ name }) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <ChevronsUpDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2 size-3.5"
            />
          </label>
        </nav>
        {children}
      </div>
    </CurrentSection>
  )
}
