# TODOS

## QA

### Playwright web E2E for the signed-out LiveEditor loop (when a second person actually uses it)

**What:** One Clerk-free Playwright spec: land on the public LiveEditor page in a fresh profile → editor focused → write → Cmd+Enter → the line clears and the Kept toast offers Undo → reload keeps the device-local record (`localStorage`).

**Why:** The recorded QA gate (eng review D11, 2026-09-02) only catches regressions at the next QA run. Once a named second person uses the page, their entry point deserves a per-PR guard.

**Context:** Playwright was removed on purpose in PR #167 (`2558b90f`): slow, flaky, non-deterministic fixture IDs. The signed-out loop needs neither Clerk nor the database, so it does not bring that flakiness back. Trigger = the "one person who gets the no-login link" in `docs/ROADMAP.md` has actually used it (same as the design's ceiling upgrade trigger). Start from the `playwright-cli` steps used for the recorded QA.

**Effort:** M
**Priority:** P3
**Depends on:** PR-1 merged; a named second user.
