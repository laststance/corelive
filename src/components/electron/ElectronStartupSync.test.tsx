import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import electronSettingsReducer from '@/lib/redux/slices/electronSettingsSlice'

import { ElectronStartupSync } from './ElectronStartupSync'

const setHideAppIconMock = vi.fn().mockResolvedValue(true)

vi.mock('@/components/auth/ElectronLoginForm', () => ({
  useIsElectron: () => true,
}))

const buildStore = (hideAppIcon: boolean) =>
  configureStore({
    reducer: {
      electronSettings: electronSettingsReducer,
    },
    preloadedState: {
      electronSettings: {
        hideAppIcon,
        showInMenuBar: true,
        startAtLogin: false,
      },
    },
  })

const wrapWithStore = (children: ReactNode, hideAppIcon: boolean) => (
  <Provider store={buildStore(hideAppIcon)}>{children}</Provider>
)

describe('ElectronStartupSync', () => {
  beforeEach(() => {
    setHideAppIconMock.mockClear()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: {
        settings: {
          setHideAppIcon: setHideAppIconMock,
        },
      },
    })
  })

  it('forwards persisted hideAppIcon=true to the main process on mount', async () => {
    render(wrapWithStore(<ElectronStartupSync />, true))

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(true)
    })
  })

  it('forwards persisted hideAppIcon=false to the main process on mount', async () => {
    render(wrapWithStore(<ElectronStartupSync />, false))

    await waitFor(() => {
      expect(setHideAppIconMock).toHaveBeenCalledWith(false)
    })
  })
})
