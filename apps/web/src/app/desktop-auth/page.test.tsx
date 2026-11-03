import type { OfflineAuthRequest } from '@corelive/desktop-contract/offline-auth'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import DesktopAuthPage from './page'

const state = vi.hoisted(() => ({
  isLoaded: true,
  session: null as null | {
    user: { id: string }
    getToken: (options: { skipCache: boolean }) => Promise<string | null>
  },
}))
const signOut = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@clerk/nextjs', () => ({
  useSession: () => state,
  useClerk: () => ({ signOut }),
}))

const challenge: OfflineAuthRequest = {
  requestId: '6a7a0053-a065-430c-9d5e-e426c874d004',
  generation: 1,
  expectedAccountId: 'account-a',
}

afterEach(() => {
  cleanup()
  delete window.coreliveOfflineAuth
  state.session = null
})

describe('credential-only desktop auth route', () => {
  test('signs out of Clerk and reports signed-out when main asks for a remote revoke', async () => {
    // Arrange
    state.session = {
      user: { id: 'account-a' },
      getToken: async () => 'unused',
    }
    const respond = vi.fn(async () => true)
    const revoke: OfflineAuthRequest = { ...challenge, action: 'sign-out' }
    window.coreliveOfflineAuth = {
      ready: async () => revoke,
      respond,
      onRequest: () => () => undefined,
    }

    // Act
    render(<DesktopAuthPage />)

    // Assert
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ ...revoke, status: 'signed-out' }),
    )
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  // Regression: /ship pre-landing review 2026-11-03 — clerk.signOut() clears the session, which
  // disposed the effect before the reply, so main waited out its 5 s revoke timeout.
  test('still reports signed-out to main when the session ends before the remote sign-out resolves', async () => {
    // Arrange
    signOut.mockClear()
    state.session = {
      user: { id: 'account-a' },
      getToken: async () => 'unused',
    }
    let finishSignOut: () => void = () => undefined
    signOut.mockImplementationOnce(
      async () =>
        new Promise<undefined>((done) => {
          finishSignOut = (): void => done(undefined)
        }),
    )
    const respond = vi.fn(async () => true)
    const revoke: OfflineAuthRequest = { ...challenge, action: 'sign-out' }
    window.coreliveOfflineAuth = {
      ready: async () => revoke,
      respond,
      onRequest: () => () => undefined,
    }
    const view = render(<DesktopAuthPage />)
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))

    // Act: the cleared session disposes the effect before signOut resolves
    view.unmount()
    await act(async () => {
      finishSignOut()
    })

    // Assert
    expect(respond).toHaveBeenCalledWith({ ...revoke, status: 'signed-out' })
  })

  test('refreshes the existing Clerk session only when main has supplied a challenge', async () => {
    // Arrange
    const getToken = vi.fn(async () => 'opaque-test-token')
    state.session = { user: { id: 'account-a' }, getToken }
    const respond = vi.fn(async () => true)
    window.coreliveOfflineAuth = {
      ready: async () => challenge,
      respond,
      onRequest: () => () => undefined,
    }

    // Act
    render(<DesktopAuthPage />)

    // Assert
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({
        ...challenge,
        status: 'ready',
        accountId: 'account-a',
        token: 'opaque-test-token',
      }),
    )
    expect(getToken).toHaveBeenCalledWith({ skipCache: true })
  })

  test('a normal browser or an older preload cannot request or expose a token', async () => {
    // Arrange
    const getToken = vi.fn(async () => 'opaque-test-token')
    state.session = { user: { id: 'account-a' }, getToken }

    // Act
    await act(async () => {
      render(<DesktopAuthPage />)
    })

    // Assert
    expect(getToken).not.toHaveBeenCalled()
  })

  test.each(['signed-out', 'offline', 'different-account'] as const)(
    'reports %s without performing native logout',
    async (condition) => {
      // Arrange
      if (condition !== 'signed-out')
        state.session = {
          user: {
            id: condition === 'different-account' ? 'account-b' : 'account-a',
          },
          getToken: async () => {
            throw new Error('private SDK error')
          },
        }
      const respond = vi.fn(async () => true)
      window.coreliveOfflineAuth = {
        ready: async () => challenge,
        respond,
        onRequest: () => () => undefined,
      }

      // Act
      render(<DesktopAuthPage />)

      // Assert
      await waitFor(() =>
        expect(respond).toHaveBeenCalledWith({
          ...challenge,
          status: condition === 'offline' ? 'unavailable' : 'signed-out',
        }),
      )
    },
  )

  test('a token resolving after the account effect was disposed is discarded', async () => {
    // Arrange
    let resolve: (token: string) => void = () => undefined
    const token = new Promise<string>((done) => {
      resolve = done
    })
    state.session = { user: { id: 'account-a' }, getToken: async () => token }
    const respond = vi.fn(async () => true)
    window.coreliveOfflineAuth = {
      ready: async () => challenge,
      respond,
      onRequest: () => () => undefined,
    }
    const view = render(<DesktopAuthPage />)
    await act(async () => undefined)

    // Act
    view.unmount()
    await act(async () => {
      resolve('old-test-token')
    })

    // Assert
    expect(respond).not.toHaveBeenCalled()
  })
})
