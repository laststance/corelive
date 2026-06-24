'use client'

/**
 * @fileoverview Shared optimistic-capture state for an inline single-accelerator
 * rebind box (`KeybindingCaptureInput`).
 *
 * Both the BrainDump and Floating Navigator Settings rows let the user press a
 * key combo to rebind one global toggle. The capture box commits immediately (no
 * blur step), so each row needs the same dance: show the new combo optimistically,
 * push it over IPC, then roll back to the last accepted value when the main
 * process reports a conflict (`persist` resolves `false`) or the call throws. This
 * hook owns that mechanism so the two rows don't duplicate it (CQ-1); the IPC call
 * and the error sink differ per row and are injected.
 *
 * @module hooks/useShortcutCapture
 */
import { useRef, useState } from 'react'

import { KEYBINDING_CONFLICT_MESSAGE } from '@/lib/constants/keybinding'
import { log } from '@/lib/logger'

/** Error copy shown when the IPC call throws (vs. the conflict message on `false`). */
const SHORTCUT_SAVE_FAILED_MESSAGE = 'Failed to update shortcut'

interface UseShortcutCaptureOptions {
  /**
   * Persist + register the captured accelerator over IPC. Resolves `false` when
   * the main process rejects it as a conflict (already bound / silently
   * substituted), or `undefined` when no desktop bridge is present.
   */
  persist: (accelerator: string) => Promise<boolean | undefined>
  /** Surface (or clear, with `null`) an error in the consumer's own error slot. */
  onError: (message: string | null) => void
}

interface UseShortcutCapture {
  /** The accelerator currently shown in the capture box (`''` = disabled). */
  shortcut: string
  /**
   * Seed the captured + last-good value from the loaded config. Call this from
   * the consumer's load effect once the persisted accelerator arrives, so a
   * later conflict rolls back to the saved value rather than the empty default.
   */
  setLoadedShortcut: (accelerator: string) => void
  /** `onChange` handler for `KeybindingCaptureInput`: optimistic set → persist → rollback. */
  capture: (accelerator: string) => Promise<void>
}

/**
 * Owns the optimistic-update + rollback lifecycle for one inline rebind box.
 *
 * @param options - The IPC persist call and an error sink (both injected so the
 *   hook stays UI-agnostic and the consumer keeps a single shared error slot).
 * @returns The displayed accelerator, a seeder for the loaded value, and the
 *   capture handler to wire to `KeybindingCaptureInput.onChange`.
 * @example
 * const { shortcut, setLoadedShortcut, capture } = useShortcutCapture({
 *   persist: (a) => window.electronAPI?.brainDump?.setShortcut(a) ?? Promise.resolve(undefined),
 *   onError: setError,
 * })
 * // load effect: setLoadedShortcut(await api.getShortcut())
 * // <KeybindingCaptureInput value={shortcut} onChange={capture} />
 */
export function useShortcutCapture({
  persist,
  onError,
}: UseShortcutCaptureOptions): UseShortcutCapture {
  const [shortcut, setShortcut] = useState('')
  // Last successfully persisted accelerator — the rollback target, so a conflict
  // restores the saved value, not the in-flight optimistic one held in `shortcut`.
  const lastGoodShortcutRef = useRef('')

  const setLoadedShortcut = (accelerator: string): void => {
    setShortcut(accelerator)
    lastGoodShortcutRef.current = accelerator
  }

  const capture = async (accelerator: string): Promise<void> => {
    // The capture box commits on key-press (no blur), so the optimistic update +
    // registration + rollback all run here.
    setShortcut(accelerator)
    onError(null)
    try {
      const ok = await persist(accelerator)
      if (ok === false) {
        // Already registered elsewhere (or substituted) — revert to last accepted.
        onError(KEYBINDING_CONFLICT_MESSAGE)
        setShortcut(lastGoodShortcutRef.current)
        return
      }
      lastGoodShortcutRef.current = accelerator
    } catch (error) {
      log.error('Failed to update shortcut:', error)
      onError(SHORTCUT_SAVE_FAILED_MESSAGE)
      setShortcut(lastGoodShortcutRef.current)
    }
  }

  return { shortcut, setLoadedShortcut, capture }
}
