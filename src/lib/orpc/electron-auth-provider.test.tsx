import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ElectronAuthProvider } from './electron-auth-provider'

const mockCreate = vi.fn()
const mockSetActive = vi.fn()
const mockClearPendingToken = vi.fn()
const mockGetPendingToken = vi.fn()
const mockOnSignInToken = vi.fn()
const clerkState = vi.hoisted(() => ({
  client: null as {
    signIn: {
      create: typeof mockCreate
    }
  } | null,
  signIn: null as {
    status: string
  } | null,
  user: null as { id: string } | null,
}))
const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

let signInTokenListener:
  ((data: { provider: string; token: string }) => Promise<void>) | null = null

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({
    client: clerkState.client,
    setActive: mockSetActive,
  }),
  useSignIn: () => ({
    fetchStatus: 'idle',
    signIn: clerkState.signIn,
  }),
  useUser: () => ({
    isLoaded: true,
    user: clerkState.user,
  }),
}))

vi.mock('../../../electron/utils/electron-client', () => ({
  isElectronEnvironment: () => true,
}))

vi.mock('../logger', () => ({
  log: {
    debug: loggerMocks.debug,
    error: loggerMocks.error,
    info: loggerMocks.info,
  },
}))

describe('ElectronAuthProvider', () => {
  beforeEach(() => {
    clerkState.client = {
      signIn: {
        create: mockCreate,
      },
    }
    clerkState.user = null
    mockCreate.mockReset()
    mockSetActive.mockReset()
    mockClearPendingToken.mockReset()
    mockGetPendingToken.mockReset()
    mockOnSignInToken.mockReset()
    loggerMocks.debug.mockReset()
    loggerMocks.error.mockReset()
    loggerMocks.info.mockReset()
    signInTokenListener = null

    clerkState.signIn = {
      status: 'needs_identifier',
    }

    mockGetPendingToken.mockResolvedValue(null)
    mockClearPendingToken.mockResolvedValue(true)
    mockOnSignInToken.mockImplementation((callback) => {
      signInTokenListener = callback
      return () => {
        signInTokenListener = null
      }
    })

    window.electronAPI = {
      auth: {
        getUser: vi.fn(),
        isAuthenticated: vi.fn(),
        logout: vi.fn(),
        setUser: vi.fn(),
        syncFromWeb: vi.fn(),
      },
      oauth: {
        cancel: vi.fn(),
        clearPendingToken: mockClearPendingToken,
        getPendingToken: mockGetPendingToken,
        getSupportedProviders: vi.fn(),
        onError: vi.fn(),
        onSignInToken: mockOnSignInToken,
        start: vi.fn(),
      },
    } as unknown as Window['electronAPI']
  })

  test('keeps rejected sign-in tickets out of error logs', async () => {
    // Arrange
    mockCreate.mockRejectedValue(
      new Error('Rejected ticket: sensitive-ticket-for-log-regression'),
    )
    render(
      <ElectronAuthProvider>
        <div>child</div>
      </ElectronAuthProvider>,
    )

    // Act
    await act(async () => {
      await signInTokenListener?.({
        provider: 'google',
        token: 'sensitive-ticket-for-log-regression',
      })
    })

    // Assert
    expect(loggerMocks.error).toHaveBeenCalledExactlyOnceWith(
      '[OAuth] Token exchange failed:',
      { provider: 'google' },
    )
    expect(mockSetActive).not.toHaveBeenCalled()
  })

  test.each(['live listener', 'main-process backlog', 'temporary listener'])(
    'keeps sign-in tickets out of logs when received through the %s',
    async (deliveryPath) => {
      // Arrange
      mockCreate.mockResolvedValue({
        createdSessionId: 'sess_log_safe',
        status: 'complete',
      })
      mockSetActive.mockResolvedValue(undefined)
      if (deliveryPath === 'main-process backlog') {
        // Model a ticket that arrived before this renderer mounted.
        mockGetPendingToken.mockResolvedValue({
          provider: 'google',
          token: 'sensitive-ticket-for-log-regression',
        })
      }
      if (deliveryPath === 'temporary listener') {
        // Hold Clerk readiness until the temporary listener receives the ticket.
        clerkState.signIn = null
      }
      const { rerender } = render(
        <ElectronAuthProvider>
          <div>child</div>
        </ElectronAuthProvider>,
      )

      // Act
      if (deliveryPath !== 'main-process backlog') {
        await act(async () => {
          await signInTokenListener?.({
            provider: 'google',
            token: 'sensitive-ticket-for-log-regression',
          })
        })
      }
      if (deliveryPath === 'temporary listener') {
        // Finish Clerk initialization so the stored ticket is exchanged.
        clerkState.signIn = { status: 'needs_identifier' }
        rerender(
          <ElectronAuthProvider>
            <div>child</div>
          </ElectronAuthProvider>,
        )
      }

      // Assert
      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledTimes(1)
      })
      expect(mockCreate).toHaveBeenCalledWith({
        strategy: 'ticket',
        ticket: 'sensitive-ticket-for-log-regression',
      })
      expect(
        JSON.stringify([
          ...loggerMocks.info.mock.calls,
          ...loggerMocks.debug.mock.calls,
          ...loggerMocks.error.mock.calls,
        ]),
      ).not.toContain('sensitive-')
    },
  )

  test('consumes the Electron sign-in token with Clerk ticket strategy', async () => {
    mockCreate.mockResolvedValue({
      createdSessionId: 'sess_123',
      status: 'complete',
    })
    mockSetActive.mockResolvedValue(undefined)

    render(
      <ElectronAuthProvider>
        <div>child</div>
      </ElectronAuthProvider>,
    )

    await act(async () => {
      await signInTokenListener?.({ provider: 'google', token: 'ticket_123' })
    })

    expect(mockCreate).toHaveBeenCalledWith({
      strategy: 'ticket',
      ticket: 'ticket_123',
    })
    expect(mockClearPendingToken).toHaveBeenCalled()
    await waitFor(() => {
      expect(mockSetActive).toHaveBeenCalledTimes(1)
    })
    expect(mockSetActive).toHaveBeenCalledWith(
      expect.objectContaining({
        session: 'sess_123',
      }),
    )
  })

  test('emits an OAuth error when Clerk requires second factor after ticket exchange', async () => {
    const receivedErrors: string[] = []

    mockCreate.mockResolvedValue({
      createdSessionId: null,
      status: 'needs_second_factor',
    })
    window.addEventListener('electron-oauth-error', (event) => {
      receivedErrors.push((event as CustomEvent<string>).detail)
    })

    render(
      <ElectronAuthProvider>
        <div>child</div>
      </ElectronAuthProvider>,
    )

    await act(async () => {
      await signInTokenListener?.({ provider: 'google', token: 'ticket_456' })
    })

    expect(mockClearPendingToken).toHaveBeenCalled()
    await waitFor(() => {
      expect(receivedErrors).toContain(
        'Multi-factor authentication is required. Please use browser sign-in.',
      )
    })
  })
})
