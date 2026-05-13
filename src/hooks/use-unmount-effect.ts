import { useEffect } from 'react'

/**
 * Runs a callback only when the component unmounts.
 *
 * Use this for teardown work that has no mount-time side effect of its own.
 *
 * @param callback - Cleanup callback invoked during unmount.
 * @returns Nothing; React owns the unmount lifecycle.
 * @example
 * useUnmountEffect(() => {
 *   connection.close()
 * })
 */
export function useUnmountEffect(callback: () => void): void {
  useEffect(() => {
    // React calls the returned function during unmount.
    return () => callback()
  }, [])
}
