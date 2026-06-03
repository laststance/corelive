import '@testing-library/jest-dom/vitest'
import { Storage as HappyDomStorage } from 'happy-dom'

const BROWSER_STORAGE_PROPERTIES = ['localStorage', 'sessionStorage'] as const

/**
 * Ensures Vitest workers use Happy DOM storage when Node exposes a disabled
 * experimental storage global that shadows the browser-like implementation.
 * @param propertyName Browser storage slot to install on `window` and `globalThis`.
 * @returns Nothing; mutates the shared test globals before test files run.
 * @example installBrowserStorage('localStorage')
 */
function installBrowserStorage(
  propertyName: (typeof BROWSER_STORAGE_PROPERTIES)[number],
): void {
  const storage = new HappyDomStorage()

  Object.defineProperty(window, propertyName, {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  })
  Object.defineProperty(globalThis, propertyName, {
    configurable: true,
    enumerable: true,
    value: storage,
    writable: true,
  })
}

for (const propertyName of BROWSER_STORAGE_PROPERTIES) {
  // Node-only test files still load setupFiles, but they do not have a window.
  if (typeof window !== 'undefined') {
    // Node 24 can expose storage as an unavailable experimental global.
    installBrowserStorage(propertyName)
  }
}
