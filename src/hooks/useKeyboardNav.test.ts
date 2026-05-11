import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useKeyboardNav } from './useKeyboardNav'

/**
 * Dispatches a synthetic `keydown` event so the hook's window listener fires.
 * When `target` is provided, the event bubbles up from that element, letting
 * us assert the typing-guard branch. Without `target`, the event is dispatched
 * directly on `window`.
 */
function dispatchKeyDown(key: string, target?: HTMLElement): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  if (target) {
    target.dispatchEvent(event)
  } else {
    window.dispatchEvent(event)
  }
}

describe('useKeyboardNav', () => {
  it('calls onNext when j is pressed', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('j')
    })

    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).not.toHaveBeenCalled()
  })

  it('calls onPrev when k is pressed', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('k')
    })

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('ignores keys other than j/k', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      // Escape is intentionally NOT handled here — Radix Dialog owns it.
      dispatchKeyDown('Escape')
      dispatchKeyDown('a')
      dispatchKeyDown('Enter')
    })

    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('does not attach the listener when isOpen is false', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: false, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('j')
      dispatchKeyDown('k')
    })

    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('suppresses navigation when the target is an <input>', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('j', input)
      dispatchKeyDown('k', input)
    })

    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('suppresses navigation when the target is a <textarea>', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('j', textarea)
    })

    expect(onNext).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('suppresses navigation when the target is contentEditable', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    document.body.appendChild(editable)
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      dispatchKeyDown('j', editable)
    })

    expect(onNext).not.toHaveBeenCalled()
    document.body.removeChild(editable)
  })

  it('suppresses navigation during IME composition (isComposing)', () => {
    // Pressing `j` while seeding `じ` (ji) in a Japanese IME fires a keydown
    // with `isComposing=true` before the composition resolves. The hook must
    // skip dispatch — otherwise the user would both feed the IME buffer AND
    // step the day-detail dialog.
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'j',
        bubbles: true,
        cancelable: true,
        isComposing: true,
      })
      window.dispatchEvent(event)
    })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('suppresses navigation when keyCode is 229 (legacy IME signal)', () => {
    // Older IMEs / browsers report composition via `keyCode === 229` without
    // setting `isComposing`. The hook checks both so the JP path stays
    // robust across input-method implementations.
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderHook(() => useKeyboardNav({ isOpen: true, onPrev, onNext }))

    act(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'j',
        bubbles: true,
        cancelable: true,
        keyCode: 229,
      })
      window.dispatchEvent(event)
    })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('removes the listener on unmount', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { unmount } = renderHook(() =>
      useKeyboardNav({ isOpen: true, onPrev, onNext }),
    )

    unmount()
    act(() => {
      dispatchKeyDown('j')
    })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('removes the listener when isOpen flips to false', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const { rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useKeyboardNav({ isOpen, onPrev, onNext }),
      { initialProps: { isOpen: true } },
    )

    rerender({ isOpen: false })
    act(() => {
      dispatchKeyDown('j')
    })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('always invokes the latest callback (useEffectEvent stability)', () => {
    // After re-rendering with a new onNext, pressing j must call the *new*
    // callback even though [isOpen] is the only effect dep — proves
    // useEffectEvent forwards to the latest props without re-attaching.
    const firstOnNext = vi.fn()
    const secondOnNext = vi.fn()
    const onPrev = vi.fn()
    const { rerender } = renderHook(
      ({ onNext }: { onNext: () => void }) =>
        useKeyboardNav({ isOpen: true, onPrev, onNext }),
      { initialProps: { onNext: firstOnNext } },
    )

    rerender({ onNext: secondOnNext })
    act(() => {
      dispatchKeyDown('j')
    })

    expect(firstOnNext).not.toHaveBeenCalled()
    expect(secondOnNext).toHaveBeenCalledTimes(1)
  })
})
