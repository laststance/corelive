/**
 * @fileoverview Login redirect pin. A `/write` visitor who signs in must land back
 * on `/write`; with `fallbackRedirectUrl` the env-level force URL (`/home`) won,
 * so the round trip silently dropped them on the dashboard. `forceRedirectUrl`
 * makes the proxy's `redirect_url` deterministic — and still `/home` without it.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LoginPage from './page'

const { signInProps } = vi.hoisted(() => ({
  signInProps: { current: null as Record<string, unknown> | null },
}))

vi.mock('@clerk/nextjs', () => ({
  // Capture what the page hands Clerk's <SignIn>; the widget itself is not under test.
  SignIn: (props: Record<string, unknown>) => {
    signInProps.current = props
    return <div data-testid="sign-in" />
  },
  useUser: () => ({ user: null, isLoaded: true }),
}))

vi.mock('@/components/auth/ElectronLoginForm', () => ({
  ElectronLoginForm: () => null,
  useIsElectron: () => false,
}))

/**
 * Points the happy-dom location at the login URL under test.
 * @param search - Query string including the leading `?`, or `''`.
 * @returns Nothing.
 * @example
 * visitLogin('?redirect_url=/write')
 */
function visitLogin(search: string): void {
  window.history.replaceState(null, '', `/login${search}`)
}

beforeEach(() => {
  signInProps.current = null
})

describe('login page post-sign-in destination', () => {
  it('sends a /write visitor back to /write after signing in', () => {
    // Arrange
    visitLogin('?redirect_url=/write')

    // Act
    render(<LoginPage />)

    // Assert: a FORCE redirect, so the env force URL cannot override it.
    expect(screen.getByTestId('sign-in')).toBeInTheDocument()
    expect(signInProps.current).toEqual({ forceRedirectUrl: '/write' })
  })

  it('still lands on /home when no redirect_url was given', () => {
    // Arrange
    visitLogin('')

    // Act
    render(<LoginPage />)

    // Assert
    expect(signInProps.current).toEqual({ forceRedirectUrl: '/home' })
  })

  it('refuses a cross-origin redirect_url and falls back to /home', () => {
    // Arrange
    visitLogin('?redirect_url=https://evil.example/phish')

    // Act
    render(<LoginPage />)

    // Assert
    expect(signInProps.current).toEqual({ forceRedirectUrl: '/home' })
  })
})
