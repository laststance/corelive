import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EffectCallback } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type NotificationSettingsState } from '@/electron/types/ipc'

import { NotificationSettings } from './NotificationSettings'

const { getNotificationSettingsMock, updateNotificationSettingsMock } =
  vi.hoisted(() => ({
    getNotificationSettingsMock: vi.fn(),
    updateNotificationSettingsMock: vi.fn(),
  }))

vi.mock('@/lib/utils/getNotificationSettings', () => ({
  getNotificationSettings: getNotificationSettingsMock,
}))

vi.mock('@/lib/utils/updateNotificationSettings', () => ({
  updateNotificationSettings: updateNotificationSettingsMock,
}))

// The production React Compiler stabilizes the effect callbacks; this test
// mirrors that mount-only behavior because Vitest does not run the compiler.
vi.mock('@/hooks/use-cycle-effect', async () => {
  const { useEffect } = await import('react')
  return {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- test mirrors compiler-stabilized production callbacks.
    useCycleEffect: (effect: EffectCallback) => useEffect(effect, []),
  }
})

const LOADED_SETTINGS: NotificationSettingsState = {
  enabled: true,
  taskCreated: true,
  taskCompleted: true,
  taskUpdated: true,
  taskDeleted: false,
  sound: true,
  showInTray: true,
  autoHide: true,
  autoHideDelay: 5000,
  position: 'topRight',
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates only the changed field without reverting notification settings saved elsewhere', async () => {
    // Arrange — the authoritative response includes a concurrent taskUpdated change.
    const notificationsBridge = {
      isEnabled: vi.fn().mockResolvedValue(true),
      getActiveCount: vi.fn().mockResolvedValue(0),
      show: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
    }
    const savedSettings = {
      ...LOADED_SETTINGS,
      taskUpdated: false,
      taskDeleted: true,
    }
    getNotificationSettingsMock.mockResolvedValue(LOADED_SETTINGS)
    updateNotificationSettingsMock.mockResolvedValue(savedSettings)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { notifications: notificationsBridge },
    })
    const user = userEvent.setup()
    render(<NotificationSettings />)
    const taskDeletedSwitch = await screen.findByRole('switch', {
      name: 'Task Deleted',
    })
    await waitFor(() => expect(taskDeletedSwitch).not.toBeChecked())

    // Act — enable one notification type from this window.
    await user.click(taskDeletedSwitch)

    // Assert — only that field is sent, then the main process response wins.
    await waitFor(() => {
      expect(updateNotificationSettingsMock).toHaveBeenCalledWith(
        notificationsBridge,
        { taskDeleted: true },
      )
    })
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Task Updated' }),
      ).not.toBeChecked()
      expect(taskDeletedSwitch).toBeChecked()
    })
  })

  it('reloads persisted notification settings when the save response is unavailable', async () => {
    // Arrange — the write returns no state, while a reload exposes persisted truth.
    const notificationsBridge = {
      isEnabled: vi.fn().mockResolvedValue(true),
      getActiveCount: vi.fn().mockResolvedValue(0),
      show: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
    }
    const reloadedSettings = {
      ...LOADED_SETTINGS,
      taskUpdated: false,
      taskDeleted: false,
    }
    getNotificationSettingsMock
      .mockResolvedValueOnce(LOADED_SETTINGS)
      .mockResolvedValueOnce(reloadedSettings)
    updateNotificationSettingsMock.mockResolvedValue(null)
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      writable: true,
      value: { notifications: notificationsBridge },
    })
    const user = userEvent.setup()
    render(<NotificationSettings />)
    const taskDeletedSwitch = await screen.findByRole('switch', {
      name: 'Task Deleted',
    })
    await waitFor(() => expect(taskDeletedSwitch).not.toBeChecked())

    // Act — try to enable Task Deleted while the save response is missing.
    await user.click(taskDeletedSwitch)

    // Assert — persisted state is fetched again and replaces the uncertain UI state.
    await waitFor(() => {
      expect(getNotificationSettingsMock).toHaveBeenCalledTimes(2)
      expect(
        screen.getByRole('switch', { name: 'Task Updated' }),
      ).not.toBeChecked()
      expect(taskDeletedSwitch).not.toBeChecked()
    })
  })
})
