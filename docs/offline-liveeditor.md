# Offline LiveEditor

The desktop LiveEditor opens from assets bundled with CoreLive and saves writing
on the Mac before reporting success. After this version has prepared a signed-in
account online once, that account can reopen the editor, write, complete lines,
and use eligible Undo while disconnected.

## Prepare a Mac

1. Open the upgraded CoreLive while connected and complete the existing sign-in
   flow if prompted. Keep the account's Settings window available while its
   categories and saved preferences are loaded.
2. Wait for preparation to finish and the editor to open with the expected
   categories, writing, theme and settings. `Preparing offline access…` is not a
   saved-readiness confirmation.
3. Once prepared, the editor uses the local account workspace at startup.
   Unavailable authentication or a disconnected network does not block writing.

Before preparation, the editor says `Connect once to prepare this Mac.` It
retries when the connection/session becomes available and also offers Retry.
Preparation preserves legacy notes; an interrupted attempt does not replace
newer writing or import the same source twice. Only categories verified as owned
by the signed-in account are imported. Unmapped legacy notes remain in the old
configuration and are not exposed to another account.

## Understand the status

| Status                                   | Meaning and action                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Saving on this Mac…`                    | Current writing has not yet received a durable save acknowledgement.                          |
| `Saved on this Mac`                      | The currently displayed revision has been saved locally.                                      |
| `Not saved on this Mac`                  | Keep the editor open. Use Retry, or Copy writing to preserve the current full text elsewhere. |
| `Offline · … completion updates pending` | Saved completion records will be sent after reconnection.                                     |
| `Sign in to sync completions`            | Writing remains available; renew the account's session to resume sending completions.         |

A local save failure takes priority over connectivity messages. Failed saving
cancels normal hide, close, category switch, quit and update installation. Retry
does not automatically repeat an earlier quit request. Force termination can
lose writing that has not been acknowledged.

**Drafts stay on this Mac.** Completion records and their cancellation, category
and time updates synchronize to the account. Cross-device draft synchronization
is separate work tracked in [CloudSync #206](https://github.com/laststance/corelive/issues/206).
Two completions with the same title remain distinct. Reconnection preserves the
original completion time rather than assigning the upload date.

Today Ember retains its saved setting and is off by default. `On this Mac` is a
device count; `Account total · last confirmed` is a stale account count. Neither
claims a freshly fetched global total while disconnected.

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
- Category creation and management use the existing online Settings flow. They
  require a connection; offline category management is not available.

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

1. Before installing an older app, finish saving and use **Export writing**.
   If saving fails, use **Copy writing** for the live text first. If the workspace
   is invalid, use **Export files** from recovery.
2. When possible, let pending completion updates finish and inspect any blocked
   records in Details. Keep the export even when synchronization has finished:
   drafts are local to this Mac.
3. Quit CoreLive normally before replacing the application. Preserve its user
   data and legacy configuration; do not reset them to resolve a format error.
4. Expect an older binary to show only the preserved legacy notes. **It cannot
   read the new offline workspace or show its new pending records.** New drafts
   are not written back into the legacy note store.
5. On a later upgrade, CoreLive reopens the new workspace. If an older binary
   changed verified legacy notes in the meantime, those differences appear as
   preserved recovery copies in Details. Restore them explicitly; the newer
   workspace is not overwritten or merged by matching titles.

The workspace lives under Electron's user-data directory in `offline/`, with
separate account partitions and an account registry. It is versioned and rejects
unsupported formats before writing. The existing single-instance boundary
prevents two current CoreLive instances from writing concurrently. Do not run an
old and new binary against the same user-data directory at the same time.

## Account access and retention

Token expiry pauses synchronization. Explicit sign-out locks the workspace and
hides its text/categories/details; reopening it requires signing in to the same
account online. Another account gets its own partition. Sign-out does not delete
the previous account's saved drafts or pending records. Workspace files and
exports contain writing, but no authentication tokens.

Server operation receipts and cancellation tombstones have no time-based expiry
while the account exists. This prevents an old offline retry from duplicating or
resurrecting a completion. Account deletion cascades to those server tables.
Local pending operations and recovery metadata remain available; resolved payloads
can compact only after durable receipt/count reconciliation and resolution of
Undo and move references. Compaction retains the identity/revision evidence
needed for safe replay. Signing out or deleting a server account is not a local
workspace-file deletion operation.

## Development and release checks

Use `pnpm validate`, the focused Electron/storage/API suites, an isolated
PostgreSQL database, unsigned package inspection and Headless Playwright CLI QA.
`pnpm --filter @corelive/desktop benchmark:offline` measures synthetic snapshot
workloads under the pinned runtime. See [Headless development](headless-development.md)
for isolation and video requirements, and the [design and acceptance contracts](designs/offline-liveeditor.md)
for the fault, restart, midnight and response-loss cases.

Apply and verify `apps/web/drizzle/0003_offline_liveeditor.sql` before deploying
the new Web/API code: category deletion also updates the new `CompletionSyncState`
table. Then deploy the Web/API, and only afterward publish the signed/notarized
desktop release through the existing tag-driven GitHub Actions workflow. A Web
deployment alone does not install the bundled editor. Contract tests, headless
renderer QA and package inspection do not establish real-account Clerk refresh,
Cocoa startup/input, OS vibrancy contrast or installed-updater behavior.
