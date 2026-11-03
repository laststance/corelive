import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'

import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { ThemeProvider } from '@/providers/ThemeProvider'
import '@/globals.css'

import { installHomeFixture } from './homeFixture'

/** Views the fixture renders; the list is shared with `--help` in `qa-web.ts`. */
const VIEWS = ['home', 'appearance'] as const
type View = (typeof VIEWS)[number]

const parameters = new URLSearchParams(location.search)
const requested = parameters.get('view') ?? 'home'
const view: View | null = VIEWS.find((name) => name === requested) ?? null
const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
    <QueryClientProvider client={query}>
      {view === 'home' && installHomeFixture(parameters)}
      {view === 'appearance' && (
        <main className="mx-auto max-w-2xl space-y-12 px-4 py-6 sm:px-6">
          <AppearanceSettings />
        </main>
      )}
      {view === null && (
        <p role="alert">
          Unknown view "{requested}". Valid: {VIEWS.join(', ')}
        </p>
      )}
    </QueryClientProvider>
  </ThemeProvider>,
)
