<!-- /autoplan restore point: "/Users/ryotamurakami/laststance/corelive/.gstack/tmp/autoplan/fix-215-delete-web-live-editor-autoplan-restore-20261103-033050.md" -->

# Delete the web LiveEditor (#215)

## URGENT, outside this plan

None.

## Implementation plan

Branch: fix/215-delete-web-live-editor · Base: main (ca76c4bf, after #220 / v0.28.1)

## Problem

The web LiveEditor (`/write` public host, `/live-editor` protected route) no longer has a
job. Since v0.25.0 (#207, 2026-10-22) the desktop panel loads the bundled offline editor
(`corelive-editor://app/index.html`, `apps/desktop/electron/WindowManager.ts:1109`, preload
`preload-offline-editor.cjs` at `:716`) instead of `https://corelive.app/live-editor`, and
the owner decided the desktop app is the only writing surface. The web copy is ~10,700
lines (`apps/web/src/app/write/`, `apps/web/src/app/live-editor/`,
`apps/web/src/components/live-editor/*`, `apps/web/src/lib/live-editor/*`) plus a ring of
code that exists only to serve it. Issue #215 acceptance: routes gone (redirect or 404),
dead code removed, `pnpm validate` passes, desktop / Settings / Home unaffected.

## Facts this plan relies on

- The Settings window preload exposes only `electronAPI` / `electronEnv`
  (`apps/desktop/electron/preload.ts:629,661`), so in Settings `getLiveEditorHost()` falls
  back to browser localStorage and `isElectronLiveEditorPanel()` is false; every web draft
  store is empty there.
- The desktop rescues its own drafts through `syncBootstrap` → `categoryDeletionTable`
  (`apps/web/src/server/procedures/completionSync.ts:384-392`) →
  `WorkspaceService.refreshCategories` (`apps/desktop/electron/offline/WorkspaceService.ts:258-289`):
  a deleted category's draft stays on that desktop, marked removed, with a suggested
  destination; the move is a separate user command. It never calls `category.changes` and
  never reads web localStorage (different origin).
- Production clients of the oRPC procedures (grep over `apps/web/src`, `apps/desktop`,
  `packages`, tests excluded):
  - `completed.importLocal`: only `LocalKeepMergeSync.tsx:52`.
  - `completed.create` / `completed.delete`: only `useCompletionWriter.ts:64,67`.
  - `category.changes`: only `CategoryChangeSync.tsx:47`.
  - The desktop uses only `completionSync.syncBootstrap` / `syncApply`
    (`apps/desktop/electron/offline/createSyncTransport.ts:95,99`).
- The sync legacy-row guard (`completionSync.ts:249-260`) keys on
  `Completed.localCompletionId`, not `importBatchId`; the `ImportBatch` table and the
  `importBatchId` columns (`apps/web/src/db/schema.ts:159,164,193,198,265-280`) are written
  only by `importLocal` and the dev seed (`src/db/seed/seed.dev.ts:485,537`).
- `db-migrate.yml` applies committed Drizzle migrations on push to `main`
  (last push run 2026-10-22 succeeded without a manual gate). Drizzle selects only
  schema-declared columns, so the code may deploy before or after the column drop.
- `apps/desktop/electron/preload-live-editor.ts` is still a build entry
  (`apps/desktop/electron.vite.config.ts:114-116`) but no window loads it; its
  `live-editor-note-get/set` channels already throw `'Use the prepared workspace'`
  (`apps/desktop/electron/main.ts:905-910`), and `preload-offline-editor.ts:61-68` keeps a
  throwing `note` stub only to satisfy the shared `LiveEditorAPI` type.
- `useNativeWindowPreferencesVersion` (`apps/web/src/hooks/useNativeWindowPreferencesVersion.ts`)
  ignores same-document saves (`marker === publishedMarker`) and only re-reads when a
  **different** same-origin document writes the key. Its only such peer was the web
  `/live-editor` panel; the Settings window is the only document that mounts its consumers
  (`LiveEditorSettings.tsx`, `usePanelSetting.ts` → `PanelToggle.tsx`).
- Fallow counts every package export target and every test file as an entry point, so
  modules kept alive only by their own test, or exports used only by deleted code, are not
  flagged; this plan removes them by hand.
- The desktop opens browser `/live-editor` from three places: Cmd+N
  (`ShortcutManager.handleNewTaskShortcut`, `:840`), File ▸ New Task
  (`MenuManager.createNewTask`, `:324`) and `corelive://create`
  (`DeepLinkManager.handleCreateAction`, `:399`). `WindowManager.showLiveEditor()` shows the
  desktop panel.

## Steps

1. Routes.
   - Delete `apps/web/src/app/write/` and `apps/web/src/app/live-editor/` (pages + tests).
   - `apps/web/next.config.js` `redirects()`: `/braindump` (replacing its old `/live-editor`
     destination), `/live-editor` and `/write` → `/home` (DS5), all `permanent: false`
     (a cached 308 would outlive a future route); JSDoc example index `[3]` (S4, S22).
   - `apps/web/src/proxy.ts`: drop `'/live-editor(.*)'`; update `proxy.test.ts`.
   - `AppSidebar.tsx`: remove the LiveEditor item (`:194-202`) and its `PenLine` import;
     update `AppSidebar.test.tsx`.
   - `CompletedTodos.tsx:222` empty state: the exact S2 copy (DESIGN.md voice; no guilt copy).
2. Delete the web editor.
   - `apps/web/src/components/live-editor/*` and `apps/web/src/lib/live-editor/*` with their
     tests.
   - Hooks/libs whose only consumers were the editor: `useCompletionWriter`, `useTodayKeeps`,
     `src/lib/query/todayHeatmapQuery.ts`, `src/lib/utils/getViewerTimeZone.ts`,
     `src/lib/todo-sync-channel.ts` (+ the `Dashboard.tsx:55-66` subscription and imports),
     and their tests, plus the `meta.persist` machinery (EN7). Re-check each with grep before
     deleting, then run the EN6 reverse-reference audit.
   - `ApplicationProviders.tsx`: unmount `LocalKeepMergeSync` and `CategoryChangeSync`;
     update `ApplicationProviders.test.tsx`.
3. Category flows.
   - `CategoryManageDialog.tsx`: remove `rescueCategoryDraft`, the `rescuing` state and the
     "Moving writing…" / "Could not move your writing on this device" / "Your original draft
     is retained" copy. Replace the description sentence about browser drafts with the real
     desktop behavior (drafts stay on each desktop and offer a move to the destination);
     match the NativeEditor copy for that offer. Update `CategoryManageDialog.test.tsx`
     (drop the draft-rescue describe), delete `CategoryManageDialog.storage.test.tsx`.
   - Delete `src/components/CategoryChangeSync.tsx` + test; its 15 s / focus refresh of Home moves
     to a `useDashboardFreshness` hook mounted by `Dashboard` (DS2).
   - `useCategorySync.ts`: reduce to `invalidateCategoryViews` (drop `refreshCategoryDraft`).
   - `category-sync-channel.ts`: drop `draftCategoryId`, `draftRescue`,
     `CategoryDraftRescue`; keep the native `refreshCategories` nudge used by
     `useCategoryMutations`.
4. Server procedures and schema.
   - Delete `completed.importLocal`, `completed.create`, `completed.delete` and
     `category.changes` (procedures, router entries, schemas, `IMPORT_TRANSACTION_TIMEOUT_MS`,
     `HeatmapResponse` export if unused, their tests and `rpcTransport.test.ts` cases).
     Keep `categoryDeletionTable` (desktop `syncBootstrap` reads it) and every
     `completionSync` path.
   - Rewrite `completionSync.test.ts` "a sync identity cannot adopt or cancel a legacy imported
     completion" to insert the legacy `Completed` row directly (same assertion).
   - Drop the `ImportBatch` table, `Completed.importBatchId` and `Todo.importBatchId` (+ their
     indexes / FKs) in `schema.ts`, `relations.ts` and the dev seed; generate migration
     `0004_*` with `pnpm db:generate` (DX3: confirm the new SQL, snapshot and journal exist; cat the SQL
     first); keep `Completed.localCompletionId` and its unique key. Update schema parity /
     journal tests.
5. Settings cross-window signal.
   - Delete `useNativeWindowPreferencesVersion` (inert without the web panel) and its
     storage helpers; simplify `LiveEditorSettings.tsx` and `usePanelSetting.ts` to read on
     mount, on window focus (EN5) and after their own confirmed saves; update their tests (remove the
     cross-window cases, keep the per-control load/save/skew cases).
6. Desktop.
   - Cmd+N and File ▸ New Task call `windowManager.showLiveEditor()` (the desktop panel)
     instead of opening the browser; `corelive://create` only stops opening the browser, because
     `handleDeepLink` already surfaces the panel once through `ensureWindowVisible()` (EN2); keep the `New Task` / `Opening LiveEditor` notification; update JSDoc and the
     tests (`ShortcutManager.open-sound.test.ts`, menu tests, `deep-link-manager.test.mjs`)
     per S1, S13 and S19.
   - Delete `preload-live-editor.ts` and its build entry; delete the
     `live-editor-note-get/set` IPC handlers, schemas and contract entries; remove `note` from
     `LiveEditorAPI` and the offline preload stub; drop the `brainDumpAPI` alias and the
     now-unused `getLiveEditorAPI` / `isLiveEditorEnvironment` client helpers; remove the
     `preload-live-editor` entry in `apps/desktop/electron.vite.config.ts:114-116`, the
     `live-editor-note-set` case in `apps/desktop/electron/__tests__/ipc-contract.test.ts`
     (other cases stay), and every other hit of the S17 guard. Keep the legacy
     config notes migration (`redactLiveEditorNotes`, `LiveEditorNoteStore`).
7. Packages.
   - `packages/live-editor/package.json`: remove the `.` and `./row-identity` exports (no
     external consumers after step 2); delete `src/index.ts` if nothing imports it.
   - Port `liveEditorUtils.test.ts` (web re-export of `@corelive/live-editor/utils`) into
     `packages/live-editor/src/liveEditorUtils.test.ts` (pure functions, node env). For
     `TodayEmber.test.tsx`, `LiveEditorCategoryPicker.test.tsx` and
     `useLiveEditorWindowSettings.sync.test.tsx`: port each assertion that tests package code
     and is not already covered by `apps/desktop/renderer` tests into the desktop renderer
     suite per the S10 table.
8. Scripts and docs.
   - `scripts/qa-browser.mjs` default URL `/write` → `/` (public landing); update its test.
   - README, DESIGN.md, `docs/headless-development.md`, `docs/ROADMAP.md`: remove web
     LiveEditor claims; mark `docs/design/roadmap-2026-09-no-login-live-editor.md` superseded
     by #215 at the top (historical docs otherwise unchanged).

## Tests / verification

- Unit/integration: updated tests above; new package test for utils; redirect test for the
  three retired paths (`apps/web/src/nextConfigRedirects.test.ts`, S4/S23); desktop tests
  asserting Cmd+N / menu / deep link reach `showLiveEditor` and never call
  `openWebAppInBrowser` (S19).
- `pnpm validate` (includes Fallow dead-code / dupes / health, theme check, electron TS
  build) and `pnpm test:electron`.
- Removal guard `scripts/web-live-editor-removal.test.ts` green (S8, S17, S20).
- QA, headless (owner constraint: no host input/focus): production build on :4991 with
  `pnpm qa:browser` — `/write`, `/live-editor` and `/braindump` redirect to `/home` (signed out
  → `/login?redirect_url=…/home`) (DS5); landing and login render; no console errors.
  `pnpm qa:settings` — Settings renders LiveEditor settings and category management;
  delete dialog shows the new copy. `pnpm qa:offline-editor` — the desktop panel renderer
  is unaffected.
- QA, native: File ▸ New Task / Cmd+N / deep link need menu tracking, key input or the
  `corelive://` handler, which would take focus or steal the installed app's protocol
  default; they are covered by unit tests and stated as such in the PR body.

## Not in scope

- The desktop offline editor itself (#216).
- Exporting stranded browser drafts (`corelive.local-note.v1`): they are not migrated and the
  discard is accepted (S34); `LocalKeepMergeSync` only ever drained guest completions.

<!-- autoplan-accepted:ceo -->

- E1: `MenuManager.showAboutDialog` detail no longer calls CoreLive a "TODO application"; it describes the desktop writing app; the existing MenuManager test (or a new focused one) asserts the new detail text.
- E2: a committed removal guard test asserts every deleted web path (`apps/web/src/app/write`, `apps/web/src/app/live-editor`, `apps/web/src/components/live-editor`, `apps/web/src/lib/live-editor`, `apps/desktop/electron/preload-live-editor.ts`) is absent, that no source file outside history docs references them, `importLocal`, `live-editor-note-get/set` or `brainDumpAPI`, and that `/write`, `/live-editor`, `/braindump` redirect to `/home` with `permanent: false`.
- S1 (Step 6 + E1 exact copy): the About detail first line becomes exactly `Write tasks in LiveEditor, check them off, and see every finished line on your Activity Heatmap.`; the Cmd+N notification keeps title `New Task` and body `Opening LiveEditor` (still true: it opens the desktop panel) and a ShortcutManager test asserts both strings plus `showLiveEditor` called once and `openWebAppInBrowser` never called.
- S2 (Step 1 exact copy): the Home dashboard empty state (`CompletedTodos.tsx:222`, rendered by the Home Completed list) reads exactly `Check a line off in the CoreLive desktop app — it'll appear here`; a CompletedTodos test asserts the string is visible.
- S3 (Step 3 exact copy): the CategoryManageDialog description replaces "Writing saved in this app or browser will move too. Other signed-in apps, browsers, and devices preserve their own local drafts when they next refresh." with exactly `Writing in the CoreLive desktop app stays on that Mac, which asks where to keep it.` (mirrors the desktop repair copy "The category was removed. Choose where to keep this writing." at `apps/desktop/renderer/NativeDetails.tsx:37`); the dialog test asserts it and asserts Delete calls `category.delete` exactly once with no localStorage access.
- S4 (Step 1 redirects): the existing `/braindump → /live-editor` (`permanent: true`) entry is replaced, not duplicated, by `/braindump → /home`; final table = `/braindump`, `/write`, `/live-editor` → `/home` (all `permanent: false`) plus the unchanged `/floating-navigator → /login-shell`. A browser holding a cached 308 `/braindump → /live-editor` then follows the new 307 `/live-editor → /home`. Test: `apps/web/src/nextConfigRedirects.test.ts` imports `next.config.js` and asserts the exact `await redirects()` array.
- S5 (Step 1 proxy): `proxy.test.ts` "lets a signed-out stranger write on /write without a login wall" is deleted (the route no longer exists; `next.config.js` redirects run before the proxy and `/home` stays protected); the `/live-editor` protected-route cases are deleted with the matcher entry; `/home`, `/settings`, `/login-shell` cases stay.
- S6 (old clients): installed desktop builds that still load or open `/live-editor` (≤0.24.x panel; ≤0.28.x Cmd+N / File ▸ New Task / `corelive://create`) land on `/home` (or `/login?redirect_url=…/home` signed out) with no error page — accepted under the single-owner pre-release rule; the next Electron release removes the browser hop.
- S7 (`/write` literals): URL fixtures that use `/write` only as an arbitrary same-origin path (`apps/desktop/electron/__tests__/trusted-navigation.test.ts:13`, the login page `redirect_url=/write` cases, `create-client` fixtures) switch to `/home`; the E2 guard does not scan for the bare string `/write` (the redirect test must contain it).
- S8 (E2 scan set): the guard scans `git ls-files` under `apps/`, `packages/` and `scripts/` (tracked sources only, so `.next`, `node_modules` and build output are never read), excludes its own file and the redirect test, and lives at `scripts/web-live-editor-removal.test.ts` (run by `pnpm test:tools`). History docs (`docs/`, `CHANGELOG.md`, root `*.md`) are outside the scan and are handled by Step 8.
- S9 (Step 2 stop rule): before deleting each non-directory module (`useCompletionWriter`, `useTodayKeeps`, `todayHeatmapQuery`, `getViewerTimeZone`, `todo-sync-channel`, `HeatmapResponse`, `packages/live-editor/src/index.ts`), grep its symbol across `apps/`, `packages/`, `scripts/`; delete only when every remaining importer is itself deleted by this plan; a surviving production importer stops that deletion and is reported in the PR body. Current grep (2026-11-03): all have no surviving importer; `HeatmapResponse` users are only `useCompletionWriter.ts` and `LocalKeepMergeSync.tsx`; no file imports the bare `@corelive/live-editor` entry. `pnpm fallow:dead-code` green is the final gate.
- S10 (Step 7 disposition): `liveEditorUtils.test.ts` → port verbatim to `packages/live-editor/src/liveEditorUtils.test.ts`; `TodayEmber.test.tsx` (package `TodayEmber`, no desktop coverage today) → port all 11 tests to `apps/desktop/renderer/TodayEmber.test.tsx` (`@vitest-environment happy-dom`); `LiveEditorCategoryPicker.test.tsx` → port the `SharedCategoryPicker` behaviors (search by parent/child terms, no pending-ID selection with accessible actions on empty results, composition Enter/Escape, signed-out hides create/manage) to `apps/desktop/renderer/SharedCategoryPicker.test.tsx` and drop the three web create/manage dialog wiring tests; `useLiveEditorWindowSettings.sync.test.tsx` → drop the two cross-window tests (feature deleted), port "a rejected opacity save restores the last native value" to `apps/desktop/renderer/useEditorWindowSettings.test.tsx`; every other deleted test covers only deleted web code.
- S11 (Step 4 migration): migration `0004_*` drops `ImportBatch`, `Completed.importBatchId`, `Todo.importBatchId` and their indexes; `migrationJournal.test.ts`, `schemaParity.test.ts`, `baselineMigration.test.ts` and `drizzle-kit check` pass; the historical `previousOrmSchemaFingerprint.txt` fixture is unchanged. Prod data impact (accepted, pre-release): only import-batch metadata is lost; every `Completed` row and `localCompletionId` survives; no reader of the dropped data exists.
- S12 (Step 5 pre-check): the only writers of `NATIVE_WINDOW_PREFERENCES_STORAGE_KEY` are `useNativeWindowPreferencesVersion.ts` and tests (grep 2026-11-03); the desktop editor runs on the `corelive-editor://` origin and cannot read or write the web key, so no remaining peer exists.
- S13 (Step 6 behavior): `showLiveEditor()` creates the panel or shows/focuses the existing one; signed out, the panel shows its own prepare/sign-in state (unchanged offline-editor behavior). Tests: ShortcutManager, MenuManager (`createNewTask`) and DeepLinkManager (`handleCreateAction`) each assert one `showLiveEditor` call and zero browser opens; the menu test invokes the real `File ▸ New Task` template item's `click`.
- S14 (native QA): menu tracking, Cmd+N and `corelive://` delivery need host focus or would steal the installed app's protocol default, which the owner's 2026-11-02 instruction forbids ("動作確認は/agent-desktop-macosで画面と操作を奪わずに行うこと"); they are verified by the S13 tests and `pnpm qa:offline-editor`, and the PR body says so plainly. Surfaced as a gate decision.
- S15 (Steps 2/5 surviving test importers): `apps/web/src/providers/QueryClientProvider.test.tsx:24-26` stops importing `lib/live-editor/*` and states its storage keys as literal strings (same assertions); `apps/web/src/components/electron/LiveEditorSettings.test.tsx:10` loses the `NATIVE_WINDOW_PREFERENCES_STORAGE_KEY` import together with its cross-window case (`:410-419`, Step 5).
- S16 (Step 4 cross-cutting tests and constants): delete `vanishedRow.test.ts` "rolls the whole import back when its category disappears mid-write…" and `pgErrorCatchSites.test.ts` "files an import under the existing category…" and "reports alreadyImported and adds no rows…" (they cover catch sites inside the deleted procedure only; every other case in both files stays); remove `IMPORT_TRANSACTION_TIMEOUT_MS` and reword the `apps/web/src/db/transaction.ts:20-29` comments; remove `IMPORT_LOCAL_MAX_ITEMS`, the `ImportLocal*` schemas/types and their `schemas/completed.test.ts` case.
- S17 (E2 banned set + stale-string sweep): the guard bans the path strings `components/live-editor/`, `lib/live-editor/`, `app/write/`, `app/live-editor/`, `preload-live-editor`, and the identifiers `importLocal`, `live-editor-note-get`, `live-editor-note-set`, `brainDumpAPI`, `brainDumpEnv`. Before committing, run the guard on the tree and fix every hit; known hits today: `packages/desktop-contract/src/electron-api.ts:193,231,279,315,324`, `packages/desktop-contract/src/client.ts:47,66-67`, `packages/desktop-contract/src/ipc.ts:257-266`, `packages/live-editor/src/liveEditorUtils.ts:20`, `apps/desktop/electron/ipc/types.ts:14`, `apps/desktop/electron/ipc/typedHandle.ts:28,34`, `apps/desktop/electron/ipc/ipc-schemas.ts:199-206`, `apps/desktop/electron/preload.ts:497`, `apps/desktop/electron/main.ts:783,852,905-910,1038`, `apps/desktop/electron/WindowManager.ts:675`. This list supersedes Step 6's three-comment list. The settings alias `electronAPI.brainDump` (`electron-api.ts:199`, `client.ts:59`) belongs to the Settings preload, not the deleted panel, and stays.
- S18 (sidebar): `AppSidebar` is mounted only by the protected `(main)` layout (`apps/web/src/app/(main)/layout.tsx:21`), so signed-out visitors never see it; the item and its "/write is the public web host" comment go; no signed-out navigation is added (the landing page already links `/login` and `/sign-up`).
- S19 (spies): Step 6's "notification copy" update is void (S1 keeps the copy). Observable spies: ShortcutManager and MenuManager tests assert the mocked `openWebAppInBrowser` is never called; `DeepLinkManager.handleCreateAction` calls `this.ensureWindowVisible()` (→ `restoreFromTray()` → `showLiveEditor()`, `WindowManager.ts:1089`) and its test asserts `restoreFromTray` once and `openWebAppInBrowser` never. `DeepLinkManager.openInBrowser` stays (still used by the task, view and search handlers at `:385`, `:418`, `:436`).
- S20 (route-string fixtures): the Tests-section grep gate is replaced by the S8/S17 guard. Bare `/write` and `/live-editor` strings may remain only in the redirect test, the guard, `next.config.js` and the proxy test's redirect-adjacent cases; fixtures that use them only as an arbitrary same-origin path (`apps/desktop/electron/__tests__/trusted-navigation.test.ts:12-13`, `preload-origin-boundary.test.ts:25`, `apps/desktop/electron/offline/localEditorProtocol.test.ts:55`, `WindowManager.startup-panel.test.ts:155,964`, the `isTrustedAppNavigation.ts:40` JSDoc example, the login page `redirect_url=/write` cases and the `apps/web/src/app/login/[[...login]]/page.tsx:96` comment) switch to `/home`; assertions that the panel never loads a web route keep their meaning.
- S21 (authority): S10 supersedes Step 7's "list each dropped assertion with the covering test" sentence; S9 applies to "each module or export" (including `HeatmapResponse`).
- S22 (JSDoc index): the `redirects()` JSDoc example becomes `(await nextConfig.redirects())[3] // => { source: '/floating-navigator', destination: '/login-shell', permanent: true }`, with entries in the order `/braindump`, `/write`, `/live-editor`, `/floating-navigator`.
- S23 (feasibility): `node -e "import('./next.config.js')…redirects()"` from `apps/web` returns the table today (checked 2026-11-03), so `nextConfigRedirects.test.ts` imports `next.config.js` directly; the guard's `git ls-files` runs in CI's `actions/checkout` git checkout and fails the test (never passes silently) when git output is unavailable.
- S24 (pass-3 authority): S17's banned set is the single authoritative guard list (it supersedes E2's shorter list); its "known hits today" list is illustrative, and the rule is "the guard run is green after every edit". `apps/desktop/electron/__tests__/ipc-contract.test.ts` drops only the `live-editor-note-set` tuple case; all other IPC schema cases stay.
- S25 (deploy order): `Completed.importBatchId` and `Todo.importBatchId` are nullable (`apps/web/src/db/schema.ts:159,193`) and, after this PR, no code reads or writes them or `ImportBatch`, so new code against the old schema is safe. Old code still serving during the window between `db-migrate.yml` finishing and the Vercel deployment going live may error on queries that list the dropped columns; accepted under CLAUDE.md "Production Status" (no zero-downtime sequencing needed); /land-and-deploy verifies the merge-SHA `db-migrate.yml` run and the Vercel deployment, then checks `/home` on production.
- S26 (named test deletions): Step 4 deletes `completed.importLocal.test.ts`, `completed.importLocalLimits.test.ts`, `completed.createDelete.test.ts` and `category.changes.test.ts` with their procedures, plus the `rpcTransport.test.ts` cases for those procedures.
- S27 (alias names): delete the panel aliases `window.brainDumpAPI` and `window.brainDumpEnv` (`packages/desktop-contract/src/electron-api.ts:315,324`) and their doc lines; `window.liveEditorAPI` / `window.liveEditorEnv` (exposed by `preload-offline-editor.ts`) keep their names; the Settings alias `electronAPI.brainDump` and `electronAPI.liveEditor` keep their names and behavior.
- S28 (Settings controls final behavior): `LiveEditorSettings` and `usePanelSetting` load each value once on mount from the preload getter, apply a save optimistically and roll back to the confirmed main-process value on failure, and keep the per-method availability (preload skew) guard; they no longer re-read when another document saves.
- S29 (test runners): `apps/desktop/renderer/*.test.tsx` run under `pnpm test:electron` (`apps/desktop/vitest.config.electron.ts:18` includes `renderer/**/*.{spec,test}.{ts,tsx}`); `packages/live-editor/src/liveEditorUtils.test.ts` runs under `pnpm test:packages`; `scripts/web-live-editor-removal.test.ts` under `pnpm test:tools`; each new file is run once by its runner before commit.
- S30 (guard file set): the guard reads `git ls-files --cached --others --exclude-standard` under `apps/`, `packages/`, `scripts/`, filtered to files that exist on disk, so staged or unstaged deletions never false-fail and new untracked files are scanned; it runs after the `git rm` of the deleted trees.
- S31 (redirect test env): `nextConfigRedirects.test.ts` declares `// @vitest-environment node` and is run once with `pnpm --filter @corelive/web exec vitest run src/nextConfigRedirects.test.ts` before relying on it; the final gate is `pnpm validate` (Fallow dead-code/dupes/health) plus the guard after all edits.
- S32 (release coupling; both voices): #215 counts as complete only when the queued /electron-release ships a desktop build containing Step 6. Until then installed builds still route Cmd+N, File ▸ New Task and `corelive://create` to the browser (S6/S33 targets). The primary panel paths (LiveEditor toggle shortcuts, tray) are unaffected. The PR body and the owner report name this window and the release that closes it.
- S33 (`/write` target; native voice + outside onboarding finding): `/write` redirects to `/` (the public landing, matching its old public role), not `/home`; `/live-editor` and `/braindump` redirect to `/home`. This supersedes the `/write` part of S4 and E2. Table order and the JSDoc index `[3]` are unchanged, and `nextConfigRedirects.test.ts` asserts the exact table.
- S34 (drafts premise corrected; both voices): `LocalKeepMergeSync` drains only guest completions (`readUnmergedLocalCompletions`, `LocalKeepMergeSync.tsx:62`), never drafts. Browser drafts in `corelive.local-note.v1` are not migrated and become unreadable through the UI. This discard is accepted on the owner's issue statement "Nobody uses the web LiveEditor". The PR body says so plainly and names the localStorage key, and this corrects the "Not in scope" justification above.
- S35 (guard narrowed; both voices): the permanent guard checks only that the deleted paths are absent and that no tracked file imports a module under `components/live-editor/`, `lib/live-editor/`, `app/write/` or `app/live-editor/`, or names the `preload-live-editor` build entry. The identifier sweep (`importLocal`, `live-editor-note-get`, `live-editor-note-set`, `brainDumpAPI`, `brainDumpEnv`) becomes a one-time audit run before commit, with its empty result recorded in the PR body. This supersedes the identifier bans in S17/S24 for the permanent test; the S17 hit fixes still happen.
- S36 (artifact check; outside voice): `apps/desktop/electron.vite.config.ts` has no `preload-live-editor` input. This is asserted by the guard and checked once against `pnpm electron:build:ts` output, which must contain `preload-offline-editor.cjs` and the Settings preload but no `preload-live-editor.cjs`.
- S37 (web role; both voices): `docs/ROADMAP.md` and README state the web's role after #215: sign-in, the read-only Home dashboard and Settings. All writing happens in the desktop app.
- S38 (completion → Home evidence; outside voice): the "desktop completion appears on Home" promise maps to existing tests, `apps/web/src/server/procedures/completionSync.test.ts` (sync apply writes visible `Completed` rows) and `apps/web/src/server/procedures/home.test.ts` (Home bootstrap returns them). Both stay green and unchanged in intent; the implementation names the covering cases in the PR body.
- S39 (Mac download link; taste d3): the Home empty state adds a `Get Mac app` link to `https://github.com/laststance/corelive/releases/latest`, using one shared constant also used by `AppSidebar.tsx:65`, and a CompletedTodos test asserts its href. The landing/sign-up onboarding redesign is skipped (outside #215).
- S40 (migration stays, rollback recipe; taste d1): the `0004` drop stays in this PR. Rollback means reverting the PR and adding a forward migration that re-creates the nullable `importBatchId` columns and the `ImportBatch` table (no data restore needed); this recipe goes in the PR body.

<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:design -->

- DS1 (Home empty state; both voices): the unfiltered, no-history empty state of `CompletedTodos` renders, in order, the existing `CheckCircle2` icon, the headline `Your year starts here` (DESIGN.md "Empty states"; replaces "No wins logged yet"), the body `Check a line off in the CoreLive desktop app — it'll appear here` in `text-sm text-muted-foreground`, and `Get Mac app` as `Button variant="outline" asChild` wrapping `<a href={MAC_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">` with the `Download` icon and an sr-only `(opens GitHub in a new tab)`. The filtered-empty state is unchanged. A CompletedTodos test asserts the headline, body, link accessible name, href and target.
- DS2 (Home freshness; both voices; revises CEO taste d4): `CategoryChangeSync` is still deleted (rescue and `category.changes`), but its freshness role stays: a `useDashboardFreshness` hook colocated with `Dashboard.tsx` calls the existing `invalidateCategoryViews(queryClient)` every `DASHBOARD_REFRESH_INTERVAL_MS = 15_000` while `document.visibilityState === 'visible'`, and on window focus and on `visibilitychange` to visible; `Dashboard` mounts it once. Fake-timer tests assert one invalidation after 15 s while visible, none while hidden, and one on focus.
- DS3 (keep history on refetch failure; outside voice): `CompletedTodos` shows the error block only when no data is loaded; when a background refetch fails with data present the list stays. A test renders loaded data with `isError: true` and asserts the list is visible and "An error occurred" is absent.
- DS4 (delete dialog; both voices; replaces S3's draft sentence): the description keeps its existing first sentences ("… will move to …. Your entries will be kept.") and then reads exactly `Writing in the desktop app stays on each Mac. After it syncs, you choose where to keep it.` Delete shows `Deleting…` and is disabled while `category.delete` is pending; the `isSubmitting` ref blocks double submit; on failure the inline `categoryFormError` message shows, the chosen destination stays selected and Delete is enabled for retry; on success the dialog closes and focus returns to its trigger. Tests assert the copy, the pending label and retry with the kept destination.
- DS5 (`/write` target; overrides S33 with evidence): `/write` redirects to `/home` like `/live-editor` and `/braindump`, because the public landing (`apps/web/src/app/page.tsx:15-30`) holds only Login / Sign Up buttons, so a signed-in visitor would land on a login prompt; signed-out visitors reach `/login?redirect_url=…/home`, which also links sign-up. Final table: `/braindump`, `/write`, `/live-editor` → `/home` (all `permanent: false`) plus `/floating-navigator` → `/login-shell`; JSDoc index `[3]` unchanged; `nextConfigRedirects.test.ts` and headless QA assert all three → `/home`.
- DS6 (panel behavior; native voice): Cmd+N, File ▸ New Task and `corelive://create` keep `showLiveEditor()`'s existing semantics: closed or destroyed → created and revealed; hidden → revealed and focused; already visible → stays visible and focused (never toggles hidden); signed out or not prepared → the panel's own prepare/sign-in scene; hidden app icon (accessory) → same reveal. Focus and caret follow the existing reveal path (`revealLiveEditorNow`); S13/S19 tests cover create vs reveal.
- DS7 (Settings control states): S28 keeps the existing `PanelSetting` contract (`isReady`, `isSaving` disables the control, `error` message, `available` hides the row on an old preload; `apps/web/src/hooks/usePanelSetting.ts:38-51`); only the cross-document re-read is removed.
- DS8 (visual QA; native voice + outside a11y finding): headless QA captures, with no real sign-in, the Home empty state (Default light, Default dark, Warm Cathedral light, plus 375 px width), the category delete dialog and the sidebar, using an auth-free harness (the `apps/web/scripts/qa-settings` vite pattern with mocked Clerk/navigation, or the MSW oRPC fake server `apps/web/src/test/orpcServer.ts`), checks that Tab reaches `Get Mac app` with a visible focus ring, and attaches the images to the PR body.
- DS9 (download target): `MAC_DOWNLOAD_URL` stays GitHub `releases/latest` (same as the sidebar); a direct DMG link is skipped because there are two architectures.

<!-- /autoplan-accepted:design -->

<!-- autoplan-accepted:dx -->

- DX1 (docs; both voices): README lines 8, 19, 22, 55 and 225 are rewritten for the desktop-only editor (225: `⌘N` opens the LiveEditor panel; 22: deletion rescue happens in the desktop app only; 55: `qa:browser` opens `/`); the git-ignored local `CLAUDE.md` drops its two `/write` references and replaces `pnpm prisma:migrate` / `prisma:seed` / `prisma:studio` with the real `pnpm db:migrate` / `seed:dev` / `db:studio` scripts (if a script does not exist, the row is removed, never invented); this local file is never committed.
- DX2 (DB evidence; outside voice): the final verification runs `pnpm db:migrate` on the local Postgres and then `pnpm test:db` (`RUN_DB_INTEGRATION_TESTS=1`), and the run log shows `completionSync.test.ts`, `home.test.ts` and the migration tests executed (not skipped). A new migration retention test, modeled on `apps/web/src/db/categoryHierarchyMigration.test.ts`, applies migrations up to `0003` on a scratch schema, inserts a `Completed` row with `localCompletionId` and `importBatchId` plus an `ImportBatch` row, applies `0004`, and asserts the `Completed` row keeps its `id` and `localCompletionId` while `ImportBatch` and both `importBatchId` columns are gone.
- DX3 (migration recipe + rollback; outside voice): generate with `pnpm db:generate` after editing `schema.ts`; because drizzle-kit exits 0 without writing when a non-TTY rename prompt fires, confirm a new `apps/web/drizzle/0004_*.sql` plus updated snapshot/journal exist and `cat` the SQL before committing (expected statements: drop the two indexes, the two columns, the FK and the `ImportBatch` table only). Rollback (refines S40): keep `0004` in history, restore the dropped definitions in `schema.ts`, run `pnpm db:generate` to create `0005_*` that re-adds the nullable columns, both indexes, the `ImportBatch` table and its FK, apply it through `db-migrate.yml`, and check it first on a scratch database; the PR body carries these steps.
- DX4 (auth-free QA harness; outside voice + DS8): the DS8 screenshots come from extending the existing `apps/web/scripts/qa-settings` Vite harness (mocked Clerk/navigation) with Home (`CompletedTodos` empty state + `AppSidebar`) and category-delete views driven by a seeded `QueryClient`; `docs/headless-development.md` documents the harness URL and a working `pnpm qa:browser` example for it, replacing the deleted editor's `fill e12 … / Meta+Enter` example.
- DX5 (single authoritative text; both voices): the implementation follows a resolution index — redirects = DS5; Home freshness = DS2; delete dialog = DS4; guard = S35 + S30 + DX6 + DX17; native QA = S14; release coupling = S32; migration = S11 + DX2 + DX3 — and the PR body carries one checklist covering S6, S14, S32, S34, S35 (audit command), S36, S38, S40/DX3, DS8 screenshots and DX7.
- DX6 (guard failure contract; both voices): each violation prints a stable code (`WEB_LE_REMOVED_PATH`, `WEB_LE_REMOVED_IMPORT`, `WEB_LE_BUILD_ENTRY`), the repo-relative `file:line`, the matched path or import specifier, and the fix sentence `The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.`; a failed `git ls-files` reports `WEB_LE_GIT_UNAVAILABLE` with the command, exit code and stderr, separately from violations; no file contents or environment values are printed; failures exit non-zero through vitest. A meta-test feeds a fixture file list and asserts the message shape for each code.
- DX7 (removed procedures / stranded guest data; native voice): no client of `completed.importLocal`, `create`, `delete` or `category.changes` remains (S9/P3–P5); an already-open old tab gets oRPC's standard NOT_FOUND, accepted for the single owner. The PR body lists the stranded browser keys — `corelive.local-note.v1` (drafts), `corelive.local-completions.v1` and `corelive.local-merge-pending.v1` (unmerged guest keeps), `corelive.category-draft-rescues.v1` — as discarded.
- DX9 (delete retry after a lost response; native voice): when a retried `category.delete` returns NOT_FOUND (the first attempt already succeeded), the dialog invalidates category views and closes instead of showing an error; a test covers it.
- DX11 (deploy-window runbook; native voice): /land-and-deploy treats a `/home` 5xx right after the merge-SHA `db-migrate.yml` run as the S25 old-code window: wait for (or redeploy) the merge-SHA Vercel deployment; never re-run or revert `0004`.
- DX12 (deep link before ready; native voice): `handleCreateAction` with no `WindowManager` yet does not throw and logs the existing `ensureWindowVisible` no-op; a DeepLinkManager test covers it.
- DX13 (freshness interval option): `useDashboardFreshness(intervalMs = DASHBOARD_REFRESH_INTERVAL_MS)` so tests pass a small interval instead of patching the constant.
- DX14 (alias JSDoc): `electronAPI.brainDump` in `packages/desktop-contract/src/electron-api.ts` gets a JSDoc line naming it the legacy alias of `electronAPI.liveEditor` for pre-rename installed preloads.
- DX15 (dev seed): verification runs `pnpm seed:dev` on the migrated local database and it completes without `ImportBatch`.
- DX16 (audit command): the PR body records the one-time audit command `git grep -nE "importLocal|live-editor-note-(get|set)|brainDumpAPI|brainDumpEnv" -- apps packages scripts` and its empty result.
- DX17 (guard escape hatch): the guard keeps an `ALLOWED_REFERENCES` array (repo-relative path + one-line reason), initially only the guard itself and `nextConfigRedirects.test.ts`; a new entry requires a reason.
- DX18 (`qa:browser` default): the default URL becomes `http://localhost:4991/` and the explicit URL argument keeps working; its test asserts both.

<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->

- EN1 (delete retry; outside voice High, supersedes DX9): `category.delete` keeps `NOT_FOUND` but adds `data: { reason: 'CATEGORY_NOT_FOUND' }` when the source category is missing (`apps/web/src/server/procedures/category.ts:354-355`) and `data: { reason: 'DESTINATION_NOT_FOUND' }` when the destination is missing (`:395-398`). The delete mutation's `onError` (`apps/web/src/hooks/useCategoryMutations.ts:214`) shows no toast for `CATEGORY_NOT_FOUND`; the dialog treats only `CATEGORY_NOT_FOUND` as already deleted (invalidate category views, close, return focus to the trigger). `DESTINATION_NOT_FOUND` keeps the dialog open with the inline message, resets the destination to the default after the list refresh, and keeps Delete enabled. Tests: a server procedure test asserts each reason; dialog tests cover the lost-response retry (closes, toast not called) and the vanished destination (inline error, toast called once, dialog open).
- EN2 (deep link single reveal; outside voice Medium, refines S13/S19/DX12): `DeepLinkManager.handleCreateAction` stops calling `openInBrowser` and adds no reveal of its own; the existing `ensureWindowVisible()` in `handleDeepLink` (`apps/desktop/electron/DeepLinkManager.ts:225-227`) is the single reveal. Tests drive `handleDeepLink('corelive://create')` and assert `restoreFromTray` once and `openWebAppInBrowser` never; a `corelive://create` stored as `pendingUrl` before ready is surfaced exactly once by `processPendingUrl`; with no `WindowManager` it does not throw.
- EN3 (Home freshness in-flight guard; outside voice Medium + native, refines DS2/DX13): `useDashboardFreshness(intervalMs = DASHBOARD_REFRESH_INTERVAL_MS)` keeps one refresh in flight: a trigger (interval, window `focus`, `visibilitychange` to visible) while an `invalidateCategoryViews` promise is pending is dropped; a hidden document skips; after the promise settles (resolve or reject) the next trigger runs. Tests: interval + focus + visibilitychange during one pending refresh → one invalidation; a rejected refresh → the next trigger invalidates again; with a real `QueryClient`, a query under `orpc.completed.key()` becomes invalidated after a tick.
- EN4 (already-visible panel; native): ShortcutManager and MenuManager tests also cover an already-visible panel: `showLiveEditor` called once, `toggleLiveEditor` and `hide` never called.
- EN5 (Settings re-read; native, refines S28/DS7): because the Settings popover hides on blur and persists (`apps/desktop/electron/WindowManager.ts:1299-1303`), `LiveEditorSettings` and `usePanelSetting` re-read each value from the preload getter on window `focus` (skipped while that control's save is in flight), in addition to mount and confirmed saves. Test: the getter's value changes, a `focus` event fires, and the control shows the new value.
- EN6 (reverse-reference audit; native): before commit, list every non-test module under `apps/web/src` and `packages/live-editor/src` whose remaining importers are only tests or deleted files, and every `packages/live-editor` export whose only importers are deleted; delete each with its tests, or name the surviving production importer in the PR body. Known now: `./row-identity` (only importer `LiveEditor.tsx:9`) and EN7.
- EN7 (`meta.persist` machinery): remove the `query.meta?.persist !== false` dehydrate clause in `apps/web/src/lib/query/createQueryClient.ts:30-34`, the `queryMeta` augmentation in `apps/web/src/types/tanstack-query.d.ts`, and the `createQueryClient.test.ts` persist case, because their only production user `todayHeatmapQuery.ts:47` is deleted; `pnpm typecheck` and `pnpm fallow:dead-code` pass.
- EN8 (deploy window; native, refines S25/DX11): the PR body states that between the merge-SHA `db-migrate.yml` run and the merge-SHA Vercel deployment, old code may fail on `/home` and on desktop sync (`completionSync.syncBootstrap` / `syncApply`) because Drizzle names the dropped columns; /land-and-deploy treats the window as closed only when the merge-SHA Vercel deployment is READY.
- EN9 (DB tests executed; native): /ship confirms in the `test.yml` CI log that `importBatchDropMigration.test.ts`, `completionSync.test.ts` and `home.test.ts` executed (not skipped); CI runs them with `RUN_DB_INTEGRATION_TESTS: '1'` after `pnpm db:migrate` and `check-schema-drift.sh` (`.github/workflows/test.yml:55-70`).
- EN10 (resolution index addendum, extends DX5): deep link = EN2; delete retry = EN1 (DX9 superseded); Home freshness = DS2 + EN3; Settings controls = S28 + EN5; dead-code sweep = S9 + EN6 + EN7; deploy window = S25 + DX11 + EN8.

<!-- /autoplan-accepted:eng -->

## Review record

### CEO Step 0 (SELECTIVE EXPANSION, /autoplan auto-decisions)

Pre-review audit (2026-11-03): branch `fix/215-delete-web-live-editor` = origin/main ca76c4bf, no diff;
owner stash `stash@{0}: On main: wip flex` untouched; TODOS.md absent by project rule (never recreate).
TODO/FIXME grep over touched files: one hit, `apps/desktop/electron/MenuManager.ts:416` — not a marker but
stale About copy "A modern TODO application with desktop integration." (the Todo vertical was deleted in
v0.21.0). Recent churn: desktop package.json/CHANGELOG (release cadence), `packages/live-editor/src/SharedEditorSurface.tsx` (desktop editor, untouched here).
Retrospective: #168 (Todo vertical deletion) showed that deleting a UI orphans its native entry points
(memory `core-only-rebuild-todo-vertical-deleted`); this plan repeats that risk for Cmd+N / File ▸ New
Task / `corelive://create` and handles it in Step 6. Taste references: #168's deletion + pinned guard tests
(good); #218 `scripts/dslint-removal.test.ts` (good: removal guard naming deleted paths); avoid #214-style
gates that depend on the deleted Tart VM.
Landscape check: N/A — an internal dead-code removal with no product category to research; search adds
no decision input (recorded instead of fabricating queries).

#### 0A Premise challenge

Real problem: a second, unused writing surface (~10,684 lines [measured: `find … | xargs wc -l`], ~6.7k of
them tests) plus server procedures, a DB table, a desktop bridge and a cross-window signal that exist only
for it. Do-nothing cost: every `pnpm validate` runs those tests; any editor feature must be built twice or
the web copy rots (#217's keep-struck lines already exist only on desktop); the public `/write` lets a
signed-out visitor create guest keeps that `completed.importLocal` later bulk-inserts — an attack and
maintenance surface with no user.

| premise | claim                                                                    | file:line receipt                                                                                               | verdict                                                                                 |
| ------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| P1      | Desktop panel loads the bundled editor, not web `/live-editor`           | `apps/desktop/electron/WindowManager.ts:1109`                                                                   | verified                                                                                |
| P2      | Owner does not use the web editor; prod is single-user pre-release       | issue #215 body; `CLAUDE.md` "Production Status"                                                                | verified (owner statement)                                                              |
| P3      | `completed.importLocal` only client = `LocalKeepMergeSync`               | `apps/web/src/components/live-editor/LocalKeepMergeSync.tsx:52`                                                 | verified (grep)                                                                         |
| P4      | `completed.create`/`delete` only client = `useCompletionWriter`          | `apps/web/src/hooks/useCompletionWriter.ts:64`                                                                  | verified (grep)                                                                         |
| P5      | `category.changes` only client = `CategoryChangeSync`                    | `apps/web/src/components/CategoryChangeSync.tsx:47`                                                             | verified (grep)                                                                         |
| P6      | Desktop gets deletions via `syncBootstrap` and records them              | `apps/web/src/server/procedures/completionSync.ts:386`, `apps/desktop/electron/offline/WorkspaceService.ts:276` | verified                                                                                |
| P7      | Legacy-row sync guard keys on `localCompletionId`                        | `apps/web/src/server/procedures/completionSync.ts:249`                                                          | verified                                                                                |
| P8      | Migrations auto-apply on push to main                                    | `.github/workflows/db-migrate.yml:36`                                                                           | verified (+ 2026-10-22 push run green)                                                  |
| P9      | Legacy preload is built but unloaded                                     | `apps/desktop/electron.vite.config.ts:114`, `apps/desktop/electron/WindowManager.ts:716`                        | verified                                                                                |
| P10     | Note IPC channels already throw                                          | `apps/desktop/electron/main.ts:905`                                                                             | verified                                                                                |
| P11     | Native-prefs signal ignores same-document saves                          | `apps/web/src/hooks/useNativeWindowPreferencesVersion.ts:20`                                                    | verified                                                                                |
| P12     | Fallow treats export targets/tests as entries (dead exports not flagged) | `.fallowrc.jsonc:6`                                                                                             | unverified (Explore-agent claim; implementation re-checks with `pnpm fallow:dead-code`) |
| P13     | Dashboard freshness falls back to focus refetch after 60 s               | `apps/web/src/lib/constants/query.ts:1`, `apps/web/src/lib/query/createQueryClient.ts:26`                       | verified (TanStack default `refetchOnWindowFocus: true`, no override)                   |
| P14     | Settings preload exposes no editor bridge                                | `apps/desktop/electron/preload.ts:629`                                                                          | verified                                                                                |

unverified=1 (P12; the implementation's validate run settles it).

#### 0B Existing code leverage

| sub-problem                 | existing code                                                                    | plan reuse                        |
| --------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| Retired-route compatibility | `apps/web/next.config.js:45` `redirects()` (`/braindump`, `/floating-navigator`) | reuse the same table              |
| Show the desktop editor     | `WindowManager.showLiveEditor()` `apps/desktop/electron/WindowManager.ts:871`    | reuse                             |
| Desktop draft rescue        | `WorkspaceService.refreshCategories`                                             | reuse; web copy only describes it |
| Native category refresh     | `category-sync-channel.ts` `refreshCategories` nudge                             | keep                              |
| Removal guard               | `scripts/dslint-removal.test.ts` pattern (#218)                                  | reuse pattern (E2)                |
| Dev seed                    | `src/db/seed/seed.dev.ts`                                                        | trim import batches               |

#### 0C Dream state

```
  CURRENT STATE                         THIS PLAN                              12-MONTH IDEAL
  two writing surfaces (web /write +    one writing surface (desktop panel);   desktop = writing, web = read-only
  desktop panel), guest keeps + import  web = dashboard, settings, auth; no    dashboard + settings; one sync path
  path, legacy bridge, 3 dead procs     orphan procs/tables/bridges            (completionSync) for all writes
```

#### 0E–0G Mode and scope (SELECTIVE EXPANSION)

HOLD checks: >8 files touched (estimated ~90 deletions + ~35 edits) but no new classes/services; the
minimum change that meets acceptance is exactly the plan (routes, dead code, entry points). Nothing in
the plan is deferrable without leaving a dead reference, so no deferrals.

Cherry-picks (auto-decided; project rule forbids TODOS.md, so non-accepted items are Skipped, not deferred):

| #   | Proposal                                                                                                                                              | Effort | Decision | Reasoning                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------ |
| E1  | Fix the stale About copy "A modern TODO application" (`MenuManager.ts:416`)                                                                           | S      | ACCEPTED | P2: same file as Step 6, one line, discovered stale copy must be fixed in this PR                            |
| E2  | Turn the "grep gates" into a committed removal guard test naming every deleted path and retired channel (pattern of `scripts/dslint-removal.test.ts`) | S      | ACCEPTED | P1/P2: prevents resurrection; also satisfies the pregate learning `pregate-deleted-package-needs-named-test` |
| E3  | Dashboard empty-state button that opens `corelive://`                                                                                                 | S      | SKIPPED  | fails silently in a browser without the app; copy-only change is enough for a single user                    |
| E4  | Sidebar "Get the desktop app" link                                                                                                                    | S      | SKIPPED  | single owner already has the app; adds a surface to maintain                                                 |
| E5  | Replace `CategoryChangeSync` polling with a lighter dashboard refresh                                                                                 | M      | SKIPPED  | TanStack focus refetch (P13) covers it; new code for no observed need                                        |
| E6  | Delete the web `/settings` route too                                                                                                                  | M      | SKIPPED  | out of #215; Settings window and web settings remain owner-facing                                            |

Delight scan (adjacent 30-minute items): E1, E2, E3, E4, plus "redirect `/write` keeps `redirect_url`
semantics" (no work: login's `resolvePostLoginPath` already handles any same-origin path).

#### 0H Spec Review Loop (3 launches, cap reached)

| pass | score | issues                                                                   | disposition                                                                                          |
| ---- | ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1    | 6/10  | 19 (Completeness 6, Consistency 5, Clarity 4, Feasibility 4; Scope PASS) | fixed as S1–S14                                                                                      |
| 2    | 6/10  | 14 (C4, K4, U3, F3; Scope PASS) — none repeated pass 1                   | fixed as S15–S23                                                                                     |
| 3    | 7/10  | 16 (C4, K5, U4, F3; Scope PASS) — none repeated pass 2                   | fixed as 7 baseline edits + S24–S31; issues verified: 16 of 16 (applied edits, spec not re-verified) |

CEO summary: `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-03-delete-web-live-editor.md`.
Metrics appended to `~/.gstack/analytics/spec-review.jsonl` (iterations 3, found 49, fixed 33,
remaining 16, score 7). Document approval: A (approve both documents) — /autoplan auto-decision; the
owner's standing instruction is "全て選択肢はrecommend".

#### 0I Temporal interrogation

```
  HOUR 1 (foundations):  git rm the four web trees + preload-live-editor; run the S17 guard to list every hit
                         (human ~2h / CC ~10 min)
  HOUR 2-3 (core logic): server procedures + schema 0004 migration (drizzle recipe: diff --script, cat SQL,
                         never interactive); category flows; Settings controls (S28)  (human ~1 day / CC ~45 min)
  HOUR 4-5 (integration): desktop entry points (S13/S19), contract/IPC cleanup, package exports; test ports
                         (S10) under their runners (S29)  (human ~1 day / CC ~45 min)
  HOUR 6+ (polish/tests): redirect test, guard, docs (Step 8), pnpm validate + Fallow, headless QA
                         (human ~4h / CC ~30 min)
```

Surprises to expect: Fallow `dupes` may flag the ported tests if they duplicate desktop renderer
helpers (extract a shared fixture only if Fallow insists); drizzle-kit loads `.env` before config
(memory `drizzle-kit-and-pg-pool-traps`); the pregate deleted-path lane needs the E2 guard to name the
deleted directories as string literals (learning `pregate-deleted-package-needs-named-test`).
No feasibility blockers; no pending scope choices.

#### CEO dual voices (native + Codex)

Native CEO subagent: completed, `INPUT: ceo 22fbb14c…` (matches the snapshot). Verdict "approve with
changes": High — installed builds route Cmd+N / New Task / `corelive://create` to `/home` until the next
Electron release; High — irreversible schema drop bundled into an auto-migrating PR; Medium — layered
S-clauses, guard rot, mock-only native coverage, `/write` lands on a login wall + stranded drafts, web
role unstated.

Codex (gpt-6-astra, `OUTSIDE_STATUS: completed`, VERDICT findings, P1): High — the desktop-only product
still onboards through "web sign-up → empty dashboard" with the Mac download hidden in a dropdown; High —
web removal and the desktop fix ship under different completion conditions (merge ≠ distribution);
Medium — the drafts premise is wrong (`LocalKeepMergeSync` drains completions, not drafts); Medium —
owner policy treated as a product hypothesis; Medium — the permanent guard protects names, not the
"completion appears on Home" promise.

```
CEO DUAL VOICES — CONSENSUS TABLE:
  Dimension                            Claude  Codex  Consensus
  1. Premises valid?                    flag    flag   CONFIRMED (drafts premise + old-client window need correction)
  2. Right problem to solve?            yes     yes*   CONFIRMED (*state the web's role / product goal)
  3. Scope calibration correct?         smaller more   DISAGREE (split migration vs add acceptance) → taste d1/d3
  4. Alternatives sufficiently explored? flag   flag   CONFIRMED (signed-out /write path; onboarding)
  5. Competitive/market risks covered?  low     medium DISAGREE (owner-only vs public hypothesis) → S37 states the role
  6. 6-month trajectory sound?          flag    flag   CONFIRMED (release coupling, guard rot)
```

Dispositions: S32 (release coupling), S33 (`/write` → `/`), S34 (drafts premise corrected), S35 (guard
narrowed), S36 (artifact check), S37 (web role), S38 (completion → Home evidence), S39 (download link,
taste d3), S40 (migration stays with rollback recipe, taste d1). Native QA stays gate decision S14 (taste
d2). No User Challenge: both voices tie completion to an Electron release, which the owner already
requested ("…完遂して/electron-releaseお願い"); only the native voice proposed splitting the migration.

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"76caf36fe8672d5214324788fff67365ad1a914fae1e0e3809370c7e8e8181b3","replacements":[{"oldText":"   - `apps/web/next.config.js` `redirects()`: `/write`, `/live-editor` and `/braindump`\n     → `/home`, `permanent: false` (a cached 308 would outlive a future route). Update the\n     JSDoc example.","newText":"   - `apps/web/next.config.js` `redirects()`: `/braindump` (replacing its old `/live-editor`\n     destination) and `/live-editor` → `/home`, `/write` → `/` (S33), all `permanent: false`\n     (a cached 308 would outlive a future route); JSDoc example index `[3]` (S4, S22)."},{"oldText":"   - `CompletedTodos.tsx:222` empty state: point to the desktop app instead of \"Check a line\n     off in LiveEditor\" (DESIGN.md voice; no guilt copy).","newText":"   - `CompletedTodos.tsx:222` empty state: the exact S2 copy (DESIGN.md voice; no guilt copy)."},{"oldText":"     (the desktop panel) instead of opening the browser; update JSDoc, the notification\n     copy and the tests (`ShortcutManager.open-sound.test.ts`, menu tests,\n     `deep-link-manager.test.mjs`).","newText":"     (the desktop panel; the deep link through `ensureWindowVisible()`) instead of opening the\n     browser; keep the `New Task` / `Opening LiveEditor` notification; update JSDoc and the\n     tests (`ShortcutManager.open-sound.test.ts`, menu tests, `deep-link-manager.test.mjs`)\n     per S1, S13 and S19."},{"oldText":"fix stale\n     comments (`WindowManager.ts:675`, `preload.ts:497`, `main.ts:852`).","newText":"remove the\n     `preload-live-editor` entry in `apps/desktop/electron.vite.config.ts:114-116`, the\n     `live-editor-note-set` case in `apps/desktop/electron/__tests__/ipc-contract.test.ts`\n     (other cases stay), and every other hit of the S17 guard."},{"oldText":"     suite; list each dropped assertion with the covering test.","newText":"     suite per the S10 table."},{"oldText":"redirect test for the\n  three retired paths (`next.config.js` redirects table test or proxy test); desktop tests\n  asserting Cmd+N / menu / deep link call `showLiveEditor` and never `openExternal`.","newText":"redirect test for the\n  three retired paths (`apps/web/src/nextConfigRedirects.test.ts`, S4/S23); desktop tests\n  asserting Cmd+N / menu / deep link reach `showLiveEditor` and never call\n  `openWebAppInBrowser` (S19)."},{"oldText":"- Grep gates: no `components/live-editor`, `lib/live-editor`, `/write`, `importLocal`,\n  `preload-live-editor`, `live-editor-note` references remain outside history docs.","newText":"- Removal guard `scripts/web-live-editor-removal.test.ts` green (S8, S17, S20)."},{"oldText":"  `pnpm qa:browser` — `/write`, `/live-editor`, `/braindump` redirect to `/home` (signed out →\n  `/login?redirect_url=…/home`); landing and login render; no console errors.","newText":"  `pnpm qa:browser` — `/write` redirects to `/`; `/live-editor` and `/braindump` redirect to\n  `/home` (signed out → `/login?redirect_url=…/home`); landing and login render; no console errors."},{"oldText":"- Exporting stranded browser drafts (`corelive.local-note.v1`): pre-release, single user;\n  the owner's signed-in sessions already drained guest keeps through `LocalKeepMergeSync`.","newText":"- Exporting stranded browser drafts (`corelive.local-note.v1`): they are not migrated and the\n  discard is accepted (S34); `LocalKeepMergeSync` only ever drained guest completions."}]} -->

<!-- autoplan-accepted:ceo -->

- E1: `MenuManager.showAboutDialog` detail no longer calls CoreLive a "TODO application"; it describes the desktop writing app; the existing MenuManager test (or a new focused one) asserts the new detail text.
- E2: a committed removal guard test asserts every deleted web path (`apps/web/src/app/write`, `apps/web/src/app/live-editor`, `apps/web/src/components/live-editor`, `apps/web/src/lib/live-editor`, `apps/desktop/electron/preload-live-editor.ts`) is absent, that no source file outside history docs references them, `importLocal`, `live-editor-note-get/set` or `brainDumpAPI`, and that `/write`, `/live-editor`, `/braindump` redirect to `/home` with `permanent: false`.
- S1 (Step 6 + E1 exact copy): the About detail first line becomes exactly `Write tasks in LiveEditor, check them off, and see every finished line on your Activity Heatmap.`; the Cmd+N notification keeps title `New Task` and body `Opening LiveEditor` (still true: it opens the desktop panel) and a ShortcutManager test asserts both strings plus `showLiveEditor` called once and `openWebAppInBrowser` never called.
- S2 (Step 1 exact copy): the Home dashboard empty state (`CompletedTodos.tsx:222`, rendered by the Home Completed list) reads exactly `Check a line off in the CoreLive desktop app — it'll appear here`; a CompletedTodos test asserts the string is visible.
- S3 (Step 3 exact copy): the CategoryManageDialog description replaces "Writing saved in this app or browser will move too. Other signed-in apps, browsers, and devices preserve their own local drafts when they next refresh." with exactly `Writing in the CoreLive desktop app stays on that Mac, which asks where to keep it.` (mirrors the desktop repair copy "The category was removed. Choose where to keep this writing." at `apps/desktop/renderer/NativeDetails.tsx:37`); the dialog test asserts it and asserts Delete calls `category.delete` exactly once with no localStorage access.
- S4 (Step 1 redirects): the existing `/braindump → /live-editor` (`permanent: true`) entry is replaced, not duplicated, by `/braindump → /home`; final table = `/braindump`, `/write`, `/live-editor` → `/home` (all `permanent: false`) plus the unchanged `/floating-navigator → /login-shell`. A browser holding a cached 308 `/braindump → /live-editor` then follows the new 307 `/live-editor → /home`. Test: `apps/web/src/nextConfigRedirects.test.ts` imports `next.config.js` and asserts the exact `await redirects()` array.
- S5 (Step 1 proxy): `proxy.test.ts` "lets a signed-out stranger write on /write without a login wall" is deleted (the route no longer exists; `next.config.js` redirects run before the proxy and `/home` stays protected); the `/live-editor` protected-route cases are deleted with the matcher entry; `/home`, `/settings`, `/login-shell` cases stay.
- S6 (old clients): installed desktop builds that still load or open `/live-editor` (≤0.24.x panel; ≤0.28.x Cmd+N / File ▸ New Task / `corelive://create`) land on `/home` (or `/login?redirect_url=…/home` signed out) with no error page — accepted under the single-owner pre-release rule; the next Electron release removes the browser hop.
- S7 (`/write` literals): URL fixtures that use `/write` only as an arbitrary same-origin path (`apps/desktop/electron/__tests__/trusted-navigation.test.ts:13`, the login page `redirect_url=/write` cases, `create-client` fixtures) switch to `/home`; the E2 guard does not scan for the bare string `/write` (the redirect test must contain it).
- S8 (E2 scan set): the guard scans `git ls-files` under `apps/`, `packages/` and `scripts/` (tracked sources only, so `.next`, `node_modules` and build output are never read), excludes its own file and the redirect test, and lives at `scripts/web-live-editor-removal.test.ts` (run by `pnpm test:tools`). History docs (`docs/`, `CHANGELOG.md`, root `*.md`) are outside the scan and are handled by Step 8.
- S9 (Step 2 stop rule): before deleting each non-directory module (`useCompletionWriter`, `useTodayKeeps`, `todayHeatmapQuery`, `getViewerTimeZone`, `todo-sync-channel`, `HeatmapResponse`, `packages/live-editor/src/index.ts`), grep its symbol across `apps/`, `packages/`, `scripts/`; delete only when every remaining importer is itself deleted by this plan; a surviving production importer stops that deletion and is reported in the PR body. Current grep (2026-11-03): all have no surviving importer; `HeatmapResponse` users are only `useCompletionWriter.ts` and `LocalKeepMergeSync.tsx`; no file imports the bare `@corelive/live-editor` entry. `pnpm fallow:dead-code` green is the final gate.
- S10 (Step 7 disposition): `liveEditorUtils.test.ts` → port verbatim to `packages/live-editor/src/liveEditorUtils.test.ts`; `TodayEmber.test.tsx` (package `TodayEmber`, no desktop coverage today) → port all 11 tests to `apps/desktop/renderer/TodayEmber.test.tsx` (`@vitest-environment happy-dom`); `LiveEditorCategoryPicker.test.tsx` → port the `SharedCategoryPicker` behaviors (search by parent/child terms, no pending-ID selection with accessible actions on empty results, composition Enter/Escape, signed-out hides create/manage) to `apps/desktop/renderer/SharedCategoryPicker.test.tsx` and drop the three web create/manage dialog wiring tests; `useLiveEditorWindowSettings.sync.test.tsx` → drop the two cross-window tests (feature deleted), port "a rejected opacity save restores the last native value" to `apps/desktop/renderer/useEditorWindowSettings.test.tsx`; every other deleted test covers only deleted web code.
- S11 (Step 4 migration): migration `0004_*` drops `ImportBatch`, `Completed.importBatchId`, `Todo.importBatchId` and their indexes; `migrationJournal.test.ts`, `schemaParity.test.ts`, `baselineMigration.test.ts` and `drizzle-kit check` pass; the historical `previousOrmSchemaFingerprint.txt` fixture is unchanged. Prod data impact (accepted, pre-release): only import-batch metadata is lost; every `Completed` row and `localCompletionId` survives; no reader of the dropped data exists.
- S12 (Step 5 pre-check): the only writers of `NATIVE_WINDOW_PREFERENCES_STORAGE_KEY` are `useNativeWindowPreferencesVersion.ts` and tests (grep 2026-11-03); the desktop editor runs on the `corelive-editor://` origin and cannot read or write the web key, so no remaining peer exists.
- S13 (Step 6 behavior): `showLiveEditor()` creates the panel or shows/focuses the existing one; signed out, the panel shows its own prepare/sign-in state (unchanged offline-editor behavior). Tests: ShortcutManager, MenuManager (`createNewTask`) and DeepLinkManager (`handleCreateAction`) each assert one `showLiveEditor` call and zero browser opens; the menu test invokes the real `File ▸ New Task` template item's `click`.
- S14 (native QA): menu tracking, Cmd+N and `corelive://` delivery need host focus or would steal the installed app's protocol default, which the owner's 2026-11-02 instruction forbids ("動作確認は/agent-desktop-macosで画面と操作を奪わずに行うこと"); they are verified by the S13 tests and `pnpm qa:offline-editor`, and the PR body says so plainly. Surfaced as a gate decision.
- S15 (Steps 2/5 surviving test importers): `apps/web/src/providers/QueryClientProvider.test.tsx:24-26` stops importing `lib/live-editor/*` and states its storage keys as literal strings (same assertions); `apps/web/src/components/electron/LiveEditorSettings.test.tsx:10` loses the `NATIVE_WINDOW_PREFERENCES_STORAGE_KEY` import together with its cross-window case (`:410-419`, Step 5).
- S16 (Step 4 cross-cutting tests and constants): delete `vanishedRow.test.ts` "rolls the whole import back when its category disappears mid-write…" and `pgErrorCatchSites.test.ts` "files an import under the existing category…" and "reports alreadyImported and adds no rows…" (they cover catch sites inside the deleted procedure only; every other case in both files stays); remove `IMPORT_TRANSACTION_TIMEOUT_MS` and reword the `apps/web/src/db/transaction.ts:20-29` comments; remove `IMPORT_LOCAL_MAX_ITEMS`, the `ImportLocal*` schemas/types and their `schemas/completed.test.ts` case.
- S17 (E2 banned set + stale-string sweep): the guard bans the path strings `components/live-editor/`, `lib/live-editor/`, `app/write/`, `app/live-editor/`, `preload-live-editor`, and the identifiers `importLocal`, `live-editor-note-get`, `live-editor-note-set`, `brainDumpAPI`, `brainDumpEnv`. Before committing, run the guard on the tree and fix every hit; known hits today: `packages/desktop-contract/src/electron-api.ts:193,231,279,315,324`, `packages/desktop-contract/src/client.ts:47,66-67`, `packages/desktop-contract/src/ipc.ts:257-266`, `packages/live-editor/src/liveEditorUtils.ts:20`, `apps/desktop/electron/ipc/types.ts:14`, `apps/desktop/electron/ipc/typedHandle.ts:28,34`, `apps/desktop/electron/ipc/ipc-schemas.ts:199-206`, `apps/desktop/electron/preload.ts:497`, `apps/desktop/electron/main.ts:783,852,905-910,1038`, `apps/desktop/electron/WindowManager.ts:675`. This list supersedes Step 6's three-comment list. The settings alias `electronAPI.brainDump` (`electron-api.ts:199`, `client.ts:59`) belongs to the Settings preload, not the deleted panel, and stays.
- S18 (sidebar): `AppSidebar` is mounted only by the protected `(main)` layout (`apps/web/src/app/(main)/layout.tsx:21`), so signed-out visitors never see it; the item and its "/write is the public web host" comment go; no signed-out navigation is added (the landing page already links `/login` and `/sign-up`).
- S19 (spies): Step 6's "notification copy" update is void (S1 keeps the copy). Observable spies: ShortcutManager and MenuManager tests assert the mocked `openWebAppInBrowser` is never called; `DeepLinkManager.handleCreateAction` calls `this.ensureWindowVisible()` (→ `restoreFromTray()` → `showLiveEditor()`, `WindowManager.ts:1089`) and its test asserts `restoreFromTray` once and `openWebAppInBrowser` never. `DeepLinkManager.openInBrowser` stays (still used by the task, view and search handlers at `:385`, `:418`, `:436`).
- S20 (route-string fixtures): the Tests-section grep gate is replaced by the S8/S17 guard. Bare `/write` and `/live-editor` strings may remain only in the redirect test, the guard, `next.config.js` and the proxy test's redirect-adjacent cases; fixtures that use them only as an arbitrary same-origin path (`apps/desktop/electron/__tests__/trusted-navigation.test.ts:12-13`, `preload-origin-boundary.test.ts:25`, `apps/desktop/electron/offline/localEditorProtocol.test.ts:55`, `WindowManager.startup-panel.test.ts:155,964`, the `isTrustedAppNavigation.ts:40` JSDoc example, the login page `redirect_url=/write` cases and the `apps/web/src/app/login/[[...login]]/page.tsx:96` comment) switch to `/home`; assertions that the panel never loads a web route keep their meaning.
- S21 (authority): S10 supersedes Step 7's "list each dropped assertion with the covering test" sentence; S9 applies to "each module or export" (including `HeatmapResponse`).
- S22 (JSDoc index): the `redirects()` JSDoc example becomes `(await nextConfig.redirects())[3] // => { source: '/floating-navigator', destination: '/login-shell', permanent: true }`, with entries in the order `/braindump`, `/write`, `/live-editor`, `/floating-navigator`.
- S23 (feasibility): `node -e "import('./next.config.js')…redirects()"` from `apps/web` returns the table today (checked 2026-11-03), so `nextConfigRedirects.test.ts` imports `next.config.js` directly; the guard's `git ls-files` runs in CI's `actions/checkout` git checkout and fails the test (never passes silently) when git output is unavailable.
- S24 (pass-3 authority): S17's banned set is the single authoritative guard list (it supersedes E2's shorter list); its "known hits today" list is illustrative, and the rule is "the guard run is green after every edit". `apps/desktop/electron/__tests__/ipc-contract.test.ts` drops only the `live-editor-note-set` tuple case; all other IPC schema cases stay.
- S25 (deploy order): `Completed.importBatchId` and `Todo.importBatchId` are nullable (`apps/web/src/db/schema.ts:159,193`) and, after this PR, no code reads or writes them or `ImportBatch`, so new code against the old schema is safe. Old code still serving during the window between `db-migrate.yml` finishing and the Vercel deployment going live may error on queries that list the dropped columns; accepted under CLAUDE.md "Production Status" (no zero-downtime sequencing needed); /land-and-deploy verifies the merge-SHA `db-migrate.yml` run and the Vercel deployment, then checks `/home` on production.
- S26 (named test deletions): Step 4 deletes `completed.importLocal.test.ts`, `completed.importLocalLimits.test.ts`, `completed.createDelete.test.ts` and `category.changes.test.ts` with their procedures, plus the `rpcTransport.test.ts` cases for those procedures.
- S27 (alias names): delete the panel aliases `window.brainDumpAPI` and `window.brainDumpEnv` (`packages/desktop-contract/src/electron-api.ts:315,324`) and their doc lines; `window.liveEditorAPI` / `window.liveEditorEnv` (exposed by `preload-offline-editor.ts`) keep their names; the Settings alias `electronAPI.brainDump` and `electronAPI.liveEditor` keep their names and behavior.
- S28 (Settings controls final behavior): `LiveEditorSettings` and `usePanelSetting` load each value once on mount from the preload getter, apply a save optimistically and roll back to the confirmed main-process value on failure, and keep the per-method availability (preload skew) guard; they no longer re-read when another document saves.
- S29 (test runners): `apps/desktop/renderer/*.test.tsx` run under `pnpm test:electron` (`apps/desktop/vitest.config.electron.ts:18` includes `renderer/**/*.{spec,test}.{ts,tsx}`); `packages/live-editor/src/liveEditorUtils.test.ts` runs under `pnpm test:packages`; `scripts/web-live-editor-removal.test.ts` under `pnpm test:tools`; each new file is run once by its runner before commit.
- S30 (guard file set): the guard reads `git ls-files --cached --others --exclude-standard` under `apps/`, `packages/`, `scripts/`, filtered to files that exist on disk, so staged or unstaged deletions never false-fail and new untracked files are scanned; it runs after the `git rm` of the deleted trees.
- S31 (redirect test env): `nextConfigRedirects.test.ts` declares `// @vitest-environment node` and is run once with `pnpm --filter @corelive/web exec vitest run src/nextConfigRedirects.test.ts` before relying on it; the final gate is `pnpm validate` (Fallow dead-code/dupes/health) plus the guard after all edits.
- S32 (release coupling; both voices): #215 counts as complete only when the queued /electron-release ships a desktop build containing Step 6. Until then installed builds still route Cmd+N, File ▸ New Task and `corelive://create` to the browser (S6/S33 targets). The primary panel paths (LiveEditor toggle shortcuts, tray) are unaffected. The PR body and the owner report name this window and the release that closes it.
- S33 (`/write` target; native voice + outside onboarding finding): `/write` redirects to `/` (the public landing, matching its old public role), not `/home`; `/live-editor` and `/braindump` redirect to `/home`. This supersedes the `/write` part of S4 and E2. Table order and the JSDoc index `[3]` are unchanged, and `nextConfigRedirects.test.ts` asserts the exact table.
- S34 (drafts premise corrected; both voices): `LocalKeepMergeSync` drains only guest completions (`readUnmergedLocalCompletions`, `LocalKeepMergeSync.tsx:62`), never drafts. Browser drafts in `corelive.local-note.v1` are not migrated and become unreadable through the UI. This discard is accepted on the owner's issue statement "Nobody uses the web LiveEditor". The PR body says so plainly and names the localStorage key, and this corrects the "Not in scope" justification above.
- S35 (guard narrowed; both voices): the permanent guard checks only that the deleted paths are absent and that no tracked file imports a module under `components/live-editor/`, `lib/live-editor/`, `app/write/` or `app/live-editor/`, or names the `preload-live-editor` build entry. The identifier sweep (`importLocal`, `live-editor-note-get`, `live-editor-note-set`, `brainDumpAPI`, `brainDumpEnv`) becomes a one-time audit run before commit, with its empty result recorded in the PR body. This supersedes the identifier bans in S17/S24 for the permanent test; the S17 hit fixes still happen.
- S36 (artifact check; outside voice): `apps/desktop/electron.vite.config.ts` has no `preload-live-editor` input. This is asserted by the guard and checked once against `pnpm electron:build:ts` output, which must contain `preload-offline-editor.cjs` and the Settings preload but no `preload-live-editor.cjs`.
- S37 (web role; both voices): `docs/ROADMAP.md` and README state the web's role after #215: sign-in, the read-only Home dashboard and Settings. All writing happens in the desktop app.
- S38 (completion → Home evidence; outside voice): the "desktop completion appears on Home" promise maps to existing tests, `apps/web/src/server/procedures/completionSync.test.ts` (sync apply writes visible `Completed` rows) and `apps/web/src/server/procedures/home.test.ts` (Home bootstrap returns them). Both stay green and unchanged in intent; the implementation names the covering cases in the PR body.
- S39 (Mac download link; taste d3): the Home empty state adds a `Get Mac app` link to `https://github.com/laststance/corelive/releases/latest`, using one shared constant also used by `AppSidebar.tsx:65`, and a CompletedTodos test asserts its href. The landing/sign-up onboarding redesign is skipped (outside #215).
- S40 (migration stays, rollback recipe; taste d1): the `0004` drop stays in this PR. Rollback means reverting the PR and adding a forward migration that re-creates the nullable `importBatchId` columns and the `ImportBatch` table (no data restore needed); this recipe goes in the PR body.

<!-- /autoplan-accepted:ceo -->

### CEO Review Sections 1–11

#### Section 1: Architecture Review

```
BEFORE                                             AFTER
web /write ─┐                                      (redirect /write → /)
web /live-editor ─┼─ LiveEditor.tsx ─┬─ lib/live-editor/* (localStorage stores)
            │                     ├─ useCompletionWriter ─ completed.create/delete
            │                     ├─ LocalKeepMergeSync ── completed.importLocal ─ ImportBatch
            │                     └─ todo-sync-channel ─ Dashboard invalidation
CategoryManageDialog ─ rescueCategoryDraft         CategoryManageDialog ─ category.delete
CategoryChangeSync ─ category.changes (15 s poll)  (removed; TanStack focus refetch)
useNativeWindowPreferencesVersion ─ localStorage   (removed; controls read once + own saves)
desktop Cmd+N / New Task / corelive://create       desktop Cmd+N / New Task / corelive://create
   └─ openWebAppInBrowser('/live-editor')             └─ WindowManager.showLiveEditor() (panel)
preload-live-editor.cjs (built, unloaded)          (removed)
desktop panel ─ preload-offline-editor ─ completionSync.syncBootstrap/syncApply ─ Completed ─ Home
                                                   (unchanged: the only write path)
```

New flows are only redirects and the three entry points; both are stateless. Redirect: happy `/write` →
307 `/`; nil/empty n/a (static match); error n/a (Next config). Entry point: happy → panel created or
revealed; nil (`windowManager` absent) → existing `log.warn` no-op (`MenuManager.ts:321`) or
`ensureWindowVisible` no-op until ready (`DeepLinkManager.ts:461`); empty n/a; error → panel load failure
handled by the existing startup-panel retry/backoff (`WindowManager.startup-panel.test.ts:964`). No new
state machine (the panel reveal state `liveEditorRevealPending`, `WindowManager.ts:116`, is unchanged).
Coupling only shrinks (web no longer imports `getLiveEditorAPI`/`isLiveEditorEnvironment`). Security
architecture: four oRPC procedures and one public route disappear; no new endpoint. Rollback: S40.
Value test (removal guard): consumer = CI and pregate's deleted-path lane; changed decision = a
resurrected path fails CI; smallest version = S35 (paths + import specifiers); retires never (it checks
names that must not return). Findings: none beyond decided S32/S40.

#### Section 2: Error & Rescue Map

```
  METHOD/CODEPATH                         | WHAT CAN GO WRONG                 | EXCEPTION CLASS
  ----------------------------------------|-----------------------------------|----------------------------
  ShortcutManager.handleNewTaskShortcut   | panel creation throws             | Error (BrowserWindow)
  MenuManager.createNewTask               | windowManager missing             | none (guard)
  DeepLinkManager.handleCreateAction      | deep link before WindowManager    | none (guard)
  next.config.js redirects()              | none at runtime (static table)    | —
  CategoryManageDialog.confirm            | category.delete rejects           | ORPCError (CONFLICT/NOT_FOUND)
  db-migrate.yml 0004                     | SQL fails / DB unreachable        | job failure
  Settings controls save (S28)            | preload setter rejects            | Error
  removal guard                           | git ls-files unavailable          | Error (child_process)

  EXCEPTION CLASS          | RESCUED? | RESCUE ACTION                               | USER SEES
  -------------------------|----------|---------------------------------------------|------------------------------
  Error (panel creation)   | Y        | existing try/catch + log.error              | nothing (pre-existing; rare)
  windowManager missing    | Y        | log.warn no-op                              | nothing (startup only)
  ORPCError (delete)       | Y        | categoryFormError in the dialog, retry      | inline error, dialog stays open
  migration job failure    | Y        | job fails red; new code needs no drop       | nothing; owner sees a red Action
  Error (setter)           | Y        | roll back to confirmed value (S28)          | control snaps back + existing toast
  Error (git ls-files)     | Y        | test fails loudly (S23/S30)                 | CI red
```

No GAP rows: every new or changed path either already logs and degrades or fails visibly.

#### Section 3: Security & Threat Model

Attack surface shrinks: the public `/write` (signed-out writes into localStorage) and
`completed.importLocal` (authenticated bulk insert of client-supplied rows) disappear, as do
`completed.create`, `completed.delete` and `category.changes`. The redirects use static destinations, so
there is no open redirect; `redirect_url` handling in login is unchanged. No new secrets, dependencies,
inputs or data classes. Findings: 0 new; 1 mitigated (surface reduction), likelihood/impact n/a.

#### Section 4: Data Flow & Interaction Edge Cases

```
  GET /write?x=1 ──► next.config redirects (exact source) ──► 307 / ?x=1 (query kept) ──► landing
        └ /write/foo ─► no match ─► 404 (no sub-paths ever existed)        └ trailing slash ─► Next strips, then redirect
  GET /live-editor ──► 307 /home ──► proxy: signed out? ──► 307 /login?redirect_url=…/home ──► Clerk ──► /home
```

| INTERACTION         | EDGE CASE             | HANDLED?     | HOW?                                                     |
| ------------------- | --------------------- | ------------ | -------------------------------------------------------- |
| Cmd+N               | pressed twice quickly | Y            | `liveEditorRevealPending` guard (`WindowManager.ts:885`) |
| Cmd+N               | panel destroyed       | Y            | `showLiveEditor` recreates it (`WindowManager.ts:876`)   |
| Cmd+N               | signed out            | Y            | panel shows its prepare/sign-in scene                    |
| `corelive://create` | before app ready      | Y            | `ensureWindowVisible` no-op; same as other deep links    |
| Delete category     | double click          | Y            | `isSubmitting` ref (kept)                                |
| Delete category     | delete fails          | Y            | inline `categoryFormError`; dialog stays                 |
| Old installed app   | Cmd+N                 | Y (degraded) | browser `/home` until /electron-release (S32)            |

Async ordering: the delete dialog drops its rescue→delete await pair; one mutation remains, so no new
shared-state race.

#### Section 5: Code Quality Review

The deletion removes duplicated behavior (a second editor, a second completion writer, two
localStorage-based sync channels). Remaining code keeps existing patterns. Risk: leftover names such as
`useCategorySync` now only invalidate views; keep the name (call sites read naturally). No method gains
branches; the dialog's state machine simplifies. Over-engineering avoided by S35.

#### Section 6: Test Review

```
  NEW / CHANGED                           TEST (type)                                     STATUS
  redirect table                          nextConfigRedirects.test.ts (unit, node env)     new (S4/S31/S33)
  deleted paths / imports / build entry   scripts/web-live-editor-removal.test.ts (unit)   new (S35/S36)
  Cmd+N → panel                           ShortcutManager.open-sound.test.ts (unit)        updated (S1/S19)
  File ▸ New Task → panel                 MenuManager test, real template click (unit)     updated (S13)
  corelive://create → panel               deep-link-manager.test.mjs (unit)                updated (S19)
  About copy                              MenuManager test (unit)                          new (E1/S1)
  Home empty state + Get Mac app          CompletedTodos test (component)                  new (S2/S39)
  delete dialog copy + single mutation    CategoryManageDialog.test.tsx (component)        updated (S3)
  Settings controls once + rollback       LiveEditorSettings / usePanelSetting tests       updated (S28)
  package utils / ember / picker / window settings  ported tests (S10/S29)                ported
  sync legacy guard                       completionSync.test.ts direct insert             rewritten
  completion → Home                       completionSync.test.ts + home.test.ts            existing (S38)
  0004 migration                          migrationJournal / schemaParity / baseline       updated (S11)
```

2am-Friday test: removal guard + redirect table + the three entry-point tests + `pnpm validate`.
Hostile QA: `/live-editor?x=1` keeps `?x=1`; Cmd+N with a destroyed panel recreates it. Chaos: the
migration fails after deploy → new code keeps working. Flakiness: none (no time/randomness; the guard
reads git deterministically). Pyramid: unit-heavy, no E2E (project rule).

#### Section 7: Performance Review

No new queries. Removing `CategoryChangeSync` drops a 15 s poll per open browser tab
(`CategoryChangeSync.tsx:117`); dropping two `importBatchId` indexes lowers write cost on `Completed` and
`Todo`; the web bundle loses the editor. No N+1, cache or pool changes.

#### Section 8: Observability & Debuggability Review

Entry points keep their existing logs (`ShortcutManager.ts` catch logs; DeepLinkManager logs every
action, `DeepLinkManager.ts:294`). Post-deploy evidence: the merge-SHA `db-migrate.yml` run, the Vercel
deployment record, `curl -I` of the three retired paths, `/home` status. Runbook: a red `db-migrate.yml`
→ read its log and re-run after the fix (new code does not depend on the drop); `/home` errors right after
deploy → the old-code window (S25), resolved when the new deployment is live.

#### Section 9: Deployment & Rollout Review

Migration: destructive drop of nullable columns + one table, not zero-downtime by design (CLAUDE.md
"Production Status"); rollback S40. No feature flag (single user). Order: merge → `db-migrate.yml` and
Vercel run in parallel → /land-and-deploy verifies both → /electron-release closes the desktop window
(S32). Post-deploy checklist (first 5 minutes): `/write` 307 → `/`; `/live-editor`, `/braindump` 307 →
`/home`; `/home` signed out 307 → `/login`; migration run green. Staging: none (owner-only prod).

#### Section 10: Long-Term Trajectory Review

Debt removed: ~10.7k lines, four procedures, one table, one bridge. Debt added: one guard test.
Reversibility: 3/5 (code revertible; schema needs a forward migration). Path dependency: a future web
writing surface would be rebuilt on `completionSync`, which is the intended single write path. The
1-year question: yes — the web is read-only, documented by S37. Retrospective: E1/E2 were the right
picks; E3/E4 were later partly revived by the outside voice as S39 (download link only).

#### Section 11: Design & UX Review (UI scope)

```
  signed-out /write ─► / landing (Login / Sign Up)
  signed-in /home ─► Completed list
        ├─ loading (existing skeleton)
        ├─ empty: "No wins logged yet" + "Check a line off in the CoreLive desktop app — it'll appear here" + [Get Mac app]
        ├─ error (existing)
        └─ success (existing)
  Category ▸ Delete ─► dialog (S3 copy) ─► Deleting… ─► closed | inline error
  Sidebar: Home (+ existing items), no LiveEditor item
```

| FEATURE                | LOADING     | EMPTY    | ERROR                      | SUCCESS  | PARTIAL          |
| ---------------------- | ----------- | -------- | -------------------------- | -------- | ---------------- |
| Home Completed list    | existing    | S2 + S39 | existing                   | existing | existing filters |
| Category delete dialog | "Deleting…" | n/a      | inline `categoryFormError` | closes   | n/a              |

DESIGN.md: copy stays self-affirming (no streak/guilt); the link uses existing tokens/components (no
hard-coded color). Accessibility: the link has visible text, opens a new tab with
`rel="noopener noreferrer"` like the sidebar link. Recommend /plan-design-review (Phase 2 runs).

### CEO required outputs

#### Reality rows

```
REALITY: premise-table pass 14 premises with receipts; unverified=1 (P12 Fallow entry semantics, settled by pnpm fallow:dead-code during implementation) .fallowrc.jsonc:6
REALITY: already-done pass git log origin/main --since=2026-11-02T06:54:23Z over the named files is empty; the --grep hit 4302821e (#217) is desktop-only 4302821e
REALITY: surface-check pass pnpm validate, test:electron, qa:browser, qa:settings, qa:offline-editor exist in package.json:109; routes exist apps/web/src/app/write/page.tsx:1 and the redirect table apps/web/next.config.js:45
REALITY: binding-decisions pass gstack-decision-search --scope branch --recent 50 returned nothing and the plan has no Binding decisions; CLAUDE.md allows destructive prod changes CLAUDE.md:47
REALITY: numbers pass "~10,700 lines" [measured: find … | xargs wc -l = 10684] apps/web/src/components/live-editor/LiveEditor.tsx:1; "15 s" [measured] apps/web/src/components/CategoryChangeSync.tsx:117; "60 s" [measured] apps/web/src/lib/constants/query.ts:1; "11 tests" [measured: grep] apps/web/src/components/live-editor/TodayEmber.test.tsx:31
REALITY: deferred-asks pass every #215 ask is covered (routes, dead code, validate, desktop/Settings/Home unaffected; Home imports none of the editor modules per S9; Settings via S28) docs/designs/delete-web-live-editor.md:21
REALITY: pr-count pass one PR (no pr_count in ship policy) .gstack/ship-policy.json:1
REALITY: transaction-semantics n/a no driver, pool or protocol change; the migration only drops nullable columns and a table apps/web/src/db/schema.ts:193
```

#### NOT in scope

- Deferred: none (project rule — no TODOS.md; discovered work is fixed in this PR).
- Skipped: E3 (dashboard `corelive://` button — fails silently without the app); E4 (sidebar desktop link —
  superseded by S39's empty-state link); E5 (replacement poll — focus refetch suffices); E6 (delete web
  `/settings` — outside #215); landing/sign-up onboarding redesign (outside #215, owner-only product today);
  exporting browser drafts (S34, discard accepted); splitting the migration (taste d1).
- Other pipelines: the desktop offline editor (#216); the update HUD (#214); the Electron release (queued).

#### What already exists

Redirect table (`next.config.js:45`), `WindowManager.showLiveEditor` / `restoreFromTray`
(`WindowManager.ts:871`, `:1089`), `DeepLinkManager.ensureWindowVisible` (`:461`), the desktop draft
repair flow (`NativeDetails.tsx:37`), `completionSync` (the only write path), the `#218` removal-guard
pattern (`scripts/dslint-removal.test.ts`), the sidebar Mac download URL (`AppSidebar.tsx:65`), the dev
seed. All are reused; nothing is rebuilt.

#### Dream state delta

This plan reaches "one writing surface, one write path, read-only web" except for the installed-app
window that /electron-release closes (S32). Left for later pipelines: the offline-first desktop editor
(#216) and a public-launch onboarding story (not requested).

#### Error & Rescue Registry

Same rows as Section 2: 8 codepaths, 6 exception classes, 0 CRITICAL GAPS.

#### Failure Modes Registry

```
  CODEPATH                    | FAILURE MODE                      | RESCUED? | TEST? | USER SEES?               | LOGGED?
  ----------------------------|-----------------------------------|----------|-------|--------------------------|--------
  Cmd+N / New Task / create   | panel creation throws             | Y        | Y     | nothing (rare)           | Y
  retired route request       | old bookmark / old app            | Y        | Y     | redirect to / or /home   | n/a
  category delete             | delete rejects                    | Y        | Y     | inline error             | Y
  0004 migration              | job fails                         | Y        | Y*    | nothing (red Action)     | Y
  old-code window after drop  | query lists dropped column        | N (accepted, S25) | N | brief /home error | Y (Vercel)
  Settings control save       | setter rejects                    | Y        | Y     | value snaps back         | Y
  removal guard               | git unavailable                   | Y        | Y     | CI red                   | Y
```

(*journal/parity tests.) 7 rows, 0 CRITICAL GAPS (the accepted S25 window is visible and logged, not
silent).

#### Scope Expansion Decisions

Accepted: E1, E2 (+ S1–S40 refinements). Deferred: none. Skipped: E3, E4, E5, E6.

#### Diagrams

System architecture and data flow (Section 1), redirect flow with shadow paths (Section 4), error flow
(Section 2), UI flow (Section 11). State machine: none new. Deployment sequence and rollback (Section 9 +
S40):

```
  merge ─┬─► db-migrate.yml (0004) ─► green? ─► done      rollback: revert PR ─► forward migration re-adds
         └─► Vercel deploy ─► live ─► curl checks          nullable columns + ImportBatch ─► redeploy
  then /electron-release ─► desktop Cmd+N/New Task/create open the panel
```

Stale diagram audit: no ASCII diagrams exist in the files this plan touches.

#### Implementation Tasks (CEO)

Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — web routes — delete `/write` + `/live-editor`, redirect table (S4/S33), proxy, sidebar, Home empty state + Get Mac app (S2/S39)
  - Surfaced by: Steps 1, S4, S33, S39
  - Files: apps/web/next.config.js, apps/web/src/proxy.ts, apps/web/src/components/AppSidebar.tsx, apps/web/src/app/(main)/home/_components/CompletedTodos.tsx
  - Verify: `pnpm --filter @corelive/web exec vitest run src/nextConfigRedirects.test.ts src/proxy.test.ts`
- [ ] **T2 (P1, human: ~1d / CC: ~30min)** — web editor — delete editor trees and editor-only hooks/libs; category flows; Settings controls (S28)
  - Surfaced by: Steps 2, 3, 5, S9, S15, S28
  - Files: apps/web/src/components/live-editor/, apps/web/src/lib/live-editor/, apps/web/src/hooks/, apps/web/src/components/CategoryChangeSync.tsx
  - Verify: `pnpm test`
- [ ] **T3 (P1, human: ~1d / CC: ~30min)** — server + schema — delete four procedures, `0004` migration, seed, tests (S11/S16/S26)
  - Surfaced by: Step 4, S11, S16, S25, S26, S40
  - Files: apps/web/src/server/, apps/web/src/db/schema.ts, apps/web/drizzle/
  - Verify: `pnpm test` (migration journal/parity) + `drizzle-kit check`
- [ ] **T4 (P1, human: ~1d / CC: ~30min)** — desktop — entry points → panel, legacy preload/IPC/contract cleanup, About copy (S1/S13/S19/S27/E1)
  - Surfaced by: Step 6, S13, S17, S19, S27, E1
  - Files: apps/desktop/electron/, packages/desktop-contract/src/
  - Verify: `pnpm test:electron`
- [ ] **T5 (P2, human: ~4h / CC: ~20min)** — packages + test ports — exports, ported tests (S10/S29)
  - Surfaced by: Step 7, S10, S29
  - Files: packages/live-editor/, apps/desktop/renderer/
  - Verify: `pnpm test:packages && pnpm test:electron`
- [ ] **T6 (P1, human: ~2h / CC: ~10min)** — guard + docs — removal guard (S35/S36), one-time identifier audit, docs/web role (S37)
  - Surfaced by: E2, S35, S36, S37, Step 8
  - Files: scripts/web-live-editor-removal.test.ts, README.md, DESIGN.md, docs/
  - Verify: `pnpm test:tools && pnpm validate`

#### Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION (auto)                  |
  | System Audit         | dead 10.7k-line editor + 4 orphan procs,    |
  |                      | 1 table, legacy preload, stale About copy   |
  | Step 0               | E1/E2 accepted, E3–E6 skipped; spec loop 3x |
  | Section 1  (Arch)    | 0 new issues (S32/S40 decided)              |
  | Section 2  (Errors)  | 8 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 7 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 2 risks flagged (S25 window, S32 window)    |
  | Section 10 (Future)  | Reversibility: 3/5, debt items: 1 (guard)   |
  | Section 11 (Design)  | 0 issues (S2/S3/S39 copy specified)         |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (9 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 7 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed (project rule)             |
  | Scope proposals      | 6 proposed, 2 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex completed (P1 findings, integrated)   |
  | Lake Score           | N/A (no coverage-scored questions)          |
  | Diagrams produced    | 6 (arch, data flow, error, UI, deploy, rollback) |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0 (5 taste items go to the final gate)      |
  | Reality rows         | 7/7 rows (PLAN_REALITY complete) + 1 tier-2 n/a, 1 unverified |
  +====================================================================+
```

<!-- AUTONOMOUS DECISION LOG -->

#### Decision Audit Trail

| #   | Phase | Decision                                         | Classification | Principle                     | Rationale                                                | Rejected                                 |
| --- | ----- | ------------------------------------------------ | -------------- | ----------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| 1   | CEO   | Mode SELECTIVE EXPANSION                         | Mechanical     | /autoplan override            | autoplan fixes the mode                                  | HOLD / REDUCTION                         |
| 2   | CEO   | E1 About copy fix                                | Mechanical     | P2                            | same file as Step 6, stale copy                          | leave stale copy                         |
| 3   | CEO   | E2 removal guard                                 | Mechanical     | P1                            | prevents resurrection, pregate lane                      | grep-only gate                           |
| 4   | CEO   | Skip E3 corelive:// button                       | Mechanical     | P3                            | fails silently without the app                           | add button                               |
| 5   | CEO   | Skip E4 sidebar desktop link                     | Mechanical     | P3                            | superseded by S39                                        | add sidebar item                         |
| 6   | CEO   | Skip E5 replacement poll                         | Mechanical     | P5                            | focus refetch after 60 s suffices                        | new poll                                 |
| 7   | CEO   | Skip E6 delete /settings                         | Mechanical     | P3                            | outside #215                                             | delete route                             |
| 8   | CEO   | Apply spec pass 1 fixes S1–S14                   | Mechanical     | P1                            | clarity/consistency fixes                                | leave gaps                               |
| 9   | CEO   | Apply spec pass 2 fixes S15–S23                  | Mechanical     | P1                            | missing importers/tests                                  | leave gaps                               |
| 10  | CEO   | Apply pass 3 fixes (7 baseline edits, S24–S31)   | Mechanical     | P5                            | one authoritative text                                   | override-by-bullet only                  |
| 11  | CEO   | 0H document approval A                           | Mechanical     | owner "全て選択肢はrecommend" | documents reflect decisions                              | revise / pause                           |
| 12  | CEO   | S32 tie completion to /electron-release          | Mechanical     | P1                            | both voices; owner already queued it                     | web-only completion                      |
| 13  | CEO   | S33 `/write` → `/`                               | Mechanical     | P1                            | keeps its public role, no login wall                     | `/write` → `/home`                       |
| 14  | CEO   | S34 drafts discard accepted, premise corrected   | Mechanical     | P5                            | both voices; owner says nobody uses it                   | one-time draft export                    |
| 15  | CEO   | S35 guard narrowed to paths/imports              | Mechanical     | P5                            | both voices: identifier bans rot                         | permanent identifier bans                |
| 16  | CEO   | S36 build-entry artifact check                   | Mechanical     | P1                            | outside voice; cheap                                     | no artifact check                        |
| 17  | CEO   | S37 state the web's role                         | Mechanical     | P2                            | both voices                                              | leave implicit                           |
| 18  | CEO   | S38 map completion→Home tests                    | Mechanical     | P1                            | outside voice                                            | no mapping                               |
| 19  | CEO   | d1 keep the 0004 migration in this PR            | Taste          | P1 + project rule             | discovered dead schema is fixed now; rollback recipe S40 | split into a follow-up PR (native voice) |
| 20  | CEO   | d2 native QA replaced by tests + artifact check  | Taste          | owner instruction             | no host takeover; VM deleted                             | re-provision VM / host input             |
| 21  | CEO   | d3 add only a Get Mac app link (S39)             | Taste          | P2                            | in blast radius; onboarding redesign out of #215         | full onboarding redesign (outside voice) |
| 22  | CEO   | d4 delete CategoryChangeSync without replacement | Taste          | P5                            | focus refetch covers freshness                           | keep a slim poll                         |
| 23  | CEO   | d5 delete useNativeWindowPreferencesVersion      | Taste          | P5                            | no remaining same-origin peer (S12)                      | keep and move its helpers                |

### Design review (Phase 2)

#### Step 0 — design scope

- 0A initial rating: **6/10**. Exact copy exists for the About detail, Home empty state, delete dialog
  and the `Get Mac app` link (S1–S3, S39), and CEO Section 11 has a state table. Missing: the empty
  state's hierarchy and component for the new link, how `/write` → `/` reads to a signed-out visitor,
  and keyboard/responsive behavior of the new link. A 10 names, per changed surface, the copy, the
  component/variant, the order of elements, every state and the a11y/responsive behavior.
- 0B DESIGN.md exists; all decisions calibrate against it ("Voice & Microcopy", "Empty states":
  invitational, never "missed"; north star: self-affirmation, no guilt).
- 0C reuse: `CompletedTodos.tsx:205-226` empty-state block (`CheckCircle2` icon, `text-muted-foreground`,
  `Button variant="outline"` for Clear filters); `Button` `variant="link"`
  (`packages/live-editor/src/ui/button.tsx:22`, `text-primary underline-offset-4 hover:underline`); the
  sidebar's `Download` icon + `Get Mac app` label (`AppSidebar.tsx:148-160`); `AlertDialog` copy slots in
  `CategoryManageDialog.tsx`.
- 0D focus: all 7 dimensions (auto).
- Step 0.5 mockups: skipped. The designer binary is installed, but the board needs a human pick and
  the owner is away (standing "recommend everything" instruction); the visual delta is two text lines and
  one text link inside an existing empty state, so the shipped component is the visual reference.

#### Design dual voices

CLAUDE SUBAGENT (design — independent review): completed, `INPUT: design 4d1557fb…` (matches the
snapshot). 0 critical, 5 high (Home empty-state hierarchy/states; "it'll appear here" weakened by
removing live refresh; delete dialog states + ambiguous copy; Cmd+N window until release; no writing
path for users with data), 5 medium (redirect cold landing / signed-in `/`; Settings loading/failure
states; terminology; Cmd+N panel behavior table; no visual QA of changed screens), 1 low (draft discard).

CODEX SAYS (design — UX challenge): completed (gpt-6-astra, VERDICT findings, P1). High — the desktop
entry point is buried at the end of the Completed card and its first line is a lack ("No wins logged
yet") instead of DESIGN.md's invitational empty state; High — no display-refresh contract for "it'll
appear here" (only server tests), and a refetch error replaces already-loaded history; Medium — delete
dialog copy ("which Mac", "when", entries vs drafts); Medium — the new link's a11y/theme spec reduced to
an href test.

```
DESIGN OUTSIDE VOICES — LITMUS SCORECARD (surfaces classified OPERATE / app UI):
  Check                                    Claude    Codex     Consensus
  1. Brand unmistakable in first screen?   N/A       N/A       N/A (no new screen)
  2. One strong visual anchor?             yes*      yes*      CONFIRMED (*existing heatmap)
  3. Scannable by headlines only?          no        no        CONFIRMED gap → DS1
  4. Each section has one job?             yes       yes       CONFIRMED
  5. Cards actually necessary?             no new    no new    CONFIRMED (no new cards)
  6. Motion improves hierarchy?            N/A       N/A       N/A (no motion change)
  7. Premium without decorative shadows?   N/A       N/A       N/A
  Hard rejections triggered:               none      none      CONFIRMED none
```

#### Passes 1–7

- **Pass 1 Information Architecture: 5 → 8.** Home's first-run empty state put the desktop entry last
  and led with a lack; fixed by DS1 (order: icon → `Your year starts here` → instruction → `Get Mac
app`). Retired routes land on the user's own dashboard (DS5). Remaining (accepted): users with data get
  no in-page desktop pointer beyond the existing account-menu `Get Mac app` (`AppSidebar.tsx:148`).
  ```
  /home  ─ Heatmap (anchor) ─ summaries ─ Completed card
                                           └ empty (no history): ✓ icon · "Your year starts here"
                                             · "Check a line off in the CoreLive desktop app — it'll appear here"
                                             · [⬇ Get Mac app] (outline button link, new tab)
  sidebar: Home (+ existing items) · account menu: … · Get Mac app
  ```
- **Pass 2 Interaction States: 4 → 9.** Added DS2 (15 s / focus / visibility refresh kept), DS3 (a failed
  background refetch keeps loaded history), DS4 (delete pending/error/retry/success), DS7 (Settings
  control contract). Table:

  | FEATURE                 | LOADING                         | EMPTY | ERROR                                               | SUCCESS                                | PARTIAL                         |
  | ----------------------- | ------------------------------- | ----- | --------------------------------------------------- | -------------------------------------- | ------------------------------- |
  | Home Completed card     | existing "Loading..."           | DS1   | error only without data (DS3)                       | list                                   | filtered-empty unchanged        |
  | Home freshness          | —                               | —     | refetch failure keeps data                          | new rows within ~15 s / on focus (DS2) | —                               |
  | Category delete dialog  | `Deleting…`, disabled           | n/a   | inline `categoryFormError`, destination kept, retry | closes, focus to trigger               | n/a                             |
  | Settings panel controls | `isReady` false → control waits | n/a   | existing `error` message, value rolled back         | confirmed value                        | `available` false hides the row |

- **Pass 3 Journey: 5 → 8.**

  | STEP | USER DOES                               | USER FEELS                                   | PLAN SPECIFIES?         |
  | ---- | --------------------------------------- | -------------------------------------------- | ----------------------- |
  | 1    | signs in on the web with no history     | invited, not behind                          | DS1                     |
  | 2    | installs the Mac app, checks off a line | done something                               | desktop (unchanged)     |
  | 3    | returns to the Home tab                 | affirmed — it shows up                       | DS2 (≤15 s or on focus) |
  | 4    | deletes a category on the web           | safe — entries move, drafts stay on each Mac | DS4                     |
  | 5    | opens an old `/write` bookmark          | oriented — lands on Home                     | DS5                     |

  Remaining (accepted, S32): installed builds route Cmd+N to the browser until /electron-release.

- **Pass 4 AI Slop: 8 → 9.** No new generic patterns; reuses the existing empty-state block, `Button`
  variants and the sidebar's icon/label. Hard rejections: none.
- **Pass 5 Design System: 7 → 9.** DESIGN.md "Empty states" copy (`Your year starts here`), semantic
  tokens through `Button variant="outline"`, no hard-coded color; verified in Default and Warm Cathedral
  (DS8).
- **Pass 6 Responsive & A11y: 4 → 8.** DS1 adds the accessible name and new-tab hint; DS8 checks keyboard
  reach, visible focus ring and 375 px wrapping. Remaining (accepted): the link uses the app's standard
  control height (`Button` default), not a bespoke 44 px target.
- **Pass 7 Unresolved decisions:** 0 open; taste items d4 (revised), d6, d7 go to the gate.

<!-- autoplan-baseline-edits:design {"sourceSha256":"648c1dac17ffcf40c74353ea59e7d7ca0e5eb0cb4164c5e9c952e4812cef7ac5","replacements":[{"oldText":"     destination) and `/live-editor` → `/home`, `/write` → `/` (S33), all `permanent: false`","newText":"     destination), `/live-editor` and `/write` → `/home` (DS5), all `permanent: false`"},{"oldText":"   - Delete `src/components/CategoryChangeSync.tsx` + test. Its browser-only side effect (15 s\n     poll + focus invalidation of category views) is dropped; TanStack focus refetch after\n     `staleTime` covers dashboard freshness.","newText":"   - Delete `src/components/CategoryChangeSync.tsx` + test; its 15 s / focus refresh of Home moves\n     to a `useDashboardFreshness` hook mounted by `Dashboard` (DS2)."},{"oldText":"  `pnpm qa:browser` — `/write` redirects to `/`; `/live-editor` and `/braindump` redirect to\n  `/home` (signed out → `/login?redirect_url=…/home`); landing and login render; no console errors.","newText":"  `pnpm qa:browser` — `/write`, `/live-editor` and `/braindump` redirect to `/home` (signed out\n  → `/login?redirect_url=…/home`) (DS5); landing and login render; no console errors."}]} -->

<!-- autoplan-accepted:design -->

- DS1 (Home empty state; both voices): the unfiltered, no-history empty state of `CompletedTodos` renders, in order, the existing `CheckCircle2` icon, the headline `Your year starts here` (DESIGN.md "Empty states"; replaces "No wins logged yet"), the body `Check a line off in the CoreLive desktop app — it'll appear here` in `text-sm text-muted-foreground`, and `Get Mac app` as `Button variant="outline" asChild` wrapping `<a href={MAC_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">` with the `Download` icon and an sr-only `(opens GitHub in a new tab)`. The filtered-empty state is unchanged. A CompletedTodos test asserts the headline, body, link accessible name, href and target.
- DS2 (Home freshness; both voices; revises CEO taste d4): `CategoryChangeSync` is still deleted (rescue and `category.changes`), but its freshness role stays: a `useDashboardFreshness` hook colocated with `Dashboard.tsx` calls the existing `invalidateCategoryViews(queryClient)` every `DASHBOARD_REFRESH_INTERVAL_MS = 15_000` while `document.visibilityState === 'visible'`, and on window focus and on `visibilitychange` to visible; `Dashboard` mounts it once. Fake-timer tests assert one invalidation after 15 s while visible, none while hidden, and one on focus.
- DS3 (keep history on refetch failure; outside voice): `CompletedTodos` shows the error block only when no data is loaded; when a background refetch fails with data present the list stays. A test renders loaded data with `isError: true` and asserts the list is visible and "An error occurred" is absent.
- DS4 (delete dialog; both voices; replaces S3's draft sentence): the description keeps its existing first sentences ("… will move to …. Your entries will be kept.") and then reads exactly `Writing in the desktop app stays on each Mac. After it syncs, you choose where to keep it.` Delete shows `Deleting…` and is disabled while `category.delete` is pending; the `isSubmitting` ref blocks double submit; on failure the inline `categoryFormError` message shows, the chosen destination stays selected and Delete is enabled for retry; on success the dialog closes and focus returns to its trigger. Tests assert the copy, the pending label and retry with the kept destination.
- DS5 (`/write` target; overrides S33 with evidence): `/write` redirects to `/home` like `/live-editor` and `/braindump`, because the public landing (`apps/web/src/app/page.tsx:15-30`) holds only Login / Sign Up buttons, so a signed-in visitor would land on a login prompt; signed-out visitors reach `/login?redirect_url=…/home`, which also links sign-up. Final table: `/braindump`, `/write`, `/live-editor` → `/home` (all `permanent: false`) plus `/floating-navigator` → `/login-shell`; JSDoc index `[3]` unchanged; `nextConfigRedirects.test.ts` and headless QA assert all three → `/home`.
- DS6 (panel behavior; native voice): Cmd+N, File ▸ New Task and `corelive://create` keep `showLiveEditor()`'s existing semantics: closed or destroyed → created and revealed; hidden → revealed and focused; already visible → stays visible and focused (never toggles hidden); signed out or not prepared → the panel's own prepare/sign-in scene; hidden app icon (accessory) → same reveal. Focus and caret follow the existing reveal path (`revealLiveEditorNow`); S13/S19 tests cover create vs reveal.
- DS7 (Settings control states): S28 keeps the existing `PanelSetting` contract (`isReady`, `isSaving` disables the control, `error` message, `available` hides the row on an old preload; `apps/web/src/hooks/usePanelSetting.ts:38-51`); only the cross-document re-read is removed.
- DS8 (visual QA; native voice + outside a11y finding): headless QA captures, with no real sign-in, the Home empty state (Default light, Default dark, Warm Cathedral light, plus 375 px width), the category delete dialog and the sidebar, using an auth-free harness (the `apps/web/scripts/qa-settings` vite pattern with mocked Clerk/navigation, or the MSW oRPC fake server `apps/web/src/test/orpcServer.ts`), checks that Tab reaches `Get Mac app` with a visible focus ring, and attaches the images to the PR body.
- DS9 (download target): `MAC_DOWNLOAD_URL` stays GitHub `releases/latest` (same as the sidebar); a direct DMG link is skipped because there are two architectures.

<!-- /autoplan-accepted:design -->

#### Design required outputs

NOT in scope (skipped, with reasons): a persistent sidebar "Open CoreLive" item (the account menu
already has `Get Mac app`); renaming the "New Task" menu label (outside #215); a top-of-Home onboarding
banner (taste d6 — kept inside the Completed card); an explicit Refresh button or "Updated just now"
indicator (DS2 keeps automatic freshness); a one-time "LiveEditor moved" notice on redirect; direct DMG
links (DS9).

What already exists: the empty-state block and filtered-empty variant (`CompletedTodos.tsx:205-226`),
`Button` `outline`/`link` variants, the sidebar's `Download` icon + `Get Mac app` and `releases/latest`
URL (`AppSidebar.tsx:65,148-160`), `invalidateCategoryViews` (`category-sync-channel.ts:156`), the
`PanelSetting` contract, the `qa-settings` harness and MSW oRPC server.

TODOS.md updates: none (project rule).

#### Implementation Tasks (Design)

- [ ] **T7 (P1, human: ~2h / CC: ~10min)** — Home — DS1 empty state + DS3 error precedence
  - Files: apps/web/src/app/(main)/home/_components/CompletedTodos.tsx, apps/web/src/components/AppSidebar.tsx
  - Verify: CompletedTodos tests
- [ ] **T8 (P1, human: ~2h / CC: ~10min)** — Home — DS2 `useDashboardFreshness`
  - Files: apps/web/src/app/(main)/home/_components/Dashboard.tsx, apps/web/src/app/(main)/home/_components/useDashboardFreshness.ts
  - Verify: fake-timer hook tests
- [ ] **T9 (P1, human: ~1h / CC: ~5min)** — category — DS4 dialog copy and states
  - Files: apps/web/src/app/(main)/home/_components/CategoryManageDialog.tsx
  - Verify: CategoryManageDialog tests
- [ ] **T10 (P1, human: ~3h / CC: ~20min)** — QA — DS8 auth-free screenshots + keyboard check
  - Files: apps/web/scripts/qa-settings/ (or a sibling harness)
  - Verify: screenshots attached to the PR

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope = copy, empty    |
  |                      | state, dialog, sidebar, redirects            |
  | Step 0               | 6/10, all 7 dimensions, mockups skipped      |
  | Pass 1  (Info Arch)  | 5/10 → 8/10 after fixes                     |
  | Pass 2  (States)     | 4/10 → 9/10 after fixes                     |
  | Pass 3  (Journey)    | 5/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 4/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 9 resolved (DS1–DS9), 0 deferred            |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 0 generated (skipped: no human picker)      |
  | Decisions made       | 9 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 4/10 → 8/10                                 |
  +====================================================================+
```

Unresolved Decisions: none (taste items d4 revised, d6, d7 go to the final gate).

#### Decision Audit Trail (continued)

| #   | Phase  | Decision                                                        | Classification | Principle      | Rationale                                           | Rejected                                 |
| --- | ------ | --------------------------------------------------------------- | -------------- | -------------- | --------------------------------------------------- | ---------------------------------------- |
| 24  | Design | Skip Step 0.5 mockups                                           | Mechanical     | P6             | no human picker; copy-level delta                   | paid mockup board                        |
| 25  | Design | DS1 invitational empty state + ordered link                     | Mechanical     | P5 + DESIGN.md | both voices; DESIGN.md "Empty states"               | keep "No wins logged yet"                |
| 26  | Design | DS2 keep 15 s/focus freshness via a Dashboard hook (revises d4) | Taste          | P1             | both voices: "it'll appear here" needs live refresh | no replacement (CEO d4) / Refresh button |
| 27  | Design | DS3 keep history on refetch error                               | Mechanical     | P1             | outside voice; small, in blast radius               | error replaces list                      |
| 28  | Design | DS4 dialog copy + pending/error/retry                           | Mechanical     | P5             | both voices                                         | S3 sentence                              |
| 29  | Design | DS5 `/write` → `/home` (overrides S33)                          | Taste          | P5             | landing holds only Login/Sign Up (`page.tsx:15-30`) | `/write` → `/`                           |
| 30  | Design | DS6 panel behavior table                                        | Mechanical     | P5             | spec existing semantics                             | new Cmd+N behavior                       |
| 31  | Design | DS7 keep PanelSetting contract                                  | Mechanical     | P3             | existing states suffice                             | new skeletons                            |
| 32  | Design | DS8 auth-free visual QA + keyboard                              | Mechanical     | P1             | PR screenshot rule; no real sign-in                 | login E2E                                |
| 33  | Design | d6 keep guidance inside the Completed card                      | Taste          | P3             | minimal IA change; owner already has data           | top-of-Home banner (outside voice)       |
| 34  | Design | Skip persistent sidebar item, "New Task" rename, Refresh button | Mechanical     | P3             | existing menu link; outside #215                    | add them                                 |

### DX review (Phase 2.5, DX POLISH)

#### Step 0 — DX investigation

Product type (auto): internal monorepo surfaces — **API/Service** (oRPC router), **Library/SDK**
(`@corelive/desktop-contract`, `@corelive/live-editor` export maps), **CLI** (`pnpm` scripts:
`validate`, `qa:*`, `db:*`). The developer is whoever changes this repo.

```
TARGET DEVELOPER PERSONA
========================
Who:       an AI coding agent (Claude Code / Codex) working for the solo owner (AGENTS.md, CLAUDE.md drive it)
Context:   lands on a fresh checkout or a new session, reads README/AGENTS.md/CLAUDE.md, then edits and runs pnpm validate
Tolerance: cannot ask; follows stale docs literally; a misleading line costs a wrong edit plus a red CI round
Expects:   docs that say where the editor lives, guard failures that name the fix, migrations that apply with one command
```

Empathy narrative (first person, the agent): "I'm asked to change how a finished line looks. README
line 8 calls CoreLive a 'LiveEditor archive', line 19 talks about the 'signed-in LiveEditor picker',
line 22 says browsers rescue drafts every 15 seconds, and line 225 says ⌘N opens LiveEditor _in the
browser_. I grep and find `apps/web/src/components/live-editor/LiveEditor.tsx` — 2k lines that look
alive — and `apps/desktop/renderer/NativeEditor.tsx`. I edit the web one, tests pass, the owner sees no
change in the app. After this PR, those files are gone; if docs still say 'browser', I'll look for a
route that redirects me to `/home` and lose ten minutes. If I re-add a file under
`components/live-editor/` from an old branch, the guard should tell me where the code lives now."
(Observed: README lines quoted above [measured: grep]; predicted: the agent's confusion.)

Competitive benchmark: no external peers apply to an internal monorepo; live research skipped
(owner constraint: no owner browser/Aside; the decision does not depend on market data). Reference
tiers from the methodology: Champion < 2 min, Competitive 2–5 min.

| Tool                | Start → result                                                                             | Time + evidence type                                                              | DX choice                      | Source          |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------ | --------------- |
| CoreLive today      | fresh session → knows the editor lives in `apps/desktop/renderer` + `packages/live-editor` | ~10 min [estimated] (two live-looking editors, stale README)                      | docs + grep                    | README.md:8-225 |
| CoreLive after #215 | same                                                                                       | ~2 min [estimated] (one editor; README/AGENTS state it; guard names the location) | single surface + guard message | this plan       |

TTHW clock/target (auto, recommended): Competitive (2–5 min) for "fresh agent session → correct
editor location + green `pnpm validate`" (validate wall time itself excluded).

Magical moment (vehicle: existing vitest assertion messages): when an agent reintroduces a deleted
path or import, the removal guard fails with the offending file, the matched path and the sentence
"The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead."

Mode: DX POLISH (/autoplan override).

#### Developer journey (0F)

```
STAGE           | DEVELOPER DOES                         | FRICTION POINTS                                  | STATUS
----------------|----------------------------------------|--------------------------------------------------|--------
1. Discover     | reads README / AGENTS.md / CLAUDE.md   | README 8/19/22/55/225 describe the web editor     | fixed (Step 8 + DX1)
2. Install      | pnpm install                           | none (no new deps)                                | ok
3. Hello World  | pnpm dev → :4991 ; pnpm qa:browser     | qa:browser opened /write                          | fixed (Step 8: `/`)
4. Real Usage   | edits the editor                       | two editors; local CLAUDE.md mentions /write      | fixed (deletion + DX2)
5. Debug        | guard / Fallow / migration failures    | guard message must name the fix                   | fixed (DX3)
6. Upgrade      | pulls main, local DB                   | needs `pnpm db:migrate` for 0004                  | fixed (DX4)
```

First-time developer report (0G): T+0:00 reads README line 8 ("LiveEditor archive") — fine after
S37 rewrites the role; T+0:30 greps `LiveEditor` → only desktop/package hits remain; T+1:00 runs
`pnpm dev`, opens `/write` from an old note → lands on `/home` (DS5); T+2:00 edits
`packages/live-editor` and runs `pnpm test:packages` → tests now exist (S10) instead of a ZERO-RUN;
T+3:00 succeeds.

#### DX dual voices

Claude SUBAGENT (DX — independent review): completed, `INPUT: dx 140919ed…` (matches). Critical
CAP4: the removal guard has no failure-message contract; old clients / stale tabs calling removed
procedures and stranded guest completions are unstated. High CAP6: silent old-client landing on
`/home`; delete-dialog error copy and lost-response retry; Settings rollback/unavailable explanation;
migration-window recovery; deep link before `WindowManager` is ready. Medium: scattered PR-body
promises, guard allowlist/escape hatch, `qa:browser` `/` readiness, record the audit command, expose
the freshness interval, document the `brainDump` alias, verify the dev seed.

Codex SAYS (DX — developer experience challenge): completed (gpt-6-astra, VERDICT findings, P1). High
— first-run docs are not one path and local CLAUDE.md names non-existent `prisma:*` commands; High —
`pnpm validate` skips the DB suites (`describeIfDb`, `RUN_DB_INTEGRATION_TESTS`) that S38 relies on,
and `schemaParity.test.ts` only checks `0000_init.sql`; High — the migration recipe is not a runnable
command and the rollback recipe would lose applied history; Medium — the auth-free QA harness entry is
undecided and the headless doc example uses the deleted editor textbox; Medium — scattered
supersessions and no guard failure contract.

```
DX DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Getting started < 5 min?          8/10    no     DISAGREE → taste d8 (fix stale commands; no onboarding redesign)
  2. API/CLI naming guessable?         7/10    ok     CONFIRMED (keep names; document the brainDump alias)
  3. Error messages actionable?        no      no     CONFIRMED gap → DX6, DX9, DX12
  4. Docs findable & complete?         no      no     CONFIRMED gap → DX1, DX5
  5. Upgrade path safe?                6/10    no     CONFIRMED gap → DX2, DX3, DX11
  6. Dev environment friction-free?    6/10    no     CONFIRMED gap → DX2, DX4
```

#### Passes 1–8 (DX POLISH)

- **Pass 1 Getting Started 6 → 7.** Stale entry docs (README, local CLAUDE.md `prisma:*`) fixed (DX1); a
  shortest-path onboarding rewrite is outside #215 (taste d8).
- **Pass 2 API/CLI/SDK 7 → 8.** Removed procedures leave the router smaller; names unchanged; the
  `brainDump` legacy alias gets a JSDoc line (DX14); `useDashboardFreshness` takes an interval option (DX13).
- **Pass 3 Error Messages 4 → 8.**

  ```
  ERROR PATH MATRIX (agent-ready-v1)
  Path                         | Class      | what | fix | recovery | code | context | trace | redaction | channel | Cap
  removal guard violation      | validation | DX6  | DX6 | N/A      | DX6  | N/A     | N/A   | pass      | pass    | —
  guard git enumeration fails  | unexpected | DX6  | DX6 | DX6      | DX6  | DX6     | pass  | pass      | pass    | —
  delete dialog lost response  | runtime    | pass | DX9 | DX9      | N/A  | N/A     | N/A   | pass      | pass    | —
  old tab calls removed proc   | runtime    | N/A  | N/A | N/A      | N/A  | N/A     | N/A   | pass      | pass    | — (no remaining client; DX7)
  deep link before ready       | unexpected | DX12 | N/A | DX12     | N/A  | DX12    | pass  | pass      | pass    | —
  ```

  Before fixes the guard rows were CAP4 (no contract) and the dialog/deep-link rows CAP6.

- **Pass 4 Documentation 5 → 8.** DX1 (README, ROADMAP, headless guide, local CLAUDE.md), DX5
  (resolution index + PR-body checklist), DX18 (headless example).
- **Pass 5 Upgrade & Migration 5 → 8.** DX2 (DB evidence actually runs), DX3 (runnable generate +
  history-preserving rollback), DX11 (deploy-window runbook), DX15 (seed).
- **Pass 6 Dev Environment 6 → 8.** DX2 (`pnpm test:db`), DX4 (one auth-free harness), DX17 (guard
  escape hatch).
- **Pass 7 Community 5 → 5.** No community surface: private single-owner repo; nothing in scope.
- **Pass 8 DX Measurement 3 → 6.** The guard and redirect test catch regressions automatically; TTHW is
  an estimate, not instrumented (telemetry is outside #215).

<!-- autoplan-accepted:dx -->

- DX1 (docs; both voices): README lines 8, 19, 22, 55 and 225 are rewritten for the desktop-only editor (225: `⌘N` opens the LiveEditor panel; 22: deletion rescue happens in the desktop app only; 55: `qa:browser` opens `/`); the git-ignored local `CLAUDE.md` drops its two `/write` references and replaces `pnpm prisma:migrate` / `prisma:seed` / `prisma:studio` with the real `pnpm db:migrate` / `seed:dev` / `db:studio` scripts (if a script does not exist, the row is removed, never invented); this local file is never committed.
- DX2 (DB evidence; outside voice): the final verification runs `pnpm db:migrate` on the local Postgres and then `pnpm test:db` (`RUN_DB_INTEGRATION_TESTS=1`), and the run log shows `completionSync.test.ts`, `home.test.ts` and the migration tests executed (not skipped). A new migration retention test, modeled on `apps/web/src/db/categoryHierarchyMigration.test.ts`, applies migrations up to `0003` on a scratch schema, inserts a `Completed` row with `localCompletionId` and `importBatchId` plus an `ImportBatch` row, applies `0004`, and asserts the `Completed` row keeps its `id` and `localCompletionId` while `ImportBatch` and both `importBatchId` columns are gone.
- DX3 (migration recipe + rollback; outside voice): generate with `pnpm db:generate` after editing `schema.ts`; because drizzle-kit exits 0 without writing when a non-TTY rename prompt fires, confirm a new `apps/web/drizzle/0004_*.sql` plus updated snapshot/journal exist and `cat` the SQL before committing (expected statements: drop the two indexes, the two columns, the FK and the `ImportBatch` table only). Rollback (refines S40): keep `0004` in history, restore the dropped definitions in `schema.ts`, run `pnpm db:generate` to create `0005_*` that re-adds the nullable columns, both indexes, the `ImportBatch` table and its FK, apply it through `db-migrate.yml`, and check it first on a scratch database; the PR body carries these steps.
- DX4 (auth-free QA harness; outside voice + DS8): the DS8 screenshots come from extending the existing `apps/web/scripts/qa-settings` Vite harness (mocked Clerk/navigation) with Home (`CompletedTodos` empty state + `AppSidebar`) and category-delete views driven by a seeded `QueryClient`; `docs/headless-development.md` documents the harness URL and a working `pnpm qa:browser` example for it, replacing the deleted editor's `fill e12 … / Meta+Enter` example.
- DX5 (single authoritative text; both voices): the implementation follows a resolution index — redirects = DS5; Home freshness = DS2; delete dialog = DS4; guard = S35 + S30 + DX6 + DX17; native QA = S14; release coupling = S32; migration = S11 + DX2 + DX3 — and the PR body carries one checklist covering S6, S14, S32, S34, S35 (audit command), S36, S38, S40/DX3, DS8 screenshots and DX7.
- DX6 (guard failure contract; both voices): each violation prints a stable code (`WEB_LE_REMOVED_PATH`, `WEB_LE_REMOVED_IMPORT`, `WEB_LE_BUILD_ENTRY`), the repo-relative `file:line`, the matched path or import specifier, and the fix sentence `The web LiveEditor was removed in #215; edit apps/desktop/renderer or packages/live-editor instead, then rerun pnpm test:tools.`; a failed `git ls-files` reports `WEB_LE_GIT_UNAVAILABLE` with the command, exit code and stderr, separately from violations; no file contents or environment values are printed; failures exit non-zero through vitest. A meta-test feeds a fixture file list and asserts the message shape for each code.
- DX7 (removed procedures / stranded guest data; native voice): no client of `completed.importLocal`, `create`, `delete` or `category.changes` remains (S9/P3–P5); an already-open old tab gets oRPC's standard NOT_FOUND, accepted for the single owner. The PR body lists the stranded browser keys — `corelive.local-note.v1` (drafts), `corelive.local-completions.v1` and `corelive.local-merge-pending.v1` (unmerged guest keeps), `corelive.category-draft-rescues.v1` — as discarded.
- DX9 (delete retry after a lost response; native voice): when a retried `category.delete` returns NOT_FOUND (the first attempt already succeeded), the dialog invalidates category views and closes instead of showing an error; a test covers it.
- DX11 (deploy-window runbook; native voice): /land-and-deploy treats a `/home` 5xx right after the merge-SHA `db-migrate.yml` run as the S25 old-code window: wait for (or redeploy) the merge-SHA Vercel deployment; never re-run or revert `0004`.
- DX12 (deep link before ready; native voice): `handleCreateAction` with no `WindowManager` yet does not throw and logs the existing `ensureWindowVisible` no-op; a DeepLinkManager test covers it.
- DX13 (freshness interval option): `useDashboardFreshness(intervalMs = DASHBOARD_REFRESH_INTERVAL_MS)` so tests pass a small interval instead of patching the constant.
- DX14 (alias JSDoc): `electronAPI.brainDump` in `packages/desktop-contract/src/electron-api.ts` gets a JSDoc line naming it the legacy alias of `electronAPI.liveEditor` for pre-rename installed preloads.
- DX15 (dev seed): verification runs `pnpm seed:dev` on the migrated local database and it completes without `ImportBatch`.
- DX16 (audit command): the PR body records the one-time audit command `git grep -nE "importLocal|live-editor-note-(get|set)|brainDumpAPI|brainDumpEnv" -- apps packages scripts` and its empty result.
- DX17 (guard escape hatch): the guard keeps an `ALLOWED_REFERENCES` array (repo-relative path + one-line reason), initially only the guard itself and `nextConfigRedirects.test.ts`; a new entry requires a reason.
- DX18 (`qa:browser` default): the default URL becomes `http://localhost:4991/` and the explicit URL argument keeps working; its test asserts both.

<!-- /autoplan-accepted:dx -->

#### DX required outputs

DX Scorecard:

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Score  | Prior  | Trend  |
|----------------------|--------|--------|--------|
| Getting Started      |  7/10  |  6/10  |  +1 ↑  |
| API/CLI/SDK          |  8/10  |  7/10  |  +1 ↑  |
| Error Messages       |  8/10  |  4/10  |  +4 ↑  |
| Documentation        |  8/10  |  5/10  |  +3 ↑  |
| Upgrade Path         |  8/10  |  5/10  |  +3 ↑  |
| Dev Environment      |  8/10  |  6/10  |  +2 ↑  |
| Community            |  5/10  |  5/10  |   0    |
| DX Measurement       |  6/10  |  3/10  |  +3 ↑  |
+--------------------------------------------------------------------+
| TTHW                 | ~2 min | ~10 min| est. ↑ |
| Competitive Rank     | Competitive (target 2–5 min)                |
| Magical Moment       | designed via guard failure message (DX6)    |
| Product Type         | internal API + SDK packages + CLI scripts   |
| Mode                 | POLISH                                      |
| Overall DX           |  7/10  |  5/10  |  +2 ↑  |
+====================================================================+
| DX PRINCIPLE COVERAGE                                               |
| Zero Friction      | covered (stale docs fixed)                     |
| Learn by Doing     | covered (harness + headless example)           |
| Fight Uncertainty  | covered (DX6 contract)                         |
| Opinionated + Escape Hatches | covered (DX17 allowlist)             |
| Code in Context    | covered (real commands in DX2/DX3)             |
| Magical Moments    | covered (guard message)                        |
| Agents Are Users   | covered (codes, file:line, non-zero exit)      |
+====================================================================+
```

DX Implementation Checklist:

```
[x] Time to hello world < Competitive (2–5 min) — docs point at one editor (DX1)
[x] Installation is one command (unchanged pnpm install)
[x] First run produces meaningful output (qa:browser opens `/`, DX18)
[x] Magical moment delivered via guard message (DX6)
[x] Every new error path meets the agent-ready contract (DX6, DX9, DX12)
[x] API/CLI naming is guessable (unchanged names, DX14)
[x] Every parameter has a sensible default (DX13)
[x] Docs have working examples (DX4 harness example)
[ ] Upgrade path migration guide — PR-body rollback recipe only (DX3); no public guide (pre-release)
[x] TypeScript types included
[x] Works in CI without special configuration (guard uses git ls-files in actions/checkout)
[ ] Community channel — N/A (private single-owner repo)
```

NOT in scope: shortest-path README onboarding rewrite (taste d8); old-client `/home` notice banner
(S32 window, single owner); typed RFC 9457 errors for removed procedures (no client remains); keeping
`importLocal` for one release (owner is signed in; guest keeps already drained); Settings
"unavailable on old preload" hint (pre-existing behavior); DX telemetry.

What already exists: `describeIfDb` + `pnpm test:db`, `categoryHierarchyMigration.test.ts` (migration
on existing data), `pnpm db:generate`/`db:migrate`/`seed:dev`, the `qa-settings` harness,
`scripts/dslint-removal.test.ts` guard pattern, `qa-browser.mjs` argument handling.

#### Implementation Tasks (DX)

- [ ] **T11 (P1, human: ~3h / CC: ~15min)** — migration — DX2 retention test + DX3 recipe/rollback + DX15 seed
  - Files: apps/web/src/db/importBatchDropMigration.test.ts, apps/web/drizzle/
  - Verify: `pnpm db:migrate && pnpm test:db && pnpm seed:dev`
- [ ] **T12 (P1, human: ~2h / CC: ~10min)** — guard — DX6 contract + DX17 allowlist + meta-test
  - Files: scripts/web-live-editor-removal.test.ts
  - Verify: `pnpm test:tools`
- [ ] **T13 (P2, human: ~2h / CC: ~10min)** — docs — DX1, DX4 doc example, DX5 PR checklist, DX14, DX16, DX18
  - Files: README.md, docs/headless-development.md, docs/ROADMAP.md, packages/desktop-contract/src/electron-api.ts, scripts/qa-browser.mjs
  - Verify: `pnpm test:tools` (qa-browser test) + review
- [ ] **T14 (P1, human: ~1h / CC: ~5min)** — category dialog + deep link — DX9, DX12
  - Files: apps/web/src/app/(main)/home/_components/CategoryManageDialog.tsx, apps/desktop/electron/DeepLinkManager.ts
  - Verify: `pnpm test && pnpm test:electron`

#### Decision Audit Trail (DX)

| #   | Phase | Decision                                                                                                                       | Classification | Principle     | Rationale                                                                                           | Rejected                                  |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 35  | DX    | Mode DX POLISH, persona = AI coding agent, target Competitive                                                                  | Mechanical     | override + P6 | AGENTS.md/CLAUDE.md-driven repo                                                                     | EXPANSION                                 |
| 36  | DX    | Skip live competitive research                                                                                                 | Mechanical     | P6            | internal repo; owner forbids owner browser                                                          | Aside/WebSearch                           |
| 37  | DX    | DX1–DX7, DX9, DX11–DX18 accepted; DX8 (old-client `/home` notice) and DX10 (old-preload Settings hint) declined → NOT in scope | Mechanical     | P1/P5 + P3    | both voices; in blast radius, < 1 day; DX8/DX10 serve no user (single owner, pre-existing behavior) | leave gaps                                |
| 38  | DX    | d8 no shortest-path onboarding rewrite                                                                                         | Taste          | P3            | outside #215; stale commands fixed instead                                                          | README onboarding rewrite (outside voice) |
| 39  | DX    | No typed errors / no `importLocal` grace release                                                                               | Mechanical     | P3            | no remaining client; pre-release                                                                    | keep endpoint one release                 |

### Eng review (Phase 3, FULL_REVIEW)

#### Step 0 — Scope Challenge

Target: this plan (`docs/designs/delete-web-live-editor.md`, reviewed snapshot `INPUT: eng 90d17921…`).
Prior learnings and design doc: the CEO plan `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-03-delete-web-live-editor.md`
and the CEO/Design/DX records above; no suspicious reviewer-directed text found in them.

**What already solves each sub-problem.**

- Panel reveal: `WindowManager.showLiveEditor()` (`apps/desktop/electron/WindowManager.ts:871-890`) creates or reveals and never
  toggles; `revealLiveEditorNow` (`:895-907`) runs `show()` + `focus()` + `onEditorShown()`.
- Deep-link surfacing: `DeepLinkManager.handleDeepLink` already calls `ensureWindowVisible()` for every non-OAuth link
  (`apps/desktop/electron/DeepLinkManager.ts:225-227`) before `routeDeepLink`; a link before ready waits in `pendingUrl` and
  `processPendingUrl` (`:201-206`, called from `main.ts:629`).
- Home refresh: `CategoryChangeSync` runs a 15 s / focus / visibility loop with an in-flight guard (`progress.running`,
  `apps/web/src/components/CategoryChangeSync.tsx:34-38,110-112`) and always ends with `invalidateCategoryViews` (`:89`), which
  invalidates the generated keys `orpc.category.list.key()`, `orpc.completed.key()`, `orpc.home.bootstrap.key()`
  (`apps/web/src/lib/category-sync-channel.ts:155-163`).
- DB evidence in CI: `.github/workflows/test.yml:55-70` runs `pnpm db:migrate`, `check-schema-drift.sh` and `pnpm test --run`
  with `RUN_DB_INTEGRATION_TESTS: '1'`.
- Category delete errors: `category.delete` returns `NOT_FOUND` both for a missing source (`category.ts:354-355`) and a missing
  destination (`:395-398`); the mutation toasts every error (`useCategoryMutations.ts:36-44,214`).

**Minimum change.** The plan is a deletion; the only new code is the redirect table, `useDashboardFreshness`, the guard, the
migration and its test. No smaller arrangement keeps the accepted CEO/Design/DX contracts.

**Complexity check.** Changed files ≈ 120 [estimated: 10,684 deleted lines across the four web trees, measured with
`git ls-files … | xargs wc -l`, plus ~40 edited files named in Steps 1–8]; new modules: `useDashboardFreshness`,
`nextConfigRedirects.test.ts`, `web-live-editor-removal.test.ts`, `importBatchDropMigration.test.ts`, migration `0004_*`. The
8-file / 2-class gate trips. Structure selector `plan-eng-review-structure`, auto-decided (`/autoplan` P5/P3): **Original
arrangement** (one PR, Steps 1–8). A smaller arrangement (split the migration) was already settled as taste d1 (CEO). Feature
cuts: none proposed. Scope record: `feature answers: none; structure: A (auto-decided, /autoplan); accepted scope: Steps 1–8 +
CEO/Design/DX blocks + EN1–EN10; pending remedies: none`. Result: **scope accepted as-is**.

**Search check.** No new architectural pattern, infrastructure or concurrency approach (the freshness hook reuses the existing
loop's shape). Search skipped; in-distribution knowledge only for Next.js redirects (query strings pass through by default).

**TODOS cross-reference.** The project forbids TODOS.md ("Resolve discovered TODOs in the current PR", `/CLAUDE.md`); every
discovered item below is resolved inside this PR. No TODOS.md is written.

**Distribution check.** No new artifact. The desktop change ships through the queued `/electron-release` (S32).

#### Eng dual voices

CLAUDE SUBAGENT (eng — independent review): completed, `INPUT: eng 90d17921968a1c520634b7bfcdb32181c814212d18bcbe5c836ad757a3b98672`
(matches the snapshot). 11 findings: supersession chains make Steps 1–8 misleading (Medium); DS2 heavier than before and double
fire (Medium); `Get Mac app` inside Electron (Medium-low); Settings mount-once staleness (Medium); `showLiveEditor` toggle risk
(Medium); deploy window exposes desktop sync (Low-Medium); guard over-built (Low); Fallow test-only survivors (Medium); package
tests in desktop renderer (Low-Medium); DB test may pass hollow (Medium); redirect sub-paths / DX9 workaround / cold-start deep
link (Low).

CODEX SAYS (eng — architecture challenge): completed (gpt-6-astra, `VERDICT: findings`, P1). High — DX9 treats every
`NOT_FOUND` as success, but a missing destination also returns `NOT_FOUND` (`category.ts:354`, `:395`) and the mutation toasts
before the dialog catch (`useCategoryMutations.ts:214`). Medium — the deep link already calls `ensureWindowVisible()` at
`DeepLinkManager.ts:225`, so adding another reveal in `handleCreateAction` runs `show/focus/onEditorShown` twice
(`WindowManager.ts:899`, `createOfflineEditor.ts:48`). Medium — DS2 drops `CategoryChangeSync`'s in-flight guard
(`CategoryChangeSync.tsx:34,89`), so interval/focus/visibility overlap on slow networks and long histories.
Recommendation: re-review after fixing.

```
ENG DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Architecture sound?               flag    flag   CONFIRMED gap → EN2, EN4 (single reveal path, no toggle)
  2. Test coverage sufficient?         no      no     CONFIRMED gap → EN2, EN3, EN4, EN9
  3. Perf risks + budget/bench named?  flag    flag   CONFIRMED gap → EN3 (in-flight guard; interval kept at 15 s)
  4. Security threats covered?         ok      —      single voice (Codex raised none); surface shrinks
  5. Error paths handled?              flag    flag   CONFIRMED gap → EN1 (delete reason codes, supersedes DX9)
  6. Deployment risk manageable?       flag    —      single voice → EN8 (desktop sync named in the window)
CONFIRMED = native + outside agree. No disagreements; no single-voice critical finding.
```

Factual corrections to the native review (evidence, no behavior change): DS2 is not heavier — `CategoryChangeSync` already
invalidated all three views every 15 s and also fetched `category.changes` (`CategoryChangeSync.tsx:46-49,89`); the keys are
generated (`orpc.*.key()`), not hand-written.

#### Reality rows

```
premise | claim | file:line receipt | verdict
P-E1 | showLiveEditor never toggles | WindowManager.ts:871-890 | true
P-E2 | deep link already surfaces non-OAuth links | DeepLinkManager.ts:225-227 | true
P-E3 | cold-start link is queued | DeepLinkManager.ts:201-206, main.ts:629 | true
P-E4 | delete NOT_FOUND is ambiguous | category.ts:354-355,395-398 | true
P-E5 | CategoryChangeSync had an in-flight guard | CategoryChangeSync.tsx:34-38,110-112 | true
P-E6 | Settings popover persists hidden | WindowManager.ts:1299-1303 | true
P-E7 | no Electron window loads /home | WindowManager.ts:1109,1250; SystemTrayManager.ts:506 | true
P-E8 | CI runs DB tests on migrated schema | test.yml:55-70 | true
P-E9 | meta.persist's only production user is todayHeatmapQuery | todayHeatmapQuery.ts:47; createQueryClient.ts:30-34 | true
P-E10 | packages/live-editor has no vitest/DOM setup | packages/live-editor/package.json:59-65 (no config file) | true
P-E11 | old routes are single-segment pages | apps/web/src/app/write/page.tsx, live-editor/page.tsx | true
unverified=0
```

REALITY: premise-table pass 11 eng premises, unverified=0 apps/desktop/electron/WindowManager.ts:871
REALITY: already-done pass origin/main ca76c4bf has no commit since 2026-11-02 touching the deleted trees, DeepLinkManager or next.config.js apps/web/next.config.js:45
REALITY: surface-check pass db:generate/db:migrate/test:db/seed:dev/db:studio/test:tools/qa:browser/qa:settings/qa:offline-editor/electron:build:ts/fallow:dead-code exist package.json:67
REALITY: binding-decisions pass decision-search empty; owner bindings kept (headless QA only, pre-release destructive OK, no TODOS.md, one request = one pipeline) CLAUDE.md:1
REALITY: numbers pass 10,684 deleted lines [measured: git ls-files|wc -l]; 15 s [measured: apps/web/src/components/CategoryChangeSync.tsx:117]; 11 TodayEmber tests [measured: grep]; ~120 files [estimated] apps/web/src/components/CategoryChangeSync.tsx:117
REALITY: deferred-asks pass #215 asks (routes gone, dead code, validate, desktop/Settings/Home unaffected, keep Home imports, keep Settings) all mapped; none deferred apps/web/src/lib/todo-sync-channel.ts:1
REALITY: pr-count pass ship-policy has no pr_count → one PR .gstack/ship-policy.json:1
REALITY: transaction-semantics pass no driver, pool or protocol change; 0004 is DDL applied by the existing Drizzle migrator, no app transaction changes .github/workflows/db-migrate.yml:1

#### Section 1 — Architecture

```
AFTER #215 (web = sign-in, read-only Home, Settings; desktop = the only writer)

 Browser                                   Electron (desktop)
 ┌──────────────────────────────┐          ┌───────────────────────────────────────────┐
 │ next.config redirects         │          │ ShortcutManager Cmd+N ─┐                  │
 │  /braindump,/write,/live-editor│         │ MenuManager New Task ──┼─► showLiveEditor()│
 │      ──307──► /home            │          │ DeepLinkManager        │   (create|reveal, │
 │ /home (main) layout            │          │  handleDeepLink ─► ensureWindowVisible()  │
 │  Dashboard                     │          │   └─ handleCreateAction: no browser hop   │
 │   ├ useDashboardFreshness ─────┼─► invalidateCategoryViews(queryClient)            │
 │   │  (15 s | focus | visible,  │   (category.list, completed.*, home.bootstrap keys)│
 │   │   one in flight)           │          │ Panel corelive-editor://app (offline)     │
 │   └ CompletedTodos (empty →    │          │   └ WorkspaceService ─► completionSync.*  │
 │       Get Mac app link)        │          │ Settings popover /settings (hide on blur) │
 │ CategoryManageDialog ─► category.delete ◄─┤   LiveEditorSettings/usePanelSetting      │
 │   (reason: CATEGORY_NOT_FOUND / │          │   read: mount | focus | confirmed save    │
 │    DESTINATION_NOT_FOUND)       │          └───────────────────────────────────────────┘
 └──────────────────────────────┘
 Server oRPC: category.*, completed.list/heatmap, home.bootstrap, completionSync.syncBootstrap/syncApply
   (removed: completed.importLocal/create/delete, category.changes)
 DB: Completed/Todo without importBatchId; ImportBatch dropped by 0004 (db-migrate.yml on push to main)
```

Coupling shrinks (four procedures, one preload, one IPC pair, two providers removed). No new module boundary is introduced;
`useDashboardFreshness` is a colocated hook, so the design-twice check does not apply (no public surface other code calls).
Red-flag screen of the touched shape: **two ways to do one task** — the deep link would have had two reveal calls (fixed by
EN2); **split ownership** — none; **hand-synced list** — the redirect table and the guard's path list are asserted by tests.

Realistic production failures per changed path: redirect to a protected `/home` signed out → login with `redirect_url`
(covered); deep link on cold start → queued (EN2 test); deploy window → old code names dropped columns (EN8, accepted);
delete retry after a lost response → EN1.

Dispositions: N1 (supersession chains) accepted → baseline edits + EN10; N5/Codex-2 accepted → EN2, EN4; N6 accepted → EN8;
N3 rejected (Electron never loads `/home`, P-E7); N7 rejected (DX6/DX17 were accepted by both DX voices; no new risk).

#### Section 2 — Code quality

- [INFORMATIONAL] (confidence: 9/10) `apps/web/src/lib/query/createQueryClient.ts:30-34` — `query.meta?.persist !== false`
  plus `apps/web/src/types/tanstack-query.d.ts:9-12` survive only for `todayHeatmapQuery.ts:47`, which this plan deletes;
  Fallow cannot see it because `createQueryClient.test.ts:43-53` keeps it alive. → EN7.
- [INFORMATIONAL] (confidence: 8/10) `packages/live-editor/package.json` `./row-identity` — only importer
  `apps/web/src/components/live-editor/LiveEditor.tsx:9`; Step 7 removes it. The export sweep (2026-11-03) found every other
  export with a surviving production importer. → EN6 keeps the audit as a pre-commit step.
- [INFORMATIONAL] (confidence: 7/10) Supersession chains (S4→S33→DS5, E2→S17→S24→S35→DX6/DX17, DX9→EN1) — Steps 2/4/5/6
  carried stale text (Prisma `migrate diff`, deep link through `ensureWindowVisible()` inside the handler, Settings read once).
  → eng baseline edits below + EN10 resolution index.
- Shared-code rubric: no extraction proposed; the freshness hook replaces a deleted component rather than duplicating one.
- Native N9 rejected: `packages/live-editor` has no vitest config, happy-dom or Testing Library (`package.json:59-65`); adding
  DOM test infra to the package is new infrastructure, while `apps/desktop/vitest.config.electron.ts:18` already runs
  `renderer/**` tests against the same package code (S10 stands).

Dispositions: EN6, EN7, EN10 accepted (Mechanical, P2/P5).

#### Section 3 — Test review

Framework: Vitest (web `pnpm test`, DB `pnpm test:db`, desktop `pnpm test:electron`, packages `pnpm test:packages`, tools
`pnpm test:tools`). No new framework.

```
CODE PATHS                                                   USER FLOWS
[+] next.config.js redirects()                               [+] Old bookmark / old desktop build
  └── 4-entry table ─ [GAP→S4/S23] nextConfigRedirects.test     ├── [GAP→DS5] /write → /home (signed out → /login?redirect_url)
[+] Dashboard / useDashboardFreshness                           └── [★★ TESTED] /home protected — proxy.test.ts
  ├── interval 15 s while visible ─ [GAP→DS2]                [+] Home after a desktop completion
  ├── hidden → skip ─ [GAP→DS2]                                 ├── [GAP→EN3] list refreshes within 15 s / on focus
  ├── focus | visibilitychange ─ [GAP→DS2]                      └── [GAP→DS3] failed refetch keeps loaded history
  ├── trigger while in flight → dropped ─ [GAP→EN3]          [+] Category delete (Home/Settings)
  ├── reject → next trigger runs ─ [GAP→EN3]                    ├── [★★ TESTED] confirm + move — CategoryManageDialog.test
  └── real orpc.completed.key() invalidated ─ [GAP→EN3]         ├── [GAP→DS4] Deleting… / double submit / retry kept dest
[+] CompletedTodos                                              ├── [GAP→EN1] lost response → retry → source gone → close, no toast
  ├── empty unfiltered → DS1 copy + Get Mac app ─ [GAP→DS1]     └── [GAP→EN1] retry → destination gone → inline error stays
  ├── filtered empty unchanged ─ [★★ TESTED] existing        [+] Desktop New Task
  └── isError with data → list kept ─ [GAP→DS3]                 ├── [GAP→S13] Cmd+N closed panel → created + shown
[+] category.delete (server)                                    ├── [GAP→EN4] Cmd+N visible panel → stays shown (no toggle)
  ├── source missing → NOT_FOUND CATEGORY_NOT_FOUND ─ [GAP→EN1] ├── [GAP→S13] File ▸ New Task template click → showLiveEditor
  └── destination missing → DESTINATION_NOT_FOUND ─ [GAP→EN1]   └── [GAP→EN2] corelive://create → one reveal, no browser
[+] DeepLinkManager                                           [+] Settings popover
  ├── handleDeepLink(create) → restoreFromTray ×1 ─ [GAP→EN2]   ├── [★★ TESTED] load/save/skew per control (kept cases)
  ├── openWebAppInBrowser never ─ [GAP→EN2]                     └── [GAP→EN5] value changed while hidden → focus → re-read
  └── pendingUrl before ready → once after ready ─ [GAP→EN2]  [+] Desktop sync after 0004
[+] Migration 0004                                              └── [★★★ TESTED→keep] completionSync.test / home.test (test:db)
  ├── retention on existing data ─ [GAP→DX2] importBatchDropMigration.test [→E2E-like: real Postgres]
  ├── drizzle check / schema drift ─ [★★★ TESTED] test.yml check-schema-drift.sh
  └── seed:dev without ImportBatch ─ [GAP→DX15] manual run
[+] Removal guard ─ [GAP→S35/DX6/DX17] web-live-editor-removal.test + meta-test
[+] qa-browser default URL ─ [GAP→DX18] qa-browser test
LLM integration: none (no prompt/LLM files touched) — no eval suites.

COVERAGE (planned): every GAP row above maps to an accepted requirement; existing kept: 5 rows.
QUALITY of kept tests: ★★★:2 ★★:3  |  GAPS: 22 (all with an accepted test; 1 real-DB)
```

REGRESSION RULE: behaviors at risk without coverage today — Home live refresh (moved), Cmd+N/menu/deep-link target (changed
intentionally), Settings re-read (changed), delete retry (changed). Each has an accepted contract (DS2+EN3, S13/S19+EN2/EN4,
S28+EN5, DS4+EN1); intentional differences: the browser hop disappears; the cross-document re-read is replaced by focus.

Tests made obsolete: listed in the test plan artifact `## Tests to Retire`, including `createQueryClient.test.ts`'s
`meta.persist` case (EN7).

Test plan artifact: `~/.gstack/projects/laststance-corelive/ryotamurakami-fix-215-delete-web-live-editor-eng-review-test-plan-20261103-043504.md`.

Dispositions: EN1–EN5, EN9 accepted (Mechanical, P1).

#### Section 4 — Performance

- Home refresh: per visible `/home` tab, one `invalidateCategoryViews` per 15 s at most one in flight [measured interval:
  `CategoryChangeSync.tsx:117`]; this removes the extra `category.changes` request per tick, so request volume drops by one
  call per tick versus today. Rows per refresh: unknown (history pages already loaded by `CompletedTodos`); EN3's in-flight
  guard bounds overlap on slow links.
- No new query, loop, index or cache. Dropping `ImportBatch` and two nullable columns + their indexes reduces write
  amplification on `Completed`/`Todo` inserts (scale unknown; single user).
- No hot path without a budget: the only periodic path keeps the existing 15 s budget.

No issues beyond EN3.

#### Eng required outputs

NOT in scope:

- Splitting the migration into its own PR (taste d1, CEO) — the drop stays with the code that stops writing the columns.
- Shipping the desktop release before the web merge (native N6 option) — the queued `/electron-release` follows this PR the same
  day; one request = one pipeline.
- Server-side idempotent `category.delete` returning success for an already-deleted source — EN1's reason codes give the same
  client outcome without changing the output contract.
- DOM test infrastructure inside `packages/live-editor` (N9).
- Sub-path redirects (`/live-editor/:path*`) — the retired routes never had sub-pages.

What already exists: `showLiveEditor`/`revealLiveEditorNow`, `handleDeepLink`'s `ensureWindowVisible` + `pendingUrl` queue,
`CategoryChangeSync`'s loop shape (moved into `useDashboardFreshness`), `invalidateCategoryViews` with generated keys, CI
`test.yml` DB job and `check-schema-drift.sh`, `categoryHierarchyMigration.test.ts` pattern, `scripts/dslint-removal.test.ts`
guard pattern, the `qa-settings` harness.

Failure modes registry:

| Path                    | Realistic failure                   | Test / handling                  | User sees                                              | Critical gap               |
| ----------------------- | ----------------------------------- | -------------------------------- | ------------------------------------------------------ | -------------------------- |
| Redirects               | entry dropped or permanent          | nextConfigRedirects.test         | 404 / sticky 308                                       | no                         |
| Home freshness          | overlapping refreshes on slow link  | EN3 test + guard                 | nothing (coalesced)                                    | no                         |
| Home freshness          | refetch error with loaded data      | DS3 test                         | list stays                                             | no                         |
| Category delete         | lost response → retry → source gone | EN1 test + reason code           | dialog closes, no toast                                | no                         |
| Category delete         | destination deleted elsewhere       | EN1 test                         | inline error, pick again                               | no                         |
| Deep link create        | double reveal / browser hop         | EN2 test                         | panel once                                             | no                         |
| Deep link cold start    | link before ready                   | EN2 pendingUrl test              | panel once after ready                                 | no                         |
| Cmd+N visible panel     | toggles hidden                      | EN4 test                         | panel stays                                            | no                         |
| Settings hidden popover | stale value                         | EN5 test                         | fresh value on focus                                   | no                         |
| Migration 0004          | Completed rows lost                 | DX2 retention test (CI test:db)  | —                                                      | no                         |
| Deploy window           | old code names dropped columns      | accepted (S25/EN8), runbook DX11 | transient `/home` 5xx, desktop sync error until deploy | no (accepted, pre-release) |
| Guard                   | git unavailable in CI               | DX6 `WEB_LE_GIT_UNAVAILABLE`     | CI fails loudly                                        | no                         |

Critical gaps: 0.

Worktree parallelization:

| Step                            | Modules touched                                  | Depends on   |
| ------------------------------- | ------------------------------------------------ | ------------ |
| Web deletion + redirects + Home | apps/web/src/app, components, hooks, lib         | —            |
| Server + schema + migration     | apps/web/src/server, db, drizzle                 | —            |
| Desktop handlers + preload/IPC  | apps/desktop/electron, packages/desktop-contract | —            |
| Package exports + test ports    | packages/live-editor, apps/desktop/renderer      | Web deletion |
| Guard + scripts + docs          | scripts, docs, README                            | all above    |

Lane A: web deletion → package exports/test ports (shared packages/live-editor). Lane B: server + schema + migration.
Lane C: desktop handlers + preload/IPC. Launch A + B + C; merge; then the guard/docs lane. Conflict flags:
`apps/web/src/hooks/useCategoryMutations.ts` (Lane A dialog work and EN1) and `packages/desktop-contract` (Lane C and the
alias JSDoc DX14) stay in one lane each. Implementation stays sequential in one session (one implementer), so the lanes are
ordering guidance.

#### Implementation Tasks (Eng)

- [ ] **T15 (P1, human: ~2h / CC: ~10min)** — category delete — EN1 reason codes, toast skip, dialog outcomes
  - Surfaced by: Outside voice High — `category.ts:354,395`, `useCategoryMutations.ts:214`
  - Files: apps/web/src/server/procedures/category.ts, apps/web/src/hooks/useCategoryMutations.ts, apps/web/src/app/(main)/home/_components/CategoryManageDialog.tsx (+ tests)
  - Verify: `pnpm --filter @corelive/web exec vitest run src/server/procedures/category src/app/\(main\)/home/_components/CategoryManageDialog`
- [ ] **T16 (P1, human: ~1h / CC: ~5min)** — deep link — EN2 single reveal + cold-start test
  - Surfaced by: Outside voice Medium — `DeepLinkManager.ts:225`
  - Files: apps/desktop/electron/DeepLinkManager.ts, apps/desktop/electron/**tests**/deep-link-manager.test.mjs
  - Verify: `pnpm test:electron`
- [ ] **T17 (P1, human: ~2h / CC: ~10min)** — Home freshness — EN3 in-flight guard + real-key test
  - Surfaced by: Outside voice Medium — `CategoryChangeSync.tsx:34,89`
  - Files: apps/web/src/app/(main)/home/_components/useDashboardFreshness.ts (+ test)
  - Verify: `pnpm test`
- [ ] **T18 (P2, human: ~1h / CC: ~5min)** — Cmd+N/menu — EN4 already-visible case
  - Surfaced by: Section 1 — native N5
  - Files: apps/desktop/electron/ShortcutManager.ts, MenuManager.ts (+ tests)
  - Verify: `pnpm test:electron`
- [ ] **T19 (P1, human: ~1h / CC: ~5min)** — Settings — EN5 re-read on focus
  - Surfaced by: Section 1 — native N4, `WindowManager.ts:1299-1303`
  - Files: apps/web/src/components/electron/LiveEditorSettings.tsx, apps/web/src/hooks/usePanelSetting.ts (+ tests)
  - Verify: `pnpm test`
- [ ] **T20 (P2, human: ~1h / CC: ~5min)** — dead code — EN6 reverse audit + EN7 `meta.persist` removal
  - Surfaced by: Section 2 — `createQueryClient.ts:30-34`, `tanstack-query.d.ts:9-12`
  - Files: apps/web/src/lib/query/createQueryClient.ts (+ test), apps/web/src/types/tanstack-query.d.ts
  - Verify: `pnpm fallow:dead-code && pnpm typecheck`
- [ ] **T21 (P2, human: ~30min / CC: ~5min)** — ship evidence — EN8 PR-body window note + EN9 CI log check
  - Surfaced by: Section 1 — native N6, N10
  - Files: PR body
  - Verify: test.yml log shows `importBatchDropMigration.test.ts`, `completionSync.test.ts`, `home.test.ts` executed

#### Completion summary (Eng)

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 8/8 applicable rows emitted (`PLAN_REALITY` below), 0 unverified premises
- Architecture Review: 3 issues found (EN2, EN4, EN8)
- Code Quality Review: 3 issues found (EN6, EN7, EN10)
- Test Review: diagram produced, 4 gaps identified beyond prior phases (EN1, EN2, EN3, EN5 tests)
- Performance Review: 1 issue found (EN3)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items (project rule: no TODOS.md; every item resolved in this PR)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex (gpt-6-astra), completed — 3 findings (1 High, 2 Medium)
- Parallelization: 4 lanes, 3 parallel / 1 sequential (guidance; one implementer)
- Lake Score: N/A (Y=0: no Completeness-scored user answers; every /autoplan auto-decision took the complete option)

#### Decision Audit Trail (Eng)

| #   | Phase | Decision                                               | Classification | Principle | Rationale                                                   | Rejected                                |
| --- | ----- | ------------------------------------------------------ | -------------- | --------- | ----------------------------------------------------------- | --------------------------------------- |
| 40  | Eng   | Structure: original arrangement, one PR                | Mechanical     | P5/P3     | split already settled (d1)                                  | split migration                         |
| 41  | Eng   | EN1 delete reason codes replace DX9                    | Mechanical     | P1/P5     | both voices; NOT_FOUND ambiguous at `category.ts:354,395`   | treat all NOT_FOUND as success          |
| 42  | Eng   | EN2 deep link: no second reveal in the handler         | Mechanical     | P5        | `handleDeepLink` already reveals (`:225`)                   | `handleCreateAction` → `showLiveEditor` |
| 43  | Eng   | EN3 keep in-flight guard, 15 s interval                | Mechanical     | P1/P3     | parity with `CategoryChangeSync`; lighter than today        | 30–60 s poll / focus-only               |
| 44  | Eng   | EN4 already-visible Cmd+N test                         | Mechanical     | P1        | `showLiveEditor` never toggles (`:871`)                     | none                                    |
| 45  | Eng   | EN5 Settings re-read on focus                          | Mechanical     | P2        | popover hides on blur and persists (`:1299`)                | mount-only read                         |
| 46  | Eng   | EN6 reverse-reference audit; EN7 remove `meta.persist` | Mechanical     | P2/P5     | Fallow blind to test-only survivors                         | keep generic infra                      |
| 47  | Eng   | EN8 name desktop sync in deploy window                 | Mechanical     | P6        | pre-release; no compat shims                                | desktop-release-first ordering          |
| 48  | Eng   | EN9 CI log check for DB tests                          | Mechanical     | P1        | CI already runs test:db (`test.yml:55-70`)                  | new CI job                              |
| 49  | Eng   | Keep the removal guard (DX6/DX17)                      | Mechanical     | P6        | accepted by both DX voices; no new risk                     | one-time audit only (native N7)         |
| 50  | Eng   | Keep component test ports in desktop renderer          | Mechanical     | P3        | package has no DOM test setup                               | add happy-dom to the package (N9)       |
| 51  | Eng   | No `Get Mac app` Electron guard                        | Mechanical     | P5        | Electron never loads `/home` (`WindowManager.ts:1109,1250`) | hide CTA when `electronEnv` (N3)        |

<!-- autoplan-baseline-edits:eng {"sourceSha256":"eb08a164915a56e2dc5fc91f9736d97dfc3314464608f552dfb9b80b114bd6da","replacements":[{"oldText":"     and their tests. Re-check each with grep before deleting.","newText":"     and their tests, plus the `meta.persist` machinery (EN7). Re-check each with grep before\n     deleting, then run the EN6 reverse-reference audit."},{"oldText":"`0004_*` with the non-interactive recipe (`migrate diff --script` style, cat the SQL\n     first);","newText":"`0004_*` with `pnpm db:generate` (DX3: confirm the new SQL, snapshot and journal exist; cat the SQL\n     first);"},{"oldText":"simplify `LiveEditorSettings.tsx` and `usePanelSetting.ts` to read once\n     on mount and after their own confirmed saves;","newText":"simplify `LiveEditorSettings.tsx` and `usePanelSetting.ts` to read on\n     mount, on window focus (EN5) and after their own confirmed saves;"},{"oldText":"   - Cmd+N, File ▸ New Task and `corelive://create` call `windowManager.showLiveEditor()`\n     (the desktop panel; the deep link through `ensureWindowVisible()`) instead of opening the\n     browser;","newText":"   - Cmd+N and File ▸ New Task call `windowManager.showLiveEditor()` (the desktop panel)\n     instead of opening the browser; `corelive://create` only stops opening the browser, because\n     `handleDeepLink` already surfaces the panel once through `ensureWindowVisible()` (EN2);"}]} -->

<!-- autoplan-accepted:eng -->

- EN1 (delete retry; outside voice High, supersedes DX9): `category.delete` keeps `NOT_FOUND` but adds `data: { reason: 'CATEGORY_NOT_FOUND' }` when the source category is missing (`apps/web/src/server/procedures/category.ts:354-355`) and `data: { reason: 'DESTINATION_NOT_FOUND' }` when the destination is missing (`:395-398`). The delete mutation's `onError` (`apps/web/src/hooks/useCategoryMutations.ts:214`) shows no toast for `CATEGORY_NOT_FOUND`; the dialog treats only `CATEGORY_NOT_FOUND` as already deleted (invalidate category views, close, return focus to the trigger). `DESTINATION_NOT_FOUND` keeps the dialog open with the inline message, resets the destination to the default after the list refresh, and keeps Delete enabled. Tests: a server procedure test asserts each reason; dialog tests cover the lost-response retry (closes, toast not called) and the vanished destination (inline error, toast called once, dialog open).
- EN2 (deep link single reveal; outside voice Medium, refines S13/S19/DX12): `DeepLinkManager.handleCreateAction` stops calling `openInBrowser` and adds no reveal of its own; the existing `ensureWindowVisible()` in `handleDeepLink` (`apps/desktop/electron/DeepLinkManager.ts:225-227`) is the single reveal. Tests drive `handleDeepLink('corelive://create')` and assert `restoreFromTray` once and `openWebAppInBrowser` never; a `corelive://create` stored as `pendingUrl` before ready is surfaced exactly once by `processPendingUrl`; with no `WindowManager` it does not throw.
- EN3 (Home freshness in-flight guard; outside voice Medium + native, refines DS2/DX13): `useDashboardFreshness(intervalMs = DASHBOARD_REFRESH_INTERVAL_MS)` keeps one refresh in flight: a trigger (interval, window `focus`, `visibilitychange` to visible) while an `invalidateCategoryViews` promise is pending is dropped; a hidden document skips; after the promise settles (resolve or reject) the next trigger runs. Tests: interval + focus + visibilitychange during one pending refresh → one invalidation; a rejected refresh → the next trigger invalidates again; with a real `QueryClient`, a query under `orpc.completed.key()` becomes invalidated after a tick.
- EN4 (already-visible panel; native): ShortcutManager and MenuManager tests also cover an already-visible panel: `showLiveEditor` called once, `toggleLiveEditor` and `hide` never called.
- EN5 (Settings re-read; native, refines S28/DS7): because the Settings popover hides on blur and persists (`apps/desktop/electron/WindowManager.ts:1299-1303`), `LiveEditorSettings` and `usePanelSetting` re-read each value from the preload getter on window `focus` (skipped while that control's save is in flight), in addition to mount and confirmed saves. Test: the getter's value changes, a `focus` event fires, and the control shows the new value.
- EN6 (reverse-reference audit; native): before commit, list every non-test module under `apps/web/src` and `packages/live-editor/src` whose remaining importers are only tests or deleted files, and every `packages/live-editor` export whose only importers are deleted; delete each with its tests, or name the surviving production importer in the PR body. Known now: `./row-identity` (only importer `LiveEditor.tsx:9`) and EN7.
- EN7 (`meta.persist` machinery): remove the `query.meta?.persist !== false` dehydrate clause in `apps/web/src/lib/query/createQueryClient.ts:30-34`, the `queryMeta` augmentation in `apps/web/src/types/tanstack-query.d.ts`, and the `createQueryClient.test.ts` persist case, because their only production user `todayHeatmapQuery.ts:47` is deleted; `pnpm typecheck` and `pnpm fallow:dead-code` pass.
- EN8 (deploy window; native, refines S25/DX11): the PR body states that between the merge-SHA `db-migrate.yml` run and the merge-SHA Vercel deployment, old code may fail on `/home` and on desktop sync (`completionSync.syncBootstrap` / `syncApply`) because Drizzle names the dropped columns; /land-and-deploy treats the window as closed only when the merge-SHA Vercel deployment is READY.
- EN9 (DB tests executed; native): /ship confirms in the `test.yml` CI log that `importBatchDropMigration.test.ts`, `completionSync.test.ts` and `home.test.ts` executed (not skipped); CI runs them with `RUN_DB_INTEGRATION_TESTS: '1'` after `pnpm db:migrate` and `check-schema-drift.sh` (`.github/workflows/test.yml:55-70`).
- EN10 (resolution index addendum, extends DX5): deep link = EN2; delete retry = EN1 (DX9 superseded); Home freshness = DS2 + EN3; Settings controls = S28 + EN5; dead-code sweep = S9 + EN6 + EN7; deploy window = S25 + DX11 + EN8.

<!-- /autoplan-accepted:eng -->
