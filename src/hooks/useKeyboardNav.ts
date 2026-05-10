import { useEffect, useEffectEvent } from 'react'

/**
 * Listens for `j` (next day) and `k` (previous day) keyboard shortcuts while
 * `isOpen` is true, dispatching to `onPrev` / `onNext` callbacks. Powers the
 * DayDetailDialog's day-stepping in PR2 of the Heatmap Cathedral. Esc handling
 * is delegated to the underlying Radix Dialog so this hook does not double-
 * handle dismiss.
 *
 * **Typing guard:** when the keydown target is `<input>`, `<textarea>`, or any
 * `contentEditable` element (e.g., BrainDump's editor), the shortcut is
 * suppressed. Without this, pressing `j` would BOTH insert a literal character
 * AND step the dialog — confusing and destructive.
 *
 * **Stability:** `useEffectEvent` (React 19) wraps the callbacks so the
 * `keydown` listener always sees the latest `onPrev` / `onNext` without
 * forcing the effect to re-attach on every render. That keeps `[isOpen]` as
 * the only dep — fewer listener cycles, fewer race windows.
 *
 * **Lifecycle:** mount this hook from the component that owns the dialog
 * (`DayDetailDialog`) so the `keydown` listener attaches when the dialog
 * opens and detaches when it closes. A global listener over the whole app
 * would be wider than the shortcut's intent and could collide with other
 * focused widgets.
 *
 * @param options.isOpen - When true, the listener is attached; when false, it is removed.
 * @param options.onPrev - Called on `k`; expected to step the dialog one day back.
 * @param options.onNext - Called on `j`; expected to step the dialog one day forward.
 * @example
 * useKeyboardNav({
 *   isOpen: selectedDate !== null,
 *   onPrev: () => onNavigate?.(-1),
 *   onNext: () => onNavigate?.(1),
 * })
 */
export function useKeyboardNav({
  isOpen,
  onPrev,
  onNext,
}: {
  isOpen: boolean
  onPrev: () => void
  onNext: () => void
}): void {
  const handlePrev = useEffectEvent(onPrev)
  const handleNext = useEffectEvent(onNext)

  useEffect(() => {
    if (!isOpen) return undefined

    function handleKey(event: KeyboardEvent): void {
      // Skip navigation while the user is typing — otherwise `j` / `k`
      // would both insert a literal character and step the dialog.
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return
      }

      if (event.key === 'j') {
        event.preventDefault()
        handleNext()
      } else if (event.key === 'k') {
        event.preventDefault()
        handlePrev()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])
}
