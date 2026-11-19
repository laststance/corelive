import type {
  DashboardTheme,
  SetDashboardAppearance,
} from '@corelive/desktop-contract/dashboard-appearance'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { useNextThemesPersistence } from '@/hooks/useThemeAxis'

import { DashboardAppearanceProvider } from './DashboardAppearanceProvider'
import { ThemeProvider } from './ThemeProvider'

const account = vi.hoisted(() => ({
  userId: 'account-a',
  get: vi.fn<
    (input: {
      expectedAccountId: string
    }) => Promise<{ theme: DashboardTheme | null }>
  >(),
  set: vi.fn<
    (input: SetDashboardAppearance) => Promise<{ theme: DashboardTheme | null }>
  >(),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: account.userId, isLoaded: true }),
}))
vi.mock('@/lib/orpc/create-client', () => ({
  createClient: () => ({
    dashboardAppearance: { get: account.get, set: account.set },
  }),
}))

function AppearanceControls() {
  const { value, setValue } = useNextThemesPersistence()
  return (
    <>
      <output data-testid="theme">{value}</output>
      <button onClick={() => setValue('harbor-dark')}>Use Harbor dark</button>
      <button onClick={() => setValue('light')}>Use light</button>
    </>
  )
}

function openDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const page = render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DashboardAppearanceProvider>
          <AppearanceControls />
        </DashboardAppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { client, ...page }
}

beforeEach(() => {
  account.userId = 'account-a'
  window.localStorage.clear()
  account.get.mockReset()
  account.set.mockReset()
})

test('a second tab accepts a theme change while the first tab is saving it', async () => {
  // Arrange
  let remote: DashboardTheme = 'light'
  const pending = Promise.withResolvers<{ theme: DashboardTheme }>()
  account.get.mockImplementation(async () => ({ theme: remote }))
  account.set.mockImplementation(async () => pending.promise)
  const first = within(openDashboard().container)
  const second = within(openDashboard().container)
  await waitFor(() => {
    expect(first.getByTestId('theme')).toHaveTextContent('light')
    expect(second.getByTestId('theme')).toHaveTextContent('light')
  })

  // Act
  fireEvent.click(first.getByRole('button', { name: 'Use Harbor dark' }))
  await waitFor(() =>
    expect(window.localStorage.getItem('corelive-theme')).toBe('harbor-dark'),
  )
  fireEvent(
    window,
    new StorageEvent('storage', {
      key: 'corelive-theme',
      newValue: 'harbor-dark',
    }),
  )

  // Assert
  expect(second.getByTestId('theme')).toHaveTextContent('harbor-dark')
  expect(window.localStorage.getItem('corelive-theme')).toBe('harbor-dark')
  await act(async () => {
    remote = 'harbor-dark'
    pending.resolve({ theme: 'harbor-dark' })
    await pending.promise
  })
  expect(account.set).toHaveBeenCalledTimes(1)
})

test('choosing the cached light theme after another tab selects dark immediately restores light', async () => {
  // Arrange
  const saving = Promise.withResolvers<{ theme: DashboardTheme }>()
  account.get.mockResolvedValue({ theme: 'light' })
  account.set.mockReturnValue(saving.promise)
  openDashboard()
  await waitFor(() =>
    expect(screen.getByTestId('theme')).toHaveTextContent('light'),
  )
  window.localStorage.setItem('corelive-theme', 'harbor-dark')
  fireEvent(
    window,
    new StorageEvent('storage', {
      key: 'corelive-theme',
      newValue: 'harbor-dark',
    }),
  )
  expect(screen.getByTestId('theme')).toHaveTextContent('harbor-dark')
  expect(account.set).not.toHaveBeenCalled()

  // Act
  fireEvent.click(screen.getByRole('button', { name: 'Use light' }))

  // Assert
  expect(screen.getByTestId('theme')).toHaveTextContent('light')
  expect(window.localStorage.getItem('corelive-theme')).toBe('light')
  await act(async () => {
    saving.resolve({ theme: 'light' })
    await saving.promise
  })
  expect(account.set).toHaveBeenCalledExactlyOnceWith({
    expectedAccountId: 'account-a',
    theme: 'light',
  })
  expect(screen.getByTestId('theme')).toHaveTextContent('light')
})

test('a returning browser imports its legacy theme once and another browser reads the change made in Settings', async () => {
  // Arrange
  const saved = new Map<string, DashboardTheme>()
  account.get.mockImplementation(async ({ expectedAccountId }) => ({
    theme: saved.get(expectedAccountId) ?? null,
  }))
  account.set.mockImplementation(
    async ({ theme, initializeOnly, expectedAccountId }) => {
      if (!expectedAccountId) throw new Error('Missing account')
      if (!initializeOnly || !saved.has(expectedAccountId))
        saved.set(expectedAccountId, theme)
      return { theme: saved.get(expectedAccountId)! }
    },
  )
  window.localStorage.setItem('corelive-theme', 'dark')
  const first = openDashboard()
  // Act
  await waitFor(() => expect(saved.get('account-a')).toBe('dark'))
  fireEvent.click(screen.getByRole('button', { name: 'Use Harbor dark' }))
  await waitFor(() => expect(saved.get('account-a')).toBe('harbor-dark'))
  first.unmount()
  window.localStorage.clear()
  openDashboard()
  // Assert
  await waitFor(() =>
    expect(screen.getByTestId('theme')).toHaveTextContent('harbor-dark'),
  )
  expect(window.localStorage.getItem('corelive-theme')).toBe('harbor-dark')
  expect(account.set).toHaveBeenCalledTimes(2)
})

test('refetching a dashboard displays a new agent-selected theme and switching accounts never seeds it into the next account', async () => {
  // Arrange
  let remote: DashboardTheme = 'light'
  account.get.mockImplementation(async () => ({
    theme: account.userId === 'account-a' ? remote : null,
  }))
  account.set.mockImplementation(async ({ theme }) => ({ theme }))
  const first = openDashboard()
  await waitFor(() =>
    expect(screen.getByTestId('theme')).toHaveTextContent('light'),
  )
  // Act
  remote = 'harbor-dark'
  await first.client.invalidateQueries({
    queryKey: ['dashboardAppearance', 'account-a'],
  })
  await waitFor(() =>
    expect(window.localStorage.getItem('corelive-theme')).toBe('harbor-dark'),
  )
  first.unmount()
  account.userId = 'account-b'
  openDashboard()
  // Assert
  await waitFor(() =>
    expect(screen.getByTestId('theme')).toHaveTextContent('system'),
  )
  expect(account.set).toHaveBeenCalledWith(
    { theme: 'system', initializeOnly: true, expectedAccountId: 'account-b' },
    expect.anything(),
  )
})
