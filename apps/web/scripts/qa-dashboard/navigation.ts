import { useSyncExternalStore } from 'react'

const HISTORY_CHANGE = 'qa-fixture-history-change'

function getBrowserNavigation(): EventTarget | undefined {
  const browser: Window & { navigation?: EventTarget } = window
  return browser.navigation
}

/** Mirrors Next's search-param notifications for native history writes. */
function subscribe(onChange: () => void) {
  const navigation = getBrowserNavigation()
  navigation?.addEventListener('currententrychange', onChange)
  window.addEventListener('popstate', onChange)
  window.addEventListener(HISTORY_CHANGE, onChange)
  return (): void => {
    navigation?.removeEventListener('currententrychange', onChange)
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(HISTORY_CHANGE, onChange)
  }
}

/**
 * Makes the fixture's subscribers observe History API writes in Happy DOM.
 * The Home fixture installs this fallback only when native Navigation events are unavailable.
 * @throws If a history method cannot be overridden, after restoring the original descriptors.
 * @example const restoreHistory = installFixtureHistoryNotifications()
 */
export function installFixtureHistoryNotifications(): (() => void) | undefined {
  if (getBrowserNavigation()) return undefined

  const history = window.history
  const methods = ['pushState', 'replaceState'] as const
  const previous = methods.map((method) => ({
    method,
    descriptor: Object.getOwnPropertyDescriptor(history, method),
  }))
  const restore = (): void => {
    for (const { method, descriptor } of previous) {
      if (descriptor) Object.defineProperty(history, method, descriptor)
      else Reflect.deleteProperty(history, method)
    }
  }
  try {
    for (const method of methods) {
      const original = history[method]
      history[method] = function (
        this: History,
        ...args: Parameters<History['pushState']>
      ): void {
        original.apply(this, args)
        window.dispatchEvent(new Event(HISTORY_CHANGE))
      }
    }
  } catch (error) {
    restore()
    throw error
  }
  return restore
}

/**
 * Applies a Home link without remounting the fixture or losing its edited data.
 * Called by the link shim for ordinary clicks within the fixture's Home view.
 * @example navigateFixtureHome(new URL('/home?category=1#journal', location.href))
 */
export function navigateFixtureHome(destination: URL): void {
  if (destination.href !== window.location.href) {
    window.history.pushState(null, '', destination)
  }
  if (destination.hash === '#journal') {
    const journal = document.getElementById('journal')
    journal?.scrollIntoView()
    journal?.focus({ preventScroll: true })
  } else if (!destination.hash) {
    window.scrollTo(0, 0)
  }
}

const currentSearch = () => location.search

export const useSearchParams = () =>
  new URLSearchParams(useSyncExternalStore(subscribe, currentSearch))

export const usePathname = () =>
  useSearchParams().get('view') === 'appearance' ? '/settings' : '/home'

export const useRouter = () => ({
  push: () => undefined,
  replace: () => undefined,
  refresh: () => undefined,
  back: () => undefined,
})
