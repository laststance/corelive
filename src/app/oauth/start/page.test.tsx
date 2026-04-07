import { render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OAuthStartPage from './page'

const mockAuthenticateWithRedirect = vi.fn()
const clerkState = vi.hoisted(() => ({
  user: null as { id: string } | null,
}))

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    client: {
      signIn: {
        authenticateWithRedirect: mockAuthenticateWithRedirect,
      },
    },
  }),
  useUser: () => ({
    isLoaded: true,
    user: clerkState.user,
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams({
      provider: 'google',
      state: 'state_123',
    }),
}))

describe('OAuthStartPage', () => {
  beforeEach(() => {
    clerkState.user = null
    mockAuthenticateWithRedirect.mockReset()
    mockAuthenticateWithRedirect.mockResolvedValue(undefined)
  })

  it('starts Google OAuth using Clerk redirect flow', async () => {
    render(
      <StrictMode>
        <OAuthStartPage />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith({
        strategy: 'oauth_google',
        redirectUrl: '/oauth/sso-callback?state=state_123',
        redirectUrlComplete: '/oauth/callback?state=state_123',
      })
    })
    expect(mockAuthenticateWithRedirect).toHaveBeenCalledTimes(1)
  })

  it('continues directly to the callback page when the browser is already signed in', async () => {
    clerkState.user = { id: 'user_123' }
    const replaceSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => undefined)

    render(<OAuthStartPage />)

    await waitFor(() => {
      expect(replaceSpy).toHaveBeenCalledWith('/oauth/callback?state=state_123')
    })
    expect(mockAuthenticateWithRedirect).not.toHaveBeenCalled()

    replaceSpy.mockRestore()
  })
})
