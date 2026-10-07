/**
 * Whether the visitor is on an Apple platform, so shortcut copy shows ⌘ instead
 * of Ctrl. Read after mount only (the server assumes Apple) to keep hydration quiet.
 * @returns true on macOS / iOS / iPadOS or on the server; false elsewhere.
 * @example
 * isApplePlatform() // => true on a Mac
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return true
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}
