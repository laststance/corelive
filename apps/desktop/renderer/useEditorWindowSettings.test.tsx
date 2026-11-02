// @vitest-environment happy-dom
/**
 * @fileoverview useEditorWindowSettings pin ported from the deleted web
 * useLiveEditorWindowSettings.sync suite (#215). The two cross-window cases were
 * dropped with the feature; the rollback case stays because the desktop panel
 * shares this hook. If it fails, a rejected native opacity save leaves the
 * slider showing a value the window never applied.
 */
import type { LiveEditorAPI } from '@corelive/desktop-contract/electron-api'
import { useEditorWindowSettings } from '@corelive/live-editor/window-settings'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(cleanup)

test('a rejected opacity save restores the last native value instead of leaving a misleading slider', async () => {
  // Arrange
  const persistedState = { opacity: 0.95 }
  const setOpacity = vi.fn(async (value: number) => {
    persistedState.opacity = value
  })
  const host = {
    window: {
      getOpacity: vi.fn(async () => persistedState.opacity),
      setOpacity,
    },
    spaces: {
      getVisibleOnAllWorkspaces: async () => false,
      setVisibleOnAllWorkspaces: async (value: boolean) => value,
    },
  }
  const getHost = (): Pick<LiveEditorAPI, 'window' | 'spaces'> =>
    host as unknown as Pick<LiveEditorAPI, 'window' | 'spaces'>
  const { result } = renderHook(() =>
    useEditorWindowSettings(true, getHost, null, vi.fn(), vi.fn()),
  )
  await waitFor(() => expect(result.current.isLiveEditorConfigReady).toBe(true))
  setOpacity.mockRejectedValueOnce(new Error('Native save failed'))

  // Act
  act(() => result.current.handleOpacityValueChange([0.5]))

  // Assert: optimistic value first, then the confirmed native value returns.
  expect(result.current.opacity).toBe(0.5)
  await waitFor(() => expect(result.current.opacity).toBe(0.95))
  expect(persistedState.opacity).toBe(0.95)
})
