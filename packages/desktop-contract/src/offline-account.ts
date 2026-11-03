/**
 * Account attachment contracts for the account-optional desktop editor (#216 D2, D3, DA3, DA4, DX6).
 *
 * The Settings preload (step 5) and the main-process controller share these shapes. They carry
 * names and counts only, never credentials, cookie values or writing text (DX7 redaction).
 *
 * @module offline-account
 */
import { z } from 'zod'

/** Result of {@link SignOutResult} producers: `signOutDevice()` (C23, DX6). */
export const SignOutResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed-out') }),
  z.object({
    status: z.literal('signed-out-residual'),
    code: z.literal('SIGNOUT_RESIDUAL_COOKIE'),
    cookieNames: z.array(z.string()),
    domains: z.array(z.string()),
  }),
  z.object({
    status: z.literal('flush-failed'),
    code: z.literal('SIGNOUT_FLUSH_FAILED'),
  }),
])
export type SignOutResult = z.infer<typeof SignOutResultSchema>

/** DA3 states: A never attached, B attached, C bound but signed out, D another account signed in. */
export type AccountState =
  'never-attached' | 'attached' | 'signed-out' | 'other-account'

/**
 * Progress of a Settings-initiated sign-in (DA6, DX7): `in-progress` while the login window is
 * open, `unreachable` after `SIGNIN_PAGE_UNREACHABLE`, otherwise `idle`.
 */
export type SignInProgress = 'idle' | 'in-progress' | 'unreachable'

/** Result of asking main to start a sign-in (DA6): offline never opens the login window. */
export type SignInStartResult = { status: 'opened' } | { status: 'offline' }

/** What Settings ▸ Account renders (X1, DA3, DA4). */
export interface AccountStatus {
  state: AccountState
  boundEmail: string | null
  /** The verified email of a different signed-in account (state D). */
  signedInEmail: string | null
  waitingCount: number
  /** "Needs a look" rows on the Sync details page; the DA3 link shows only when above 0. */
  needsALookCount: number
  lastSyncedAt: number | null
  /** Set until Connect / Not now after a first sign-in on an unbound Mac (EA2b). */
  pendingConnect: { displayEmail: string } | null
  /** First-upload progress after Connect (DA4). */
  firstUpload: { state: 'uploading' | 'done'; count: number } | null
  /** The login window's progress, owned by main's sign-in coordinator (DA6). */
  signIn: SignInProgress
}
