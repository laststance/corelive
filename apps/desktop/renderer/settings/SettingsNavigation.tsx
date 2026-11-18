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
import { createContext, useContext, useState, type ReactNode } from 'react'

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
 * Lets a section and its effects distinguish a visible pane from a mounted, hidden pane.
 * A section rendered individually is visible by default.
 *
 * @example
 * const visible = useSettingsSectionVisible('Account')
 */
export function useSettingsSectionVisible(name: SettingsSectionName): boolean {
  const current = useContext(CurrentSection)
  return current === 'standalone' || name === current
}

/**
 * Keeps the current section visible in the bundled Settings window and retains its children's state.
 * Opening a new window starts in Application.
 *
 * @example
 * <SettingsNavigation><SettingsSection label="Application">{controls}</SettingsSection></SettingsNavigation>
 */
export function SettingsNavigation({
  children,
  hidden = false,
}: {
  children: ReactNode
  hidden?: boolean
}) {
  const [selected, setSelected] = useState<Section>(sections[0])
  const Icon = selected.icon
  return (
    <CurrentSection value={hidden ? null : selected.name}>
      <div hidden={hidden}>
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
                  setSelected(section)
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
