# Offline LiveEditor

The desktop LiveEditor opens from assets bundled with CoreLive (served from
`corelive-editor://`) and saves writing on the Mac before reporting success. It
needs **no account**: a fresh install opens a writable editor with a `General`
category and nothing else. Signing in is optional and only adds the web
dashboard; it never gates writing, and signing out never locks the editor.

## The device workspace

Everything lives in one **device workspace** (`ownerId: "device"`) under
Electron's user-data directory:

| File                                      | Holds                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `offline/workspaces/device.json`          | Categories, drafts, completions, outbox, receipts, the account binding  |
| `offline/workspaces/device.recovery.json` | The previous validated generation, kept for explicit recovery           |
| `offline/registry/device-registry.json`   | Which account is attached, the sign-out journal and the pending Connect |

The workspace has no machine-bound key. `deviceId` is an identifier, not a
secret, and workspace files and exports hold writing but no tokens.
A development or QA build (`!app.isPackaged`) uses a separate
`CoreLive Dev` user-data directory and never touches the installed workspace.

### Size envelope

One snapshot file holds everything, so the file grows with the number of kept
completions (about 4.6 MB per year at 20 a day; title text is retained even
after the dashboard has the completion).

| Completions      | File size | Notes                                  |
| ---------------- | --------- | -------------------------------------- |
| 3,650 (1 year)   | ~2.3 MB   | design measurement, 2026-11-03         |
| 10,000           | ~6.4 MB   |                                        |
| 36,500 (5 years) | ~23 MB    | the size the merge gate is measured at |

The 2026-11-03 run of `pnpm benchmark:offline` on an Apple M4 Max (Node
26.12.1, worker round trip, 36,500-completion fixture with outbox, receipts, one
recovery generation and 10% maximum-length lines) measured keep p95 227 ms at 3,650
completions and 1,091 ms at 36,500, with a cold parse of about 200 ms and a peak
RSS near 2.9 GB. That is slower than the 100 ms design target at five years of
data; the gate below reports it, and the single-snapshot decision needs review
before a release depends on it.

Measure it on your own Mac with `pnpm benchmark:offline` (see
[Recipes](#recipes)). The gate is a keep-commit p95 of at most 100 ms at
36,500 completions; the command exits 1 with `BENCH_GATE_FAILED` when a given
`--max-p95-ms` is exceeded.

## Signing in and connecting (optional)

1. In **Settings ▸ Account** choose **Sign in**. The sign-in window opens (it
   needs a connection; offline the page says so and nothing opens).
2. On a Mac that was never attached, the first sign-in asks **Connect this Mac**
   (or **Not now**). Nothing is bound or sent until you connect.
3. After Connect, the keeps and categories on this Mac upload to the dashboard.
   Settings shows the progress and then a one-time "keeps are on your
   dashboard" line.
4. **Sign out** ends the session on this Mac and works offline. Unsent changes
   stay in the outbox for the bound account and resume when that account signs in
   again. Signing in as a different account never sends anything: Account says
   `This Mac syncs with <email>` and editing continues.

The only data the sign-in flow reads from the web is the verified identity
(account id and email) returned by an authenticated server call; the account
named in a renderer payload is ignored.

## Backup and moving to a new Mac

A copy of `userData/offline/` made by Time Machine or Migration Assistant opens
on another Mac with every draft and completion, because the workspace has no
machine-bound key (a test copies a workspace and registry into a fresh user-data
directory and asserts exactly that). A cloned `deviceId` is benign: operation
ids are UUIDs and the server replays receipts idempotently, so two Macs that
share a copy cannot duplicate a completion.

## Understand the status

A Mac with no account (or one that signed out) shows only the save line. In **Settings → LiveEditor**, turn off **Show save and sync status** to hide the
two routine lines below your writing. The choice persists on this Mac. Existing
installations keep the status visible until you change it. When shown, the footer
keeps a fixed height through saving and completion synchronization.

**Details** stays in the header in either mode. A local save failure changes it
to **Not saved**; open it for **Retry**, **Copy writing**, or **Copy unsaved
categories**. Completion Undo has a reserved header slot and is also available
in Details. Hiding the routine footer never disables persistence, error alerts,
recovery, or the original Undo deadline. If clipboard access fails, close Details
first, then select and copy your writing manually.

Settings displays progress until the native workspace acknowledges a change.
Unconfirmed writes retain their command identity for safe Retry. Automatic
recovery is bounded to three attempts and 30 seconds spent on Settings; leaving
the page pauses that budget. **Restore saved settings** is offered only when no
write is unresolved, and re-reads the native value before restoring it. A newer
edit takes precedence over an in-progress restoration. Older desktop versions
hide unsupported controls while retaining recovery for their existing settings.

| Status                                   | Meaning and action                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Saving on this Mac…`                    | Current writing has not yet received a durable save acknowledgement.                          |
| `Saved on this Mac`                      | The currently displayed revision has been saved locally.                                      |
| `Not saved on this Mac`                  | Keep the editor open. Use Retry, or Copy writing to preserve the current full text elsewhere. |
| `Offline · … completion updates pending` | Saved completion records will be sent after reconnection.                                     |
| `Sign in to sync completions`            | Writing remains available; sign in again to resume sending completions.                       |

A local save failure takes priority over connectivity messages. Failed saving
cancels normal hide, close, category switch, account switch, quit and update
installation. Retry does not automatically repeat an earlier quit request.
Force termination can lose writing that has not been acknowledged.

**Drafts stay on this Mac.** Completion records and their cancellation, category
and time updates synchronize to the account. Cross-device draft synchronization
is separate work tracked in [CloudSync #206](https://github.com/laststance/corelive/issues/206).
Two completions with the same title remain distinct. Reconnection preserves the
original completion time rather than assigning the upload date.

Today Ember retains its saved setting and is off by default. `On this Mac` is a
device count; `Account total · last confirmed` is a stale account count. Neither
claims a freshly fetched global total while disconnected.

## Preference recovery diagnostics

Settings shows an actionable message when automatic recovery stops. Diagnostics
use stable reason codes and the `Native preference synchronization stopped` log
anchor. They include bridge version/capability, changed key names, attempt,
certainty and expected/observed revisions; an unresolved write also carries its
command ID for correlation. Preference values, writing and account identity are
excluded. Unknown exceptions are normalized rather than logging raw IPC payloads.

| Reason                                            | Meaning                                                                | Recovery                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `unavailable`                                     | Native Settings context is unavailable.                                | Reopen Settings and use Retry.                                                            |
| `preparing`                                       | Initial preparation was accepted but durable readiness is unconfirmed. | Retry checks committed readiness.                                                         |
| `revision-conflict`                               | Saved preferences changed before this patch.                           | Retry re-reads and applies retained intent.                                               |
| `account-changed`                                 | The workspace generation no longer matches.                            | Retry reconciles the active workspace.                                                    |
| `invalid-command`                                 | This desktop could not accept the setting command.                     | Check the desktop version, then Retry or restore the confirmed settings.                  |
| `worker-unavailable`, `storage-failed`, `unknown` | The write may have committed; its result is uncertain.                 | Retry reuses the original command identity; restoration stays unavailable until resolved. |

## Resolve pending records

Open **Details** in the editor. Records needing attention appear before ordinary
waiting records; closing Details returns to the same editing session.

- A removed category keeps an accessible draft. **Move writing** previews an
  owned destination and merges into it without replacing its current text. The
  local move and the completion's server update finish separately. Undo follows
  confirmed category moves and preserves writing added afterward.
- **Correct completion time** shows the original time and timezone. Confirm a
  correction explicitly; changing the Mac clock alone does not rewrite history.
- For a conflicting remote edit, inspect both versions before choosing **Keep
  server** or **Apply my version**. Alternate writing remains recoverable. A
  terminally cancelled record offers **Restore writing**; completing it again is
  a new deliberate action with a new identity.
- Category creation, rename, recolor, move and delete work offline in the
  editor picker and in Settings. A change made on the dashboard side that
  collides with one made here becomes a row on the Sync details page
  (Settings ▸ Account ▸ Sync details); the editor itself never shows conflict
  copy.

Undo retains its original eligibility deadline across restart. It restores the
captured occurrence, not an old whole-document snapshot. If its original row was
edited or removed, it uses surviving row identities or appends the captured text
when the original context is gone.

Writing enlarged by migration, recovery or category merging keeps its retained
editing capacity through later shortening, category moves and restarts.

## Export and recover writing

For a readable workspace, open **Details → Export writing** and choose a JSON
destination. CoreLive first flushes live writing; save failure asks you to copy
the live text before exporting saved files. The default name is
`corelive-writing.json`. A successful export contains the current account's
saved workspace, including drafts, pending operations and recovery information.
It is not an import file for the old desktop app or the browser.

If the workspace cannot be read safely, the recovery screen offers **Export
files**. This saves an archive of available files from that account's partition,
including exact damaged bytes encoded as Base64. Files declaring another owner
are excluded. Keep this archive before attempting recovery; it is evidence for
manual recovery, not a guarantee that damaged data can be restored automatically.

When a validated same-account recovery generation exists, **Preview recovery
copy** shows its saved time and writing. **Use this copy** explicitly restores
that generation; more recent writing may be absent. Cancel leaves the workspace
unchanged. The damaged primary is preserved, and restored queued deliveries are
reconciled before replay because a later server commit may already have happened.
CoreLive never silently resets corruption to an empty editor.

## Downgrade and upgrade again

v2 writes new files (`device.json`, `device-registry.json`) and never rewrites or
deletes a v1 file, so the previous DMG (still on GitHub Releases) reopens the
state as it was before the upgrade. Writing done after the upgrade is **not**
visible to the older build.

1. Before installing an older app, use **Export writing** (or **Copy writing** if
   saving fails; **Export files** from recovery for an invalid workspace).
2. Quit CoreLive normally, then replace the application. Keep the user-data
   directory; never reset it to resolve a format error.
3. The older build shows the v1 state from before the upgrade. Do not run old and
   new builds against the same user-data directory at the same time.
4. Edits made in the older build change only the v1 files. On the next v2
   launch each v1 file's checksum is compared with the migration receipt. A
   changed file's non-empty drafts, and any unsent or uncertain completion whose
   id v2 does not already hold (with its text still present), are imported as
   recovery copies labelled **From an older CoreLive version**. The v2 workspace
   is never overwritten, nothing from the file is sent, and each change imports
   once. Entries the older build already retired without text are listed in
   History as **Kept on the dashboard only**.

## Migration from the earlier per-account workspaces

The first v2 launch converts the workspace of the last active account into the
device workspace once, before the editor opens: categories get local ids, the
account becomes the binding, operations keep their ids and receipts, and the old
files stay as backups. Other prepared accounts' drafts and pending titles become
recovery copies in the device workspace and nothing is sent to them. A summary
(source, imported drafts and completions, recovery copies, v1 files kept) is
logged and shown on the Sync details page. A corrupt source opens `recovery`
([WORKSPACE_MIGRATION_FAILED](#workspace-migration-failed)); the migration is
idempotent and retried once per launch.

## Account access and retention

Token expiry pauses synchronization; writing continues. **Sign out** (Settings or
the app menu) runs four steps: flush the pending autosave to disk, detach
the account (the binding, outbox and last-synced time stay untouched), ask Clerk
to revoke the session when online (5 s limit, skipped offline), and always end
the local session by removing the Clerk and app-domain cookies and storage. After
the last step this Mac holds no credential; a leftover cookie is reported rather
than hidden ([SIGNOUT_RESIDUAL_COOKIE](#signout-residual-cookie)).

Server operation receipts and cancellation tombstones have no time-based expiry
while the account exists. This prevents an old offline retry from duplicating or
resurrecting a completion. Account deletion cascades to those server tables.
Local pending operations and recovery metadata remain available; resolved payloads
can compact only after durable receipt/count reconciliation and resolution of
Undo and move references. Signing out or deleting a server account is not a local
workspace-file deletion operation.

## Errors and sync outcomes

Each stable code is a string in `packages/desktop-contract`. Logs carry account
ids, operation ids, codes and counts only; they never carry writing, category
names, emails, cookie values or tokens.

| Code or result                                                            | What happened and side effects                                                                                                                 | What the app does                                                                                                                                                                                                                                | What to do                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| <a id="signout-flush-failed"></a>`SIGNOUT_FLUSH_FAILED`                   | The disk commit before sign-out failed. No side effects: the account stays signed in and the outbox is unchanged.                              | Shows `Not saved — retry or copy your writing`. No automatic retry. The log carries the storage error class (for example `ENOSPC`).                                                                                                              | Free disk space, then press Sign out again.                                    |
| <a id="signout-residual-cookie"></a>`SIGNOUT_RESIDUAL_COOKIE`             | Signed out, but the read-back still found a sign-in cookie. Names and domains are reported, never values.                                      | Sync stays detached and editing is unaffected. Account shows `Signed out. Some sign-in data couldn't be cleared from this Mac.` with **Clear again**.                                                                                            | Press **Clear again**; it reruns only the local session end and its read-back. |
| <a id="signout-remote-revoke-skipped"></a>`SIGNOUT_REMOTE_REVOKE_SKIPPED` | Informational: offline, or the 5 s revoke timed out. The server session expires on its own.                                                    | Sign-out completes normally.                                                                                                                                                                                                                     | Nothing.                                                                       |
| <a id="workspace-migration-failed"></a>`WORKSPACE_MIGRATION_FAILED`       | A v1 source file is unreadable or corrupt. The v1 files are unchanged.                                                                         | Opens `recovery`: `Your earlier writing is still in its original files on this Mac.` with Copy, Export and **Try again**. Retries once automatically per launch. The log carries the v1 file name, an 8-hex checksum prefix and the error class. | Export files first, then **Try again**.                                        |
| <a id="category-sync-rejected"></a>`CATEGORY_SYNC_REJECTED`               | The server answered a non-401 4xx (for example `BAD_REQUEST`) to `category.syncApply` or `completed.sync*`. The operations stay in the outbox. | Not retried automatically. Sync details shows `Couldn't apply a change. It was kept on this Mac.` with **Try again**, which re-sends once.                                                                                                       | Press **Try again** on Sync details.                                           |
| <a id="signin-page-unreachable"></a>`SIGNIN_PAGE_UNREACHABLE`             | The login window failed to load (`did-fail-load`) or did not finish in 20 s. `net.isOnline()` reports an interface, not reachability.          | Closes the window. Account shows `Couldn't reach the sign-in page. Your writing is saved on this Mac.` with **Try again**.                                                                                                                       | Check the connection, then **Try again**.                                      |
| <a id="auth-identity-mismatch"></a>`AUTH_IDENTITY_MISMATCH`               | The account id in a renderer payload differs from the verified one.                                                                            | The payload is ignored and logged; the verified identity wins.                                                                                                                                                                                   | Nothing.                                                                       |
| <a id="outcome-applied"></a>`applied` / `adopted`                         | The dashboard accepted the operation (`adopted` matched an existing category by name path).                                                    | The operation retires and the binding's base updates.                                                                                                                                                                                            | Nothing.                                                                       |
| <a id="outcome-name-taken"></a>`name-taken`                               | The dashboard already has a category with that name.                                                                                           | The local name stays; the field is marked declined. Sync details: **Choose another name** or `Keep "<dashboard name>"`.                                                                                                                          | Pick one on Sync details.                                                      |
| <a id="outcome-conflict"></a>`conflict`                                   | Both sides changed the same field.                                                                                                             | The dashboard value is applied. Sync details: `Use "<Mac value>"` or `Keep "<dashboard value>"`.                                                                                                                                                 | Pick one on Sync details.                                                      |
| <a id="outcome-invalid-parent"></a>`invalid-parent`                       | The chosen parent no longer fits on the dashboard.                                                                                             | Local reverts to the dashboard parent. Informational: `Changed back to match the dashboard.`                                                                                                                                                     | Nothing.                                                                       |
| <a id="outcome-forbidden"></a>`forbidden`                                 | The dashboard refused the edit (for example the default category).                                                                             | Local reverts to the dashboard value. Informational row.                                                                                                                                                                                         | Nothing.                                                                       |
| <a id="outcome-digest-mismatch"></a>`digest-mismatch`                     | A stored receipt did not match the resent payload.                                                                                             | The change is kept on this Mac and marked declined. Sync details: `Couldn't apply a change. It was kept on this Mac.` with **Try again** (re-derives under a new operation id).                                                                  | **Try again**.                                                                 |
| <a id="outcome-delete-blocked"></a>`delete-blocked` (EA8)                 | A delete was refused because a child's name collides at the top level (`child-name-taken`).                                                    | The local delete stays applied and the writing stays in its destination. Sync details: `Couldn't remove "<name>" on the dashboard.` with **Rename "<child>"** or **Keep it on the dashboard**.                                                   | Choose on Sync details.                                                        |
| <a id="outcome-transport"></a>Network, timeout, 5xx, 401                  | Transport failure. Every retry is safe: receipts replay by `(userId, operationId)`.                                                            | Operations stay queued with bounded backoff. The editor shows `Offline · … pending` or `Sign in to sync completions`.                                                                                                                            | Reconnect or sign in again.                                                    |

## Recipes

### Restore from Time Machine or Migration Assistant

1. Quit CoreLive on the target Mac.
2. Restore `~/Library/Application Support/CoreLive/offline/` (the directory that
   holds `workspaces/` and `registry/`) from the backup.
3. Launch CoreLive. Every draft and completion opens; no sign-in is needed. If you
   were attached, sign in again and the same account resumes.

### Downgrade round trip

Follow [Downgrade and upgrade again](#downgrade-and-upgrade-again). To check it
by hand: upgrade, quit, install the previous DMG, write a line, quit, install the
current build again, and open Details to find the line as a recovery copy
**From an older CoreLive version**.

### Measure the workspace

```bash
pnpm benchmark:offline --json --max-p95-ms 100
```

`--completions 3650,36500` changes the fixture sizes; the gate uses the largest.
It works in a temp directory and never reads or writes `userData`. Sample output
shape (values vary by Mac):

```json
{
  "machine": {
    "cpu": "Apple M4 Max",
    "cores": 16,
    "memoryGb": 64,
    "os": "darwin 27.2.0",
    "node": "v26.12.1"
  },
  "runs": [
    {
      "completions": 36500,
      "operation": "keep",
      "p50Ms": 872.64,
      "p95Ms": 1091.34,
      "samples": 20
    }
  ],
  "peakRssMb": 2949,
  "gate": { "maxP95Ms": 100, "passed": false }
}
```

Without `--max-p95-ms` the command always exits 0 (report only). With it, a miss
exits 1 and prints the `BENCH_GATE_FAILED` line.

## Development and release checks

Use `pnpm validate`, the focused Electron/storage/API suites, an isolated
PostgreSQL database, unsigned package inspection and Headless Playwright CLI QA.
`pnpm benchmark:offline` measures a synthetic 36,500-completion workspace under the
pinned runtime, and `pnpm qa:offline-editor` / `pnpm qa:settings` render every
editor and Settings state headlessly. See [Headless development](headless-development.md)
for isolation and video requirements, and the [design and acceptance contracts](designs/offline-liveeditor.md)
for the fault, restart, midnight and response-loss cases.

Apply and verify `apps/web/drizzle/0003_offline_liveeditor.sql` before deploying
the new Web/API code: category deletion also updates the new `CompletionSyncState`
table. Then deploy the Web/API, and only afterward publish the signed/notarized
desktop release through the existing tag-driven GitHub Actions workflow. A Web
deployment alone does not install the bundled editor. Contract tests, headless
renderer QA and package inspection do not establish real-account Clerk refresh,
Cocoa startup/input, OS vibrancy contrast or installed-updater behavior.
