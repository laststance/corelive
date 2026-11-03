export const usePathname = () =>
  new URLSearchParams(location.search).get('view') === 'home'
    ? '/home'
    : '/settings'
export const useRouter = () => ({
  push: () => undefined,
  replace: () => undefined,
  refresh: () => undefined,
  back: () => undefined,
})
export const useSearchParams = () => new URLSearchParams(location.search)
