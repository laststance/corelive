# Maintenance closure and non-interfering QA — 2026-10-02

The twelve entries in `TODOS.md` were evaluated individually. Ten are resolved;
two low-value or conditional items are intentionally dropped. No login E2E suite
was added. Routine renderer QA uses the isolated headless CLI; native operations
use a dedicated macOS VM.

## Dispositions

| Previous item                                                      | Disposition and evidence                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tray, Window menu and Alt+Space after removing the settings toggle | Actual guest macOS AX/menu/key input passed all six show/hide operations. Settings opacity, shortcut capture and Open config were verified; the removed toggle remains absent.                                                      |
| Signed-out Playwright E2E after a named second user                | Dropped: its explicit second-user trigger remains unmet. The public write/keep/Undo/reload flow passed headless QA; no per-PR browser or login suite is introduced.                                                                 |
| Update check remains pending forever                               | IPC awaits the native check, terminal state is observable, and the Settings action becomes available again. Native status and renderer regressions pass.                                                                            |
| Dead `Todo.importBatchId` column/index                             | Dropped as low-value schema housekeeping. There is no production Todo writer. The live `ImportBatch` and `Completed.importBatchId` import-idempotency paths remain intact. No schema migration is justified by this item.           |
| Settings updater status stops changing                             | A non-overlapping poll updates progress and restart state without remounting. Errors remain retryable; new native activity replaces an older action error. Real component transitions were recorded headlessly with an IPC fixture. |
| Year-in-review longest streak                                      | Removed the visible statistic, aggregation field and unused client calculation. The two retained yearly statistics were visually verified. Live server streak logic used elsewhere remains.                                         |
| Orphan native-tap re-enable methods                                | Removed the unused public methods/type and their direct-only tests. Engine latch, power and freeze-safety behavior remains covered. Recovery copy points to a regular shortcut.                                                     |
| Signed-in login window has no retry                                | Added Open LiveEditor through the existing reveal path and exposed only that method on the restricted login preload. Failed-load recovery was exercised; the handoff latch is retained.                                             |
| Duplicate renderer Electron declarations drift                     | Renderer declarations reuse the canonical preload types; async config and updater return types match the implementation.                                                                                                            |
| Shortcut retry re-arms a cleared accelerator                       | Retry checks current enablement and accelerator identity, discards stale bindings, and reports failure if any attempted registration fails. Focused native shortcut regressions pass.                                               |
| One-time Drizzle baseline write mode                               | Removed `--apply` before DB connection, retained read-only deployment guards and the frozen schema fingerprint, and separated historical first-migration tests from the current journal. Production's existing ledger has two rows. |
| Serverless PostgreSQL pool                                         | Bounded the pool to five connections, a five-second idle timeout and a 300-second lifetime; attached it to Vercel request lifecycle handling. A read-only production check confirmed a pooled endpoint.                             |

## Additional defects fixed during this work

- Update downloads now wait for native consent. Declining does not start a binary transfer; the acceptance path is also covered.
- A prepared update survives failed checks and remains available to install. Settings and the native menu share the guarded check. Checks are skipped while downloading, ready to restart, or awaiting consent; repeated notifications do not stack consent dialogs.
- Failed manual actions stay visible across identical polls, while new native progress replaces stale error text.
- The browser return action uses a prepared, short-lived ticket synchronously on the user click. Its relative lifetime is measured from request start using monotonic and local wall-clock deadlines, accounting for clock skew, network time and sleep. Transient issuance failures retain Try again, followed by an explicit return click. Fixture tests and headless QA cover this recovery without contacting Clerk or opening the custom protocol.
- The headless wrapper rejects option-prefixed prohibited commands, negated help/version tricks and session aliases, and strips inherited inspector, remote-browser and session overrides. Its nineteen process-boundary tests never launch a browser.
- Download status announces a stable phase while the progress bar exposes percentages; the callback uses the existing border and self-affirming copy conventions.

## Verification

- `pnpm validate`: 1,037 web tests and 30 package tests passed after the final repairs; lint, types, production build, theme, dead-code, duplicate and complexity checks passed. The normal run skips 177 database integration tests.
- Electron: 51 files, 428 tests passed.
- Focused real database guards: 22 tests passed against isolated local scratch databases. The earlier full database-enabled run passed 1,181 tests; it is separate evidence from the latest normal validation.
- Headless public editor: write/keep clears the line, Undo restores it and removes the saved record, keep/reload retains one local record; no authenticated session cookie.
- Headless Updates component: terminal check, error-to-progress transition, completed-download restart action without remount, and retained restart failure all passed. Video: 7.2 seconds, 180 frames, inspected.
- Final callback and Updates fixture: retry after failed ticket issuance, explicit return click, stable download status and restart readiness passed in the actual components. Final video: 8.92 seconds, extracted frames inspected; keyboard focus recovery and postponed-download copy also passed. Ticket issuance was synthetic and custom-protocol navigation was intercepted; no provider login or host protocol launch occurred.
- Native guest: the final compiled native build (0.24.1, QA process 1196) passed all six Window/Alt+Space/tray show/hide operations, recorded for 20 seconds. It also passed three updater checks: Later postponed with zero downloads, the menu preserved 42% active progress without another check, and the ready-state menu reopened Restart while preserving the package. The updater recording is 19.985 seconds; extracted frames from both recordings were inspected. Renderer and transport fixtures isolate native behavior from real sign-in and installation.
- Production database: a read-only transaction confirmed the pooled endpoint and two migration-ledger rows. The observed connection count was one, including the check itself; this is not a load benchmark.

## Boundaries and setup recovery

The owner requested that QA stop taking over the host Mac. Subsequent native
input is confined to the VM. The earlier native evidence predates that request;
no additional host login or input is needed to reproduce the new workflow.

The first guest app transfer failed because direct copying across virtiofs did
not preserve framework symlinks (launch PID 1221, DYLD missing framework).
Transferring a tar archive fixed the setup; the initial successful six-operation run used
the replacement process, PID 1374. That initial recording includes the earlier setup's
crash-report window behind the running app; it is not a crash during the checks.

The VM checks do not establish physical display/Spaces, sleep/wake, signing,
notarization, real package installation, or Production Clerk acceptance. Those
surfaces are unchanged or require their own release-specific verification.
No release or production deployment is performed by this maintenance PR. Main-process
and preload fixes reach installed apps only with a later Electron release.

See [the development guide](../headless-development.md) for the persistent VM,
headless CLI, operation rules, and coverage boundaries.

## Final review follow-ups and harness recovery

The canonical configuration signatures now match actual defaults and void reset
results. Auth/OAuth types derive from their shared factories, and a `satisfies`
check keeps the implemented preload compatible with its declaration. Expired
browser sessions get a restart-sign-in explanation; transient issuance errors
keep a focused retry action. The signed-in recovery screen explains what to do
if the requested panel does not appear. Contextual shortcut retries also retain
the app-focus boundary and discard resolved failures.

The VM initially could not start because two unrelated guests occupied its slots.
A later free slot allowed all final native checks. Guest command fixtures were
written inside the guest after host-overwritten virtiofs content was observed
stale. Tray AX selection did not reliably end native menu tracking; guest-local
keyboard selection of the observed item completed both toggle checks. These were
harness corrections, not changes to the application's tray behavior.
