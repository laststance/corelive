# CoreLive Agent Instructions

## Resolve discovered TODOs in the current PR

Every TODO discovered while working on a task must be resolved in the current
pull request, even when it falls outside the original scope. Do not defer the
work by recording it in `TODOS.md`, memory, an issue, or any other tracking
artifact. Do not recreate `TODOS.md`. A review comment describing a discovered
TODO as out of scope does not justify postponing its resolution.

## QA without interrupting the owner

Do not operate the host Mac's mouse, keyboard, foreground application, or browser
focus during development or QA. Do not authenticate through the owner's browser,
import the owner's cookies, launch host `corelive://` URLs, or trigger host
"Open CoreLive" prompts. Do not add or run a login E2E suite.

Use the isolated Headless Playwright CLI for web and renderer QA. The owner
authorized working without a VM on 2026-10-07: VM startup and further native GUI
QA are not required for this migration. Verify native changes with focused
contract/integration tests and packaging; identify limits in the QA report.
If native GUI QA is separately requested, use an isolated test Mac or guest and
explicitly target its automation channel. Hammerspoon, accessory activation policy, hidden
windows, and separate browser profiles do not isolate the host desktop.

Record dynamic interactions, extract video frames, and inspect them. Complete
automated validation and the authorized Headless QA before merging or deploying. Call this
QA, not a smoke test. See `docs/headless-development.md` for the QA environment.

## Development conventions

- Keep code, comments, and repository documentation in English.
- Use pnpm and the repository's pinned Node.js and package-manager versions.
- Use Context7 for third-party library APIs and Serena symbol tools for codebase
  understanding and refactoring.
- Search for existing utilities, hooks, components, and types before adding them.
- Use `unknown` rather than `any`. Document reusable APIs with their purpose,
  trigger/callers, meaningful failure conditions, and an example.
- Refer to workspace symbols with `{@link Symbol}` in JSDoc. Add concise comments
  for branches, loops, and non-obvious behavior when their purpose needs context.
- Read `DESIGN.md` before making visual or UI decisions.
- Read the relevant installed `node_modules/next/dist/docs/` (hoisted workspace install) guide before changing
  Next.js code; do not assume older Next.js conventions apply.

## Tests and delivery

- Prefer descriptive, maintainable test procedures, hard-coded expectations, and
  Arrange/Act/Assert sections. Name tests by the observable behavior that fails.
- Use `toBeVisible()` when asserting that UI is displayed.
- Run `pnpm validate` plus focused Electron/integration tests for changed paths.
  Do not bypass hooks, tolerate ESLint warnings, or merge before QA passes.
- Attach changed-screen screenshots to PRs, or videos for dynamic behavior, using
  GitHub CLI's built-in `--attach`. Verify uploaded references in the PR body.
- Use GitHub account `ryota-murakami` for `laststance/corelive`. All Vercel commands
  must target the `laststance` team with `--scope laststance`.
- Use the installed gstack workflows for specifications, engineering reviews,
  investigation, QA, code review, PR preparation, deployment, and canary checks.

## Private local configuration

Keep `CLAUDE.md`, `.env` files, authentication data, and credentials out of commits
and shared QA artifacts. `AGENTS.md` must remain a regular, tracked file rather
than a symlink to local-only instructions.
