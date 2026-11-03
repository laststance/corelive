import type { SignOutResult } from '@corelive/desktop-contract/offline-account'
import { useCycleEffect } from '@corelive/live-editor/hooks/use-cycle-effect'
import { Button } from '@corelive/live-editor/ui/button'
import { useRef, useState, type RefObject } from 'react'

import { useSettings } from '../SettingsProvider'
import { SettingsSection } from '../SettingsSection'

import { formatRelativeTime, keepsPhrase, needsALookLabel } from './accountCopy'
import { MiddleTruncate } from './MiddleTruncate'

/** What the section shows on top of the account state while an action runs or reports back. */
type Ui =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'confirm-signout' }
  | { kind: 'signing-out' }
  | { kind: 'signed-out' }
  | { kind: 'residual' }
  | { kind: 'clearing' }
  | { kind: 'flush-failed' }
  | { kind: 'offline' }

/** Where focus should land once the next render has the target mounted (DA14). */
type FocusTarget = 'heading' | 'sign-in' | 'sign-out' | 'cancel'

/** Refreshes the CHECKED line every half minute without a re-fetch. */
const CLOCK_TICK_MS = 30_000

/** Props of {@link AccountSection}. */
export interface AccountSectionProps {
  /** Opens the Sync details page inside this window. */
  onOpenSyncDetails: () => void
  /** The Account `<h2>`; the page also focuses it when coming back from Sync details. */
  headingRef: RefObject<HTMLHeadingElement | null>
}

/**
 * Settings ▸ Account, the last section (#216 DA1, DA3-DA6, DX6, DX7).
 *
 * Shows one of four states (never attached, attached, bound but signed out, a different account
 * signed in) with exactly one primary action each, plus the first-connect prompt and progress,
 * the inline sign-out confirm, and the sign-in offline / in-progress / unreachable notes. Main
 * owns every decision (`window.settingsAPI.account.*`); this component only renders the account
 * status from {@link useSettings} and reports the user's choices. Mounted by
 * {@link ElectronSettingsPage}.
 *
 * @param onOpenSyncDetails - Switches the window to the Sync details page.
 * @param headingRef - Ref to the section heading, for focus returns.
 * @example <AccountSection onOpenSyncDetails={open} headingRef={ref} />
 */
export function AccountSection({
  onOpenSyncDetails,
  headingRef,
}: AccountSectionProps) {
  const { api, snapshot, refresh } = useSettings()
  const account = snapshot.account
  const [ui, setUi] = useState<Ui>({ kind: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  // The "keeps are on your dashboard" line appears once: main drops it after this copy is taken.
  const [uploadDone, setUploadDone] = useState<number | null>(null)
  const signInRef = useRef<HTMLButtonElement>(null)
  const signOutRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const previousSignIn = useRef(account.signIn)

  if (account.firstUpload?.state === 'done' && uploadDone === null)
    setUploadDone(account.firstUpload.count)

  useCycleEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return (): void => clearInterval(timer)
  }, [])

  // Tell main the completion line was taken, so reopening Settings does not repeat it.
  const uploadState = account.firstUpload?.state
  useCycleEffect(() => {
    if (uploadState === 'done') void api.account.acknowledgeFirstUpload()
  }, [api, uploadState])

  // Focus returns (DA14): after the login window closes -> heading; after sign-out -> Sign in.
  useCycleEffect(() => {
    const was = previousSignIn.current
    previousSignIn.current = account.signIn
    if (was === 'in-progress' && account.signIn !== 'in-progress')
      headingRef.current?.focus()
    const want = pendingFocus.current
    if (!want) return
    const target = {
      heading: headingRef.current,
      'sign-in': signInRef.current,
      'sign-out': signOutRef.current,
      cancel: cancelRef.current,
    }[want]
    if (target) {
      target.focus()
      pendingFocus.current = null
    }
  })

  /** Re-reads the status after an action; a failed read keeps the last one. */
  const reread = async (): Promise<void> => {
    await refresh().catch(() => undefined)
  }

  /** Folds a sign-out result into the notice and the focus target (DA5, DX6). */
  const applySignOut = (result: SignOutResult): void => {
    if (result.status === 'flush-failed') {
      setUi({ kind: 'flush-failed' })
      pendingFocus.current = 'sign-out'
      return
    }
    setUploadDone(null)
    setUi({ kind: result.status === 'signed-out' ? 'signed-out' : 'residual' })
    pendingFocus.current = 'sign-in'
  }

  /**
   * Runs one account action; a rejected IPC call lands on `fallback` instead of a stuck busy state.
   * @param action - The action body.
   * @param fallback - What to show after a rejection (idle unless a retry must stay offered).
   */
  const guarded = async (
    action: () => Promise<void>,
    fallback: Ui = { kind: 'idle' },
  ): Promise<void> => {
    try {
      await action()
    } catch {
      setUi(fallback)
      await reread()
    }
  }

  const signIn = async (): Promise<void> =>
    guarded(async () => {
      setUi({ kind: 'busy' })
      const result = await api.account.signIn()
      setUi(
        result.status === 'offline' ? { kind: 'offline' } : { kind: 'idle' },
      )
      await reread()
    })
  const cancelSignIn = async (): Promise<void> =>
    guarded(async () => {
      await api.account.cancelSignIn()
      await reread()
    })
  const connect = async (): Promise<void> =>
    guarded(async () => {
      setUi({ kind: 'busy' })
      await api.account.connect()
      setUi({ kind: 'idle' })
      await reread()
    })
  const notNow = async (): Promise<void> =>
    guarded(async () => {
      setUi({ kind: 'busy' })
      const result = await api.account.notNow()
      await reread()
      if (result.status === 'flush-failed') applySignOut(result)
      else setUi({ kind: 'idle' })
    })
  const confirmSignOut = async (): Promise<void> =>
    guarded(async () => {
      setUi({ kind: 'signing-out' })
      const result = await api.account.signOut()
      await reread()
      applySignOut(result)
    })
  const clearAgain = async (): Promise<void> =>
    guarded(
      async () => {
        setUi({ kind: 'clearing' })
        const result = await api.account.clearAgain()
        applySignOut(result)
      },
      // The journal is still set, so Clear again must stay offered.
      { kind: 'residual' },
    )
  const openConfirm = (): void => {
    setUi({ kind: 'confirm-signout' })
    pendingFocus.current = 'cancel'
  }
  const closeConfirm = (): void => {
    setUi({ kind: 'idle' })
    pendingFocus.current = 'sign-out'
  }

  const email = account.boundEmail ?? 'your account'
  // Sign-in waits while a sign-out or Clear again is still ending the session.
  const working =
    ui.kind === 'busy' || ui.kind === 'signing-out' || ui.kind === 'clearing'
  const signInLabel = account.signIn === 'unreachable' ? 'Try again' : 'Sign in'

  const signInButton = (
    <Button
      ref={signInRef}
      data-primary="true"
      disabled={working}
      onClick={() => void signIn()}
    >
      {signInLabel}
    </Button>
  )
  const openDashboardButton = (
    <Button
      data-primary="true"
      onClick={() => void api.account.openDashboard()}
    >
      Open dashboard
    </Button>
  )
  const signOutButton = (primary: boolean) => (
    <Button
      ref={signOutRef}
      variant={primary ? 'default' : 'outline'}
      data-primary={primary ? 'true' : undefined}
      onClick={openConfirm}
    >
      Sign out
    </Button>
  )

  // The sign-out confirm and its running state replace the action row (DA5).
  const confirmRow =
    ui.kind === 'signing-out' ? (
      // Same row wrapper as the other actions, so the Sync details link stays on its own line.
      <div className="flex flex-wrap gap-2">
        <Button disabled>Signing out…</Button>
      </div>
    ) : ui.kind === 'confirm-signout' ? (
      <div
        role="group"
        aria-label="Confirm sign out"
        className="space-y-3"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            closeConfirm()
          }
        }}
      >
        <p>Sign out? Your writing stays on this Mac.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void confirmSignOut()}>Sign out</Button>
          <Button ref={cancelRef} variant="outline" onClick={closeConfirm}>
            Cancel
          </Button>
        </div>
      </div>
    ) : null

  /** B's status line: upload progress, the one-time completion, or the checked line (C22). */
  const statusLine = ((): string => {
    const upload = account.firstUpload
    if (upload?.state === 'uploading' && upload.count > 0)
      return `Sending ${keepsPhrase(upload.count)} to your dashboard…`
    if (uploadDone !== null && uploadDone > 0)
      return `${keepsPhrase(uploadDone)} ${uploadDone === 1 ? 'is' : 'are'} on your dashboard`
    const checked =
      account.lastSyncedAt === null
        ? null
        : formatRelativeTime(account.lastSyncedAt, now)
    if (account.waitingCount > 0)
      return `${keepsPhrase(account.waitingCount)} waiting to send${checked ? ` · checked ${checked}` : ''}`
    return checked ? `Up to date · checked ${checked}` : 'Up to date'
  })()

  let body: React.ReactNode
  if (account.pendingConnect && account.signIn !== 'in-progress') {
    // DA4: nothing is bound or sent until Connect this Mac.
    body = (
      <>
        <p>
          Connect this Mac to{' '}
          <MiddleTruncate
            text={account.pendingConnect.displayEmail || 'your account'}
          />
          ? Your keeps and categories on this Mac will appear on the dashboard.
          Your writing stays on this Mac.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            data-primary="true"
            disabled={working}
            onClick={() => void connect()}
          >
            Connect this Mac
          </Button>
          <Button
            variant="outline"
            disabled={working}
            onClick={() => void notNow()}
          >
            Not now
          </Button>
        </div>
      </>
    )
  } else if (account.signIn === 'in-progress') {
    body = (
      <>
        <p role="status">Finishing sign-in in the other window…</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void cancelSignIn()}>
            Cancel
          </Button>
        </div>
      </>
    )
  } else if (account.state === 'attached') {
    body = (
      <>
        <p className="font-medium">
          <MiddleTruncate text={email} />
        </p>
        <p className="type-small leading-5 text-muted-foreground">
          {statusLine}
        </p>
        {confirmRow ?? (
          <div className="flex flex-wrap gap-2">
            {openDashboardButton}
            {signOutButton(false)}
          </div>
        )}
      </>
    )
  } else if (account.state === 'other-account') {
    body = (
      <>
        <p>
          This Mac syncs with <MiddleTruncate text={email} />. You&apos;re
          signed in as{' '}
          <MiddleTruncate text={account.signedInEmail ?? 'another account'} />.
        </p>
        {confirmRow ?? (
          <div className="flex flex-wrap gap-2">{signOutButton(true)}</div>
        )}
      </>
    )
  } else if (account.state === 'signed-out') {
    body = (
      <>
        <p>
          This Mac syncs with <MiddleTruncate text={email} />. Your writing
          stays on this Mac.
        </p>
        <div className="flex flex-wrap gap-2">{signInButton}</div>
      </>
    )
  } else {
    body = (
      <>
        <p>
          Your writing is saved on this Mac. Sign in to also see it on the
          dashboard.
        </p>
        <div className="flex flex-wrap gap-2">{signInButton}</div>
      </>
    )
  }

  const lookCount = account.needsALookCount
  // A sign-in that re-attached this Mac since the sign-out makes its notes stale; main pushes the state.
  const showsSignOutNotes = account.state !== 'attached'
  return (
    <SettingsSection label="Account" headingRef={headingRef}>
      <div className="space-y-3">
        {showsSignOutNotes && ui.kind === 'signed-out' && (
          <p role="status" className="type-small text-muted-foreground">
            Signed out. Your writing is still here.
          </p>
        )}
        {showsSignOutNotes &&
          (ui.kind === 'residual' || ui.kind === 'clearing') && (
            <div role="status" className="space-y-2">
              <p className="type-small text-muted-foreground">
                Signed out. Some sign-in data couldn&apos;t be cleared from this
                Mac.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={ui.kind === 'clearing'}
                onClick={() => void clearAgain()}
              >
                {ui.kind === 'clearing' ? 'Clearing…' : 'Clear again'}
              </Button>
            </div>
          )}
        {ui.kind === 'flush-failed' && (
          <p role="alert" className="type-small text-destructive">
            Not saved — retry or copy your writing
          </p>
        )}
        {ui.kind === 'offline' && (
          <p role="alert" className="type-small text-muted-foreground">
            Sign-in needs an internet connection. Your writing is saved on this
            Mac.
          </p>
        )}
        {account.signIn === 'unreachable' && (
          <p role="alert" className="type-small text-muted-foreground">
            Couldn&apos;t reach the sign-in page. Your writing is saved on this
            Mac.
          </p>
        )}
        {body}
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-muted-foreground"
          onClick={onOpenSyncDetails}
        >
          {lookCount > 0 ? needsALookLabel(lookCount) : 'Sync details'}
        </Button>
      </div>
    </SettingsSection>
  )
}
