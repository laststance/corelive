import type { OfflineSettingsAPI } from '@corelive/desktop-contract/offline-editor-api'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, expect, test, vi } from 'vitest'

import { LiveEditorStatusSetting } from '@/components/settings/LiveEditorStatusSetting'
import electronSettings from '@/lib/redux/slices/electronSettingsSlice'
import settings, {
  setLiveEditorFontSize,
} from '@/lib/redux/slices/settingsSlice'

import { OfflineSettingsSync } from './OfflineSettingsSync'

const environment = vi.hoisted(() => ({
  theme: 'light',
  path: '/settings',
  applyTheme: vi.fn(),
}))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { id: 'fixture-owner' } }),
}))
vi.mock('next/navigation', () => ({ usePathname: () => environment.path }))
vi.mock('next-themes', () => ({
  // next-themes may change setter identity when the selected theme changes.
  useTheme: () => ({
    theme: environment.theme,
    setTheme: (theme: string) => environment.applyTheme(theme),
  }),
}))
afterEach(() => {
  delete window.electronAPI
  environment.theme = 'light'
  environment.path = '/settings'
  vi.clearAllMocks()
})

test('changing palette keeps the account sync owner and commits the selected theme instead of restoring stale native theme', async () => {
  // Arrange
  const preferences = {
    revision: 2,
    theme: 'light',
    settings: UserSettingsStateSchema.parse({}),
  }
  const patch = vi.fn<OfflineSettingsAPI['patch']>(async () => ({
    ok: true,
    generation: 1,
    preferences,
  }))
  const unsubscribe = vi.fn()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      offlineSettings: {
        version: 1,
        read: async () => ({ generation: 1, preferences }),
        patch,
        onChanged: () => unsubscribe,
      },
    },
  })
  const store = configureStore({ reducer: { settings, electronSettings } })
  const view = render(
    <Provider store={store}>
      <OfflineSettingsSync>
        <span>Settings</span>
      </OfflineSettingsSync>
    </Provider>,
  )
  await waitFor(() =>
    expect(store.getState().settings.liveEditorShowStatusBar).toBe(true),
  )

  // Act
  environment.theme = 'harbor-dark'
  view.rerender(
    <Provider store={store}>
      <OfflineSettingsSync>
        <span>Settings</span>
      </OfflineSettingsSync>
    </Provider>,
  )

  // Assert
  await waitFor(() => expect(patch).toHaveBeenCalledOnce())
  expect(patch.mock.calls[0]?.[2]).toMatchObject({
    theme: 'harbor-dark',
    expectedRevision: 2,
  })
  expect(unsubscribe).not.toHaveBeenCalled()
  expect(environment.applyTheme).not.toHaveBeenCalled()
})

test('older preloads still show a failed preference and Retry while hiding the unsupported footer switch', async () => {
  // Arrange
  vi.useFakeTimers()
  const preferences = {
    revision: 2,
    theme: 'light',
    settings: UserSettingsStateSchema.parse({}),
  }
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      offlineSettings: {
        version: 1,
        read: async () => ({ generation: 1, preferences }),
        patch: async () => ({ ok: false, reason: 'storage-failed' }),
        onChanged: () => () => undefined,
      },
    },
  })
  const store = configureStore({ reducer: { settings, electronSettings } })
  render(
    <Provider store={store}>
      <OfflineSettingsSync>
        <LiveEditorStatusSetting />
      </OfflineSettingsSync>
    </Provider>,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })

  // Act
  await act(async () => {
    store.dispatch(setLiveEditorFontSize(24))
    await vi.advanceTimersByTimeAsync(6000)
  })

  // Assert
  expect(
    screen.queryByRole('switch', { name: 'Show save and sync status' }),
  ).toBeNull()
  expect(
    screen.getByText(
      'Could not confirm your saved settings. Use Retry to try again.',
    ),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  vi.useRealTimers()
})
