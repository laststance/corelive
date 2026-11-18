import { useSyncExternalStore } from 'react'

function getBrowserNavigation(): EventTarget | undefined {
  const browser: Window & { navigation?: EventTarget } = window
  return browser.navigation
}

/** Mirrors Next's search-param notifications for native history writes in headless Chromium. */
function subscribe(onChange: () => void) {
  const navigation = getBrowserNavigation()
  navigation?.addEventListener('currententrychange', onChange)
  window.addEventListener('popstate', onChange)
  return (): void => {
    navigation?.removeEventListener('currententrychange', onChange)
    window.removeEventListener('popstate', onChange)
  }
}

/**
 * Applies a Home link without remounting the fixture or losing its edited data.
 * Called by the link shim for ordinary clicks within the fixture's Home view.
 * @example navigateFixtureHome(new URL('/home?category=1#journal', location.href))
 */
export function navigateFixtureHome(destination: URL): void {
  if (destination.href !== window.location.href) {
    window.history.pushState(null, '', destination)
    // Happy DOM lacks Chromium's currententrychange event for history writes.
    if (!getBrowserNavigation())
      window.dispatchEvent(new PopStateEvent('popstate'))
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
