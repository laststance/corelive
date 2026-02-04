import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// IME変換中はEnterキーでSubmitしない
export function isEnterKeyPress(event: React.KeyboardEvent): boolean {
  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
    return true
  }
  return false
}

/**
 * Detects if the user's Mac has Apple Silicon (ARM) processor.
 * Uses navigator.userAgent heuristics since direct detection is limited in browsers.
 * @returns
 * - true: Likely Apple Silicon Mac
 * - false: Likely Intel Mac or non-Mac
 * @example
 * isAppleSilicon() // => true on M1/M2/M3 Macs
 */
export const isAppleSilicon = (): boolean => {
  if (typeof navigator === 'undefined') return true // SSR default to ARM

  const ua = navigator.userAgent
  const isMac = ua.includes('Mac')

  if (!isMac) return false

  // Check for explicit ARM indicators
  // Safari on Apple Silicon includes "Mac OS X" but we can detect via other means
  // Modern approach: check if running on ARM via navigator.userAgentData (Chrome-based)
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { platform: string } }
  ).userAgentData
  if (userAgentData?.platform === 'macOS') {
    // Chrome-based browsers on macOS - default to ARM (most new Macs)
    return true
  }

  // Fallback: Most Macs sold since late 2020 are Apple Silicon
  // Default to ARM for better user experience (can always use Intel link if needed)
  return true
}
