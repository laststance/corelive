import type { ComponentProps } from 'react'

import { navigateFixtureHome } from './navigation'

/**
 * Preserves QA modes on local links and mirrors Next's in-page Home navigation.
 * @example <FixtureLink href="/home#journal">Journal</FixtureLink>
 */
export default function FixtureLink({
  href,
  onClick,
  ...props
}: ComponentProps<'a'>) {
  const destination =
    href?.startsWith('/') && !href.startsWith('//')
      ? new URL(href, window.location.origin)
      : null
  if (destination?.origin !== window.location.origin) {
    return <a href={href} onClick={onClick} {...props} />
  }
  const current = new URLSearchParams(window.location.search)
  for (const key of ['activity', 'delete']) {
    const value = current.get(key)
    if (value !== null && !destination.searchParams.has(key)) {
      destination.searchParams.set(key, value)
    }
  }
  if (destination.pathname === '/settings')
    destination.searchParams.set('view', 'appearance')
  // The existing unsupported-view screen explains this fixture's scope.
  if (destination.pathname === '/skill-tree')
    destination.searchParams.set('view', 'skill-tree')
  const { pathname } = window.location
  const staysInHome =
    (pathname === '/' || pathname === '/home') &&
    (current.get('view') ?? 'home') === 'home' &&
    destination.pathname === '/home' &&
    (destination.searchParams.get('view') ?? 'home') === 'home'

  return (
    <a
      href={destination.pathname + destination.search + destination.hash}
      onClick={(event): void => {
        onClick?.(event)
        const { target } = event.currentTarget
        if (
          !staysInHome ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (target && target.toLowerCase() !== '_self') ||
          event.currentTarget.hasAttribute('download')
        ) {
          return
        }
        event.preventDefault()
        navigateFixtureHome(destination)
      }}
      {...props}
    />
  )
}
