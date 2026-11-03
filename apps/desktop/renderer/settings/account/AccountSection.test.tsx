// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import type { AccountStatus } from '@corelive/desktop-contract/offline-account'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { renderWithSettings } from '../settingsTestkit'

import { AccountSection } from './AccountSection'

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

/** Mounts the section with a heading ref, like ElectronSettingsPage does. */
function Harness({ onOpen = () => undefined }: { onOpen?: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  return <AccountSection headingRef={headingRef} onOpenSyncDetails={onOpen} />
}

const ATTACHED: Partial<AccountStatus> = {
  state: 'attached',
  boundEmail: 'raphtalia@example.com',
  lastSyncedAt: NOW - 5 * 60_000,
}

/** The primary actions of the Account section (buttons flagged data-primary). */
function primaryButtons(): string[] {
  return screen
    .getAllByRole('button')
    .filter((button) => button.dataset.primary === 'true')
    .map((button) => button.textContent ?? '')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
})

test('state A offers the dashboard sign-in as its only primary action', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />)

  // Assert
  expect(
    screen.getByText(
      'Your writing is saved on this Mac. Sign in to also see it on the dashboard.',
    ),
  ).toBeVisible()
  expect(primaryButtons()).toEqual(['Sign in'])
})

test('state B shows the email, an up-to-date line and Open dashboard as the only primary action', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, { account: ATTACHED })

  // Assert
  expect(screen.getByText('raphtalia@example.com')).toBeVisible()
  expect(screen.getByText('Up to date · checked 5 minutes ago')).toBeVisible()
  expect(primaryButtons()).toEqual(['Open dashboard'])
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
  expect(screen.queryByText(/changes? needs? a look/)).toBeNull()
})

test('state B never claims everything is on the dashboard while keeps wait, and links changes that need a look', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, {
    account: { ...ATTACHED, waitingCount: 3, needsALookCount: 2 },
  })

  // Assert
  expect(
    screen.getByText('3 keeps waiting to send · checked 5 minutes ago'),
  ).toBeVisible()
  expect(screen.queryByText(/Up to date/)).toBeNull()
  expect(
    screen.getByRole('button', { name: '2 changes need a look' }),
  ).toBeVisible()
})

test('state B falls back to "your account" when no verified email is known', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, {
    account: { ...ATTACHED, boundEmail: null },
  })

  // Assert
  expect(screen.getByText('your account')).toBeVisible()
})

test('state C says this Mac syncs with the bound account and offers Sign in as its only primary action', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, {
    account: { state: 'signed-out', boundEmail: 'raphtalia@example.com' },
  })

  // Assert
  expect(
    screen.getByText(/This Mac syncs with/).closest('p'),
  ).toHaveTextContent(
    'This Mac syncs with raphtalia@example.com. Your writing stays on this Mac.',
  )
  expect(primaryButtons()).toEqual(['Sign in'])
})

test('state D names both accounts and offers Sign out as its only primary action', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, {
    account: {
      state: 'other-account',
      boundEmail: 'raphtalia@example.com',
      signedInEmail: 'other@example.com',
    },
  })

  // Assert
  expect(
    screen.getByText(/This Mac syncs with/).closest('p'),
  ).toHaveTextContent(
    "This Mac syncs with raphtalia@example.com. You're signed in as other@example.com.",
  )
  expect(primaryButtons()).toEqual(['Sign out'])
})

test('a long email is shortened in the middle with the full address in the title and accessible name', async () => {
  // Arrange
  const email = 'someone.with.a.very.long.name@example-company.com'

  // Act
  await renderWithSettings(<Harness />, {
    account: { ...ATTACHED, boundEmail: email },
  })

  // Assert
  expect(screen.getByTitle(email)).toBeVisible()
  expect(screen.getByText(email)).toBeInTheDocument()
})

test('Not now declines the pending connect and keeps state A', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, {
    account: { pendingConnect: { displayEmail: 'raphtalia@example.com' } },
  })
  expect(
    screen.getByText(/Connect this Mac to/).closest('p'),
  ).toHaveTextContent(
    'Connect this Mac to raphtalia@example.com? Your keeps and categories on this Mac will appear on the dashboard. Your writing stays on this Mac.',
  )
  expect(primaryButtons()).toEqual(['Connect this Mac'])
  fake.api.account.notNow.mockImplementation(async () => {
    fake.setAccount({ pendingConnect: null })
    return { status: 'signed-out' }
  })

  // Act
  await user.click(screen.getByRole('button', { name: 'Not now' }))

  // Assert
  await waitFor(() => expect(fake.api.account.notNow).toHaveBeenCalledOnce())
  expect(fake.api.account.connect).not.toHaveBeenCalled()
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('Connect this Mac sends the connect request, then shows progress and the one-time completion with Open dashboard', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, {
    account: { pendingConnect: { displayEmail: 'raphtalia@example.com' } },
  })
  fake.api.account.connect.mockImplementation(async () => {
    fake.setAccount({
      ...ATTACHED,
      pendingConnect: null,
      firstUpload: { state: 'uploading', count: 12 },
    })
    return true
  })

  // Act
  await user.click(screen.getByRole('button', { name: 'Connect this Mac' }))

  // Assert: progress
  expect(
    await screen.findByText('Sending 12 keeps to your dashboard…'),
  ).toBeVisible()

  // Act: the first upload finishes
  fake.setAccount({ firstUpload: { state: 'done', count: 12 } })

  // Assert: completion once, then main is told it was shown
  expect(
    await screen.findByText('12 keeps are on your dashboard'),
  ).toBeVisible()
  expect(primaryButtons()).toEqual(['Open dashboard'])
  await waitFor(() =>
    expect(fake.api.account.acknowledgeFirstUpload).toHaveBeenCalled(),
  )
  fake.setAccount({ firstUpload: null })
  expect(
    await screen.findByText('12 keeps are on your dashboard'),
  ).toBeVisible()
})

test('Open dashboard asks main to open it without supplying an address', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, { account: ATTACHED })

  // Act
  await user.click(screen.getByRole('button', { name: 'Open dashboard' }))

  // Assert
  expect(fake.api.account.openDashboard).toHaveBeenCalledExactlyOnceWith()
})

test('Sign out asks for inline confirmation and Cancel keeps the account', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, { account: ATTACHED })

  // Act
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  // Assert
  expect(
    screen.getByText('Sign out? Your writing stays on this Mac.'),
  ).toBeVisible()

  // Act
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  // Assert
  expect(fake.api.account.signOut).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
})

test('Escape closes the sign-out confirm and returns focus to Sign out', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await renderWithSettings(<Harness />, { account: ATTACHED })
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus(),
  )

  // Act
  await user.keyboard('{Escape}')

  // Assert
  expect(
    screen.queryByText('Sign out? Your writing stays on this Mac.'),
  ).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus()
})

test('signing out shows a disabled "Signing out…" while it runs, then state C with the one-time notice and focus on Sign in', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, { account: ATTACHED })
  let finish: () => void = () => undefined
  fake.api.account.signOut.mockImplementation(
    async () =>
      new Promise((resolve) => {
        finish = (): void => {
          fake.setAccount({ state: 'signed-out' })
          resolve({ status: 'signed-out' })
        }
      }),
  )
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  // Act
  await user.click(
    within(screen.getByRole('group', { name: 'Confirm sign out' })).getByRole(
      'button',
      { name: 'Sign out' },
    ),
  )

  // Assert: running
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled()

  // Act
  finish()

  // Assert: done
  expect(
    await screen.findByText('Signed out. Your writing is still here.'),
  ).toBeVisible()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus(),
  )
  expect(
    screen.getByText(/This Mac syncs with/).closest('p'),
  ).toHaveTextContent('This Mac syncs with raphtalia@example.com.')
})

test('a residual sign-in cookie shows the cleanup note instead of plain success, and Clear again completes it', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, { account: ATTACHED })
  fake.api.account.signOut.mockImplementation(async () => {
    fake.setAccount({ state: 'signed-out' })
    return {
      status: 'signed-out-residual',
      code: 'SIGNOUT_RESIDUAL_COOKIE',
      cookieNames: ['__client'],
      domains: ['clerk.corelive.app'],
    }
  })
  await user.click(screen.getByRole('button', { name: 'Sign out' }))
  await user.click(
    within(screen.getByRole('group', { name: 'Confirm sign out' })).getByRole(
      'button',
      { name: 'Sign out' },
    ),
  )

  // Assert: residual copy, never the plain success line
  expect(
    await screen.findByText(
      "Signed out. Some sign-in data couldn't be cleared from this Mac.",
    ),
  ).toBeVisible()
  expect(
    screen.queryByText('Signed out. Your writing is still here.'),
  ).toBeNull()

  // Act
  await user.click(screen.getByRole('button', { name: 'Clear again' }))

  // Assert
  expect(fake.api.account.clearAgain).toHaveBeenCalledOnce()
  expect(
    await screen.findByText('Signed out. Your writing is still here.'),
  ).toBeVisible()
})

test('a failed disk flush keeps the account signed in and says the writing was not saved', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, { account: ATTACHED })
  fake.api.account.signOut.mockResolvedValue({
    status: 'flush-failed',
    code: 'SIGNOUT_FLUSH_FAILED',
  })
  await user.click(screen.getByRole('button', { name: 'Sign out' }))

  // Act
  await user.click(
    within(screen.getByRole('group', { name: 'Confirm sign out' })).getByRole(
      'button',
      { name: 'Sign out' },
    ),
  )

  // Assert
  expect(
    await screen.findByText('Not saved — retry or copy your writing'),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Open dashboard' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('sign-in while offline shows the offline note and never claims the login window opened', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />)
  fake.api.account.signIn.mockResolvedValue({ status: 'offline' })

  // Act
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  // Assert
  expect(
    await screen.findByText(
      'Sign-in needs an internet connection. Your writing is saved on this Mac.',
    ),
  ).toBeVisible()
  expect(
    screen.queryByText('Finishing sign-in in the other window…'),
  ).toBeNull()
})

test('while the login window is open Account shows Finishing sign-in with Cancel, and Cancel asks main to close it', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const { fake } = await renderWithSettings(<Harness />, {
    account: { signIn: 'in-progress' },
  })
  expect(
    screen.getByText('Finishing sign-in in the other window…'),
  ).toBeVisible()
  fake.api.account.cancelSignIn.mockImplementation(async () => {
    fake.setAccount({ signIn: 'idle' })
  })

  // Act
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  // Assert: previous state returns, focus lands on the Account heading
  expect(fake.api.account.cancelSignIn).toHaveBeenCalledOnce()
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible()
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Account' })).toHaveFocus(),
  )
})

test('closing the login window without signing in returns Account to its previous state', async () => {
  // Arrange
  const { fake } = await renderWithSettings(<Harness />, {
    account: {
      state: 'signed-out',
      boundEmail: 'raphtalia@example.com',
      signIn: 'in-progress',
    },
  })

  // Act
  fake.setAccount({ signIn: 'idle' })

  // Assert
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(
    screen.queryByText('Finishing sign-in in the other window…'),
  ).toBeNull()
})

test('an unreachable sign-in page says so and offers Try again as the only primary action', async () => {
  // Arrange / Act
  await renderWithSettings(<Harness />, { account: { signIn: 'unreachable' } })

  // Assert
  expect(
    screen.getByText(
      "Couldn't reach the sign-in page. Your writing is saved on this Mac.",
    ),
  ).toBeVisible()
  expect(primaryButtons()).toEqual(['Try again'])
})

test('Sync details link opens the page callback even when nothing needs a look', async () => {
  // Arrange
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const onOpen = vi.fn()
  await renderWithSettings(<Harness onOpen={onOpen} />)

  // Act
  await user.click(screen.getByRole('button', { name: 'Sync details' }))

  // Assert
  expect(onOpen).toHaveBeenCalledOnce()
})
