import type { ComponentProps } from 'react'

/**
 * Renders fixture navigation as anchors while preserving the active QA scenario.
 * @example <FixtureLink href="/home#journal">Journal</FixtureLink>
 */
export default function FixtureLink({ href, ...props }: ComponentProps<'a'>) {
  if (!href?.startsWith('/') || href.startsWith('//')) {
    return <a href={href} {...props} />
  }
  const current = new URLSearchParams(window.location.search)
  const destination = new URL(href, window.location.origin)
  for (const key of ['activity', 'delete']) {
    const value = current.get(key)
    if (value !== null && !destination.searchParams.has(key)) {
      destination.searchParams.set(key, value)
    }
  }
  return (
    <a
      href={destination.pathname + destination.search + destination.hash}
      {...props}
    />
  )
}
