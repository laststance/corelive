import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { NATIVE_WINDOW_PREFERENCES_STORAGE_KEY } from '@/lib/live-editor/constants'

import { useLiveEditorWindowSettings } from './useLiveEditorWindowSettings'

const { persisted, getOpacity, setOpacity } = vi.hoisted(() => {
  const persisted = { opacity: 0.95, spaces: false }
  return {
    persisted,
    getOpacity: vi.fn(async () => persisted.opacity),
    setOpacity: vi.fn(async (value: number) => {
      persisted.opacity = value
    }),
  }
})

vi.mock('@/lib/live-editor/liveEditorHost', () => ({
  getLiveEditorHost: () => ({
    window: { getOpacity, setOpacity },
    spaces: {
      getVisibleOnAllWorkspaces: async () => persisted.spaces,
      setVisibleOnAllWorkspaces: async (value: boolean) => {
        persisted.spaces = value
        return value
      },
    },
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  persisted.opacity = 0.95
  persisted.spaces = false
})
afterEach(cleanup)

test('an open LiveEditor updates its Spaces switch and opacity after another native window saves settings', async () => {
  // Arrange
  const { result } = renderHook(() => useLiveEditorWindowSettings(true))
  await waitFor(() => expect(result.current.isLiveEditorConfigReady).toBe(true))
  expect(result.current.spacesTrackingEnabled).toBe(false)
  expect(result.current.opacity).toBe(0.95)

  // Act
  persisted.spaces = true
  persisted.opacity = 0.5
  act(() => {
    localStorage.setItem(NATIVE_WINDOW_PREFERENCES_STORAGE_KEY, 'settings-save')
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: NATIVE_WINDOW_PREFERENCES_STORAGE_KEY,
      }),
    )
  })

  // Assert
  await waitFor(() => expect(result.current.spacesTrackingEnabled).toBe(true))
  expect(result.current.opacity).toBe(0.5)
})

test('saving Spaces from LiveEditor announces the confirmed native change to other open controls', async () => {
  // Arrange
  const { result } = renderHook(() => useLiveEditorWindowSettings(true))
  await waitFor(() => expect(result.current.isLiveEditorConfigReady).toBe(true))

  // Act
  await act(async () => result.current.handleSpacesTrackingChange(true))

  // Assert
  expect(persisted.spaces).toBe(true)
  expect(result.current.spacesTrackingEnabled).toBe(true)
  expect(
    localStorage.getItem(NATIVE_WINDOW_PREFERENCES_STORAGE_KEY),
  ).not.toBeNull()
  expect(result.current.isUpdatingSpacesTracking).toBe(false)
})

test('a rejected opacity save restores the last native value instead of leaving a misleading slider', async () => {
  // Arrange
  const { result } = renderHook(() => useLiveEditorWindowSettings(true))
  await waitFor(() => expect(result.current.isLiveEditorConfigReady).toBe(true))
  setOpacity.mockRejectedValueOnce(new Error('Native save failed'))

  // Act
  act(() => result.current.handleOpacityValueChange([0.5]))

  // Assert
  expect(result.current.opacity).toBe(0.5)
  await waitFor(() => expect(result.current.opacity).toBe(0.95))
  expect(persisted.opacity).toBe(0.95)
})
