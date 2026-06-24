import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useShortcutCapture } from '@/hooks/useShortcutCapture'
import { KEYBINDING_CONFLICT_MESSAGE } from '@/lib/constants/keybinding'

describe('useShortcutCapture', () => {
  it('shows a captured accelerator and clears the error once it persists', async () => {
    // Arrange
    const persist = vi.fn().mockResolvedValue(true)
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useShortcutCapture({ persist, onError }),
    )

    // Act — capture a fresh chord that the main process accepts.
    await act(async () => {
      await result.current.capture('Alt+Space')
    })

    // Assert — the chord is shown, persisted, and no error remains.
    expect(persist).toHaveBeenCalledWith('Alt+Space')
    expect(result.current.shortcut).toBe('Alt+Space')
    expect(onError).toHaveBeenLastCalledWith(null)
  })

  it('rolls back to the loaded binding and explains the conflict when the main process rejects it', async () => {
    // Arrange — a saved binding seeded as the rollback target.
    const persist = vi.fn().mockResolvedValue(false)
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useShortcutCapture({ persist, onError }),
    )
    act(() => {
      result.current.setLoadedShortcut('Alt+Space')
    })

    // Act — capture a chord the main process reports as already bound.
    await act(async () => {
      await result.current.capture('CommandOrControl+B')
    })

    // Assert — reverted to the loaded value, with the conflict copy surfaced.
    expect(result.current.shortcut).toBe('Alt+Space')
    expect(onError).toHaveBeenLastCalledWith(KEYBINDING_CONFLICT_MESSAGE)
  })

  it('rolls back and reports a generic failure when the persist call throws', async () => {
    // Arrange
    const persist = vi.fn().mockRejectedValue(new Error('IPC down'))
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useShortcutCapture({ persist, onError }),
    )
    act(() => {
      result.current.setLoadedShortcut('Alt+Space')
    })

    // Act
    await act(async () => {
      await result.current.capture('CommandOrControl+B')
    })

    // Assert — reverted to the last good value, with the failure (not conflict) copy.
    expect(result.current.shortcut).toBe('Alt+Space')
    expect(onError).toHaveBeenLastCalledWith('Failed to update shortcut')
  })
})
