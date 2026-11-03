/**
 * The single source of truth for fixture names and states (#216 DX1, DX2, EA16).
 *
 * `qa-offline-editor.ts` and `qa-settings.ts` read these lists for `--help`, argument checks, the
 * in-page state picker and the `--screenshots` runs, so a name can never drift between them.
 *
 * @module qa-fixture-states
 */
import type { SyncDetailRow } from '@corelive/desktop-contract/category-sync'
import type {
  AccountStatus,
  SignOutResult,
} from '@corelive/desktop-contract/offline-account'

/** One editor fixture (DX1): the scene the headless editor starts in. */
export interface EditorFixtureSpec {
  name: 'local-only' | 'signed-out' | 'attached' | 'recovery'
  /** One-line description printed by `--help`. */
  description: string
  /** Text that must be visible before a screenshot counts as ready (DX3). */
  readyText: string
}

/** Every editor fixture, in `--fixture all` order. The first is the default. */
export const EDITOR_FIXTURES: readonly EditorFixtureSpec[] = [
  {
    name: 'local-only',
    description:
      'Fresh device workspace: only General, an empty draft, no account (the first-run editor)',
    readyText: 'Saved on this Mac',
  },
  {
    name: 'signed-out',
    description:
      'Bound to an account but signed out (detached), with unsent completion updates waiting; only the save line shows (DA2)',
    readyText: 'Saved on this Mac',
  },
  {
    name: 'session-expired',
    description:
      'Bound and attached, but the session expired unexpectedly; the footer asks to sign in to sync (DA2)',
    readyText: 'Sign in to sync completions',
  },
  {
    name: 'attached',
    description:
      'Bound and syncing against the in-process fake, with several categories and drafts',
    readyText: 'completion updates',
  },
  {
    name: 'recovery',
    description:
      'A corrupt primary workspace file with a recovery copy, opening the recovery scene',
    readyText: 'Your writing needs recovery',
  },
]

/** Names of {@link EDITOR_FIXTURES}. */
export const EDITOR_FIXTURE_NAMES = EDITOR_FIXTURES.map(
  (fixture) => fixture.name,
)

/** What a stubbed `signOut` does in a Settings fixture state. */
export type StubbedSignOut = SignOutResult | 'pending'

/** One Settings fixture state (DX2): data only, so the page can receive it as JSON. */
export interface SettingsStateSpec {
  name: string
  description: string
  /** Text that must be visible before a screenshot counts as ready (DX3). */
  readyText: string
  /** Overrides of the account status shown by the stub. */
  account: Partial<AccountStatus>
  /** Rows of the Sync details page. */
  rows?: SyncDetailRow[]
  /** Visible button texts (regular expression sources) the page clicks, in order, after load. */
  drive?: string[]
  /** `signIn` result of the stub; defaults to `opened`. */
  signIn?: 'opened' | 'offline'
  /** `signOut` and `clearAgain` result of the stub. */
  signOut?: StubbedSignOut
}

const BOUND_EMAIL = 'writer@example.com'
const ATTACHED: Partial<AccountStatus> = {
  state: 'attached',
  boundEmail: BOUND_EMAIL,
  signedInEmail: BOUND_EMAIL,
}
/** Clicks the Account link to Sync details, whichever label its count gives it. */
const OPEN_SYNC_DETAILS = '^(Sync details|\\d+ changes? needs? a look)$'

const ROW_BASE: Pick<SyncDetailRow, 'dashboardValue' | 'macValue' | 'actions'> =
  { dashboardValue: null, macValue: null, actions: [] }

/** Every Settings state, in `--screenshots` order. The first is the default. */
export const SETTINGS_FIXTURE_STATES: readonly SettingsStateSpec[] = [
  {
    name: 'account-never-attached',
    description: 'Account A: never attached; Sign in is the one action',
    readyText: 'Sign in to also see it on the dashboard',
    account: {},
  },
  {
    name: 'account-attached',
    description: 'Account B: attached and up to date',
    readyText: 'Up to date',
    account: { ...ATTACHED, lastSyncedAt: Date.now() - 5 * 60_000 },
  },
  {
    name: 'account-signed-out',
    description: 'Account C: bound to an email but signed out',
    readyText: 'Your writing stays on this Mac',
    account: { state: 'signed-out', boundEmail: BOUND_EMAIL, waitingCount: 2 },
  },
  {
    name: 'account-other-account',
    description: 'Account D: a different account is signed in',
    readyText: 'signed in as',
    account: {
      state: 'other-account',
      boundEmail: BOUND_EMAIL,
      signedInEmail: 'someone.else@example.com',
    },
  },
  {
    name: 'connect-confirm',
    description: 'First-connect confirmation before anything is bound or sent',
    readyText: 'Connect this Mac',
    account: { pendingConnect: { displayEmail: BOUND_EMAIL } },
  },
  {
    name: 'connect-uploading',
    description: 'First upload progress after Connect this Mac',
    readyText: 'to your dashboard',
    account: { ...ATTACHED, firstUpload: { state: 'uploading', count: 3 } },
  },
  {
    name: 'signout-confirm',
    description: 'The inline sign-out confirmation',
    readyText: 'Sign out? Your writing stays on this Mac.',
    account: ATTACHED,
    drive: ['^Sign out$'],
  },
  {
    name: 'signout-running',
    description: 'Sign out in progress (never finishes in this fixture)',
    readyText: 'Signing out…',
    account: ATTACHED,
    drive: ['^Sign out$', '^Sign out$'],
    signOut: 'pending',
  },
  {
    name: 'signout-residual',
    description: 'Signed out, but some sign-in data could not be cleared',
    readyText: "Some sign-in data couldn't be cleared",
    account: ATTACHED,
    drive: ['^Sign out$', '^Sign out$'],
    signOut: {
      status: 'signed-out-residual',
      code: 'SIGNOUT_RESIDUAL_COOKIE',
      cookieNames: ['__client_uat'],
      domains: ['corelive.app'],
    },
  },
  {
    name: 'signin-offline',
    description: 'Sign in pressed while the Mac is offline',
    readyText: 'Sign-in needs an internet connection',
    account: {},
    drive: ['^Sign in$'],
    signIn: 'offline',
  },
  {
    name: 'signin-unreachable',
    description: 'The sign-in page could not be reached',
    readyText: "Couldn't reach the sign-in page",
    account: { signIn: 'unreachable' },
  },
  {
    name: 'sync-details-empty',
    description: 'Sync details with nothing needing a look',
    readyText: 'No sync issues. Everything on this Mac is saved.',
    account: ATTACHED,
    drive: [OPEN_SYNC_DETAILS],
  },
  {
    name: 'sync-details-rows',
    description: 'Sync details with one row of every type',
    readyText: 'Waiting for the dashboard to confirm a change',
    account: { ...ATTACHED, needsALookCount: 8 },
    rows: [
      {
        ...ROW_BASE,
        id: 'a:color',
        type: 'conflict',
        categoryPath: 'Work',
        field: 'color',
        macValue: 'red',
        dashboardValue: 'blue',
        actions: ['use-mac-value', 'keep-dashboard-value'],
      },
      {
        ...ROW_BASE,
        id: 'b:name',
        type: 'name-taken',
        categoryPath: 'Work / Plans',
        field: 'name',
        macValue: 'Ideas',
        dashboardValue: 'Plans',
        actions: ['choose-another-name', 'keep-dashboard-value'],
      },
      {
        ...ROW_BASE,
        id: 'c:parentLocalId',
        type: 'invalid-parent',
        categoryPath: 'Home / Garden',
        field: 'parentLocalId',
      },
      {
        ...ROW_BASE,
        id: 'd:name',
        type: 'forbidden',
        categoryPath: 'Reading',
        field: 'name',
      },
      {
        ...ROW_BASE,
        id: 'e:color',
        type: 'digest-mismatch',
        categoryPath: 'Home',
        field: 'color',
        macValue: 'green',
        actions: ['try-again'],
      },
      {
        ...ROW_BASE,
        id: 'f:delete',
        type: 'delete-blocked',
        categoryPath: 'Old / Archive',
        field: 'delete',
        childName: 'Plans',
        actions: ['choose-another-name', 'keep-dashboard-value'],
      },
      {
        ...ROW_BASE,
        id: 'g:name',
        type: 'parked',
        categoryPath: 'Music',
        field: 'name',
        actions: ['try-again'],
      },
      {
        ...ROW_BASE,
        id: 'h:name',
        type: 'waiting-confirm',
        categoryPath: 'Travel',
        field: 'rename',
      },
    ],
    drive: [OPEN_SYNC_DETAILS],
  },
  {
    name: 'category-refusal',
    description: 'A category change the dashboard refused, kept on this Mac',
    readyText: "Couldn't apply a change. It was kept on this Mac.",
    account: { ...ATTACHED, needsALookCount: 1 },
    rows: [
      {
        ...ROW_BASE,
        id: 'e:color',
        type: 'digest-mismatch',
        categoryPath: 'Home',
        field: 'color',
        macValue: 'green',
        actions: ['try-again'],
      },
    ],
    drive: [OPEN_SYNC_DETAILS],
  },
]

/** Names of {@link SETTINGS_FIXTURE_STATES}, shared by the page and `--help` (EA16). */
export const SETTINGS_STATE_NAMES = SETTINGS_FIXTURE_STATES.map(
  (state) => state.name,
)
