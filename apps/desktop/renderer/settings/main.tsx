import { ThemeTransition } from '@corelive/live-editor/theme-transition'
import { createRoot } from 'react-dom/client'

import { ElectronSettingsPage } from './ElectronSettingsPage'
import { SettingsProvider } from './SettingsProvider'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Settings root is missing')
const api = window.settingsAPI
if (api?.version === 1) {
  createRoot(root).render(
    <>
      <ThemeTransition />
      <SettingsProvider api={api}>
        <main className="mx-auto max-w-2xl space-y-12 px-4 pb-12 pt-4">
          <ElectronSettingsPage />
        </main>
      </SettingsProvider>
    </>,
  )
} else {
  // A missing preload cannot fall back to the remote site or browser storage.
  root.textContent =
    'Settings could not open. Close this window and try again. Your saved writing is preserved.'
}
