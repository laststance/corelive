import { useSyncExternalStore } from 'react'

/** Mirrors Next's search-param notifications for native history writes in headless Chromium. */
function subscribe(onChange: () => void) {
  const navigation = (window as Window & { navigation?: EventTarget })
    .navigation
  navigation?.addEventListener('currententrychange', onChange)
  window.addEventListener('popstate', onChange)
  return (): void => {
    navigation?.removeEventListener('currententrychange', onChange)
    window.removeEventListener('popstate', onChange)
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
