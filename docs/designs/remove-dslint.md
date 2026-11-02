<!-- /autoplan restore point: "/Users/ryotamurakami/laststance/corelive/.gstack/tmp/autoplan/fix-218-remove-dslint-autoplan-restore-20261102-223835.md" -->

# Remove eslint-plugin-dslint (#218)

## Implementation plan

Branch: fix/218-remove-dslint · Base: main (565a7a84, after #219 / v0.28.0)

## Problem

The owner asked to eradicate the in-repo `eslint-plugin-dslint` package (2026-11-02:
「あとdslintとかいうわけわかんねえパッケージ根絶しろ。」). It is a custom ESLint plugin
(`dslint/token-only`, `dslint/ban-stylelist`) plus a `dslint` CLI (`css-parser`, `sync`).
It adds a build step before every lint, a separate lint/test/typecheck target, CI steps,
pregate lanes and inline disable comments, and it already needed parser fixes for the
#213 theme CSS. Nobody runs `dslint sync`; the token source of truth is
`apps/web/tailwind.config.ts` + the theme registry, which stay.

## Scope

Remove the package and every reference. No behaviour change in the web or desktop apps.

## Steps

1. Delete `packages/eslint-plugin-dslint/` (src, tests, configs, README, CLAUDE.md, dist):
   `git rm -r` the tracked files, then `rm -rf packages/eslint-plugin-dslint` for the
   untracked leftovers (`dist/`, `node_modules/` and the gitignored `CLAUDE.md`), so no
   stale workspace importer remains on disk.
2. `eslint.config.js`: drop the `dslint` import (line 9), the whole "Design System Lint"
   config block with its header comment (lines 90-189: `plugins`, `dslint/token-only` options and that block's own
   `ignores` list, which scopes only the dslint rule) and the
   `packages/eslint-plugin-dslint/**` entry in the global `ignores` (line 29). Every other
   block unchanged, so ESLint still lints the same files with the same rules minus
   `dslint/token-only`.
3. Root `package.json`: remove dslint from `validate` (the pre-lint build step), `lint`,
   `lint:fix`, `test:packages`, `typecheck` and `clean` (no manifest lists the package as a
   dependency, so there is no devDependency link to drop). `pnpm install` updates `pnpm-lock.yaml` (details below).
   `test:packages` only loses its dslint entry and keeps its order; the resulting script is
   exactly `pnpm --filter @corelive/desktop-contract test && pnpm --filter @corelive/live-editor test`
   (CEO C2 reorder dropped by the CEO voices). Verification reports each package's result,
   including `@corelive/live-editor`'s zero test files.
   Also delete the dead `"tsup@8.5.1>esbuild": "0.28.2"` override (no `tsup@8.5.1` in
   `pnpm-lock.yaml`; the only tsup, 9.0.0, leaves with the package) (CEO C4). `pnpm install`
   drops the `packages/eslint-plugin-dslint` importer and its `css-tree`/`tsup` entries.
   `tsup` leaves the dependency tree with the package (its only declarer is
   `packages/eslint-plugin-dslint/package.json:41`), so also drop `'tsup'` from
   `scripts/typescript-toolchain.test.ts:23` (`test.each`; `pnpm test:tools` in `validate`
   would fail `require.resolve('tsup')`), from the `compilerApiConsumers` set in
   `.pnpmfile.cjs:15`, and in `docs/headless-development.md:19-20` replace "(including
   typescript-eslint and tsup)" with "(including typescript-eslint)" and reflow. No other
   test asserts the `compilerApiConsumers` contents [measured: `git grep compilerApiConsumers`].
   `pnpm install` then updates `pnpmfileChecksum` in the lockfile; review `git diff pnpm-lock.yaml`
   (only the `packages/eslint-plugin-dslint` importer, the overrides/checksum lines and
   entries reachable only from it, such as `css-tree`, `@types/css-tree`, `tsup`, may leave)
   and commit the regenerated `pnpm-lock.yaml` (CI installs with `--frozen-lockfile`). Abort
   rule: if the diff removes or bumps any entry still reachable from another importer,
   restore the lockfile (`git checkout -- pnpm-lock.yaml`) and re-run `pnpm install` with the
   `packageManager`-pinned pnpm before committing. Then run `pnpm install --frozen-lockfile`
   once more, and confirm in the diff that every `esbuild@` version is unchanged.
4. CI: delete the whole "Build workspace packages" and "Lint workspace packages" steps in
   `.github/workflows/lint.yml` (lines 21-22, 25-26; the "Lint" step stays) and the whole
   "Build workspace ESLint plugin" step in `.github/workflows/fallow.yml` (lines 39-40).
5. Tooling config: the `packages/eslint-plugin-dslint/` lane in `scripts/pregate-tests.mjs`
   (lines 20-24), the three `packages/eslint-plugin-dslint/...` keys in
   `.gstack/pregate.json` (lines 81-102; drop the comma the last remaining key would leave dangling and check with
   `node -e "JSON.parse(require('fs').readFileSync('.gstack/pregate.json','utf8'))"`; stage
   it with `git add -f .gstack/pregate.json` or `git add -u`, because a plain `git add` of a
   path under the ignored `.gstack/` is refused; `git status` must show it staged before the
   commit, and `git show --stat HEAD -- .gstack/pregate.json` after it), and the
   `packages/eslint-plugin-dslint/**` path
   instruction in `.coderabbit.yaml` (lines 123-126).
6. Source: delete all 12 `dslint/token-only` directives in 7 files (`eslint-disable-next-line`
   lines in the 5 skill-tree files; trailing `eslint-disable-line` comments in
   `CategoryManageDialog.tsx` ×2 and `packages/live-editor/src/SharedCategoryPicker.tsx` ×1,
   keeping the `className` values unchanged; each `// eslint-disable-... -- reason` comment
   goes, and two reasons that record layout intent survive as plain comments without the
   directive: `packages/live-editor/src/SharedCategoryPicker.tsx:163` becomes
   `// Keep category actions visible while the category list scrolls.` and
   `CategoryManageDialog.tsx:758` becomes
   `// Keep the header visible and scroll the body within the viewport.`; the other reasons
   only justified the exemption and go whole), reword four comments without naming dslint and drop one parser-only test
   (only comment bodies change; the JSX `{/* ... */}` wrapper in `ThemeSelector.tsx` stays):
   - `apps/web/src/components/ThemeSelector.tsx:126-128`: "...shows its keyboard focus via
     peer-focus-visible (a standard Tailwind variant, no arbitrary selector)."
   - `apps/web/src/components/electron/KeybindingCaptureInput.tsx:211-212`: "Recording
     emphasis uses the scale ring token (ring-2), not an arbitrary ring-[3px]."
   - `apps/web/scripts/generate-theme-css.ts:12-13`: "...emitted as SEPARATE blocks: bare
     `:root` and" (the parenthetical reason goes; the comment only describes the output).
   - `apps/web/scripts/generate-theme-css.ts:412-413`: delete the sentence "Always separate
     blocks, never selector lists: ..."; the rest of the JSDoc already describes the blocks.
   - In `apps/web/src/lib/themes/generate-theme-css.test.ts`, delete the test at line 316
     (`never joins selectors with a comma so the dslint parser tags each block correctly`):
     the comma ban existed only for the dslint parser. Retitle the `describe` at line 291 to
     `generateThemesCss — Default family block layout`. `emits exactly the six Default
blocks first, in a fixed order` and the colour-scheme test still pin the shipped layout.
     The generated CSS itself is unchanged; `pnpm theme:check` proves no diff.
7. Docs: in `README.md` delete the clause ", and the [design-system lint package](...) for
   its rules" (line 14) and the `packages/eslint-plugin-dslint` table row (line 72). In
   `docs/design/roadmap-2026-09-no-login-live-editor.md:309` (its only mention) replace
   "(`dslint/token-only` forbids arbitrary values)" with "(arbitrary values were then
   linted by `dslint/token-only`, removed in #218 on 2026-11-02)". DESIGN.md has no
   mention. In `README.md` "Code quality", add one sentence after the `pnpm validate`
   paragraph: "`pnpm lint` does not check Tailwind class names: arbitrary values and
   non-token classes are not linted. Follow `DESIGN.md` for tokens; `pnpm theme:check` only
   compares the generated theme CSS." Also fix the README Node.js version drift found in
   review: lines 38 and 50 say `24.20.0`, while `mise.toml:2` and
   `.github/actions/prepare/action.yml:13` pin `26.12.1`; both README lines become
   `26.12.1`. CHANGELOG history stays untouched. `docs/designs/` (this plan and
   `default-theme-shadcn.md`) are dated review records and stay as written.
8. On the committed tree, `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'`
   returns exactly one hit, and it is in
   `docs/design/roadmap-2026-09-no-login-live-editor.md` (the dated note, line 309 today;
   the check matches the file, not the line number).
   `git grep` searches tracked dot-paths too (`.github/`, `.coderabbit.yaml`, the tracked
   `.gstack/pregate.json` under the ignored `.gstack/`), which plain `rg` skips.

## Tests / verification

- All steps land in one commit; `pnpm lint` runs only after Steps 1 and 2 are both applied,
  with `packages/eslint-plugin-dslint/` already gone from disk (proves nothing needs a
  prebuilt plugin).
- `pnpm validate` green (lint, typecheck, build, theme:check, tests, Fallow dead-code).
- Coverage given up on purpose: arbitrary-value / non-token class lint
  (`dslint/token-only`; `ban-stylelist` was never enabled in `eslint.config.js`). Remaining
  guards: `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, the theme contract tests,
  `apps/web/src/lib/themes/base-css-bare-root.test.ts` and `pnpm theme:check`. The PR
  body states this loss and where a replacement would go if drift appears (a new block in
  `eslint.config.js`, e.g. eslint-plugin-tailwindcss `no-arbitrary-value`), and tells other
  checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling. It
  calls out the README Node.js version fix (DX-2) as a separate discovered-TODO item.
- ESLint on the whole repo reports 0 problems without dslint. A disable directive that
  names an unregistered rule is reported as "Definition for rule 'dslint/token-only' was
  not found", so all 12 directives go.
- `git diff -U0` of the 7 directive files plus `ThemeSelector.tsx` and
  `KeybindingCaptureInput.tsx` shows only comment/directive changes; every `className`
  string is byte-identical to the base (check: after stripping `//…` and `{/* … */}` comment
  text, each changed line equals its base line).
- CI workflows parse (`lint.yml`, `fallow.yml`) and pass on the PR.
- No product behaviour changes, so no browser QA surface beyond confirming the web build
  and the theme CSS check still pass.

## Not in scope

- A replacement design-token lint (owner asked for removal, not a substitute).
- A separate Electron release for this PR: the only `packages/live-editor` edit is a
  comment, so the desktop bundle behaves the same (the same-day release owed by #213
  ships it anyway).

## Accepted CEO obligations

<!-- autoplan-accepted:ceo -->

- Remove `packages/eslint-plugin-dslint/` and every reference listed in Steps 1-8; `pnpm install` regenerates `pnpm-lock.yaml`.
- `eslint.config.js` keeps every non-dslint block unchanged; no `dslint` import, plugin, rule or ignore entry remains.
- Every `dslint/token-only` directive (12 directives in 7 files, `eslint-disable-next-line` and `eslint-disable-line`) is deleted with `className` values unchanged, so ESLint reports no unknown-rule definition errors.
- `apps/web/tailwind.config.ts` stays (prettier-plugin-tailwindcss and shadcn read it).
- `test:packages` keeps its order minus dslint; verification reports `@corelive/live-editor`'s zero test files explicitly.
- CEO C1 (replacement lint), C2 (test:packages reorder, reopened and dropped by the CEO voices) and C3 (permanent no-dslint test) are not in scope.
- The generator's parser-only comma-ban test goes; the generated CSS is unchanged (`pnpm theme:check`).
- The PR body names the lost arbitrary-value lint and where a replacement would go.
- CEO C4: the dead `"tsup@8.5.1>esbuild"` override leaves root `package.json`.
- `tsup` leaves `scripts/typescript-toolchain.test.ts`, `.pnpmfile.cjs` and `docs/headless-development.md` with the package, so `pnpm test:tools` stays green.
- `.gstack/pregate.json` still parses as JSON after its dslint keys go, and the edit is staged with `git add -f`/`git add -u`.
- `git diff pnpm-lock.yaml` removes only dslint-reachable entries, and `git status` shows `.gstack/pregate.json` staged.
- The package directory is gone from disk too (untracked `dist/`, `node_modules/`, `CLAUDE.md`), and the regenerated `pnpm-lock.yaml` is committed.
- Verification: `pnpm validate` green; `pnpm lint` green with `--max-warnings 0`; `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'` on the committed tree returns exactly the dated `docs/design/roadmap-2026-09-no-login-live-editor.md:309` note; CI `lint.yml` and `fallow.yml` pass on the PR.

<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:design -->

- `SharedCategoryPicker.tsx:163` and `CategoryManageDialog.tsx:758` keep their layout intent as plain comments (`// Keep category actions visible while the category list scrolls.`, `// Keep the header visible and scroll the body within the viewport.`); every other dslint reason goes with its directive.
- `git diff -U0` of the 7 directive files, `ThemeSelector.tsx` and `KeybindingCaptureInput.tsx` shows comment-only changes; every `className` string is byte-identical to the base.

<!-- /autoplan-accepted:design -->

<!-- autoplan-accepted:dx -->

- README "Code quality" says `pnpm lint` does not check Tailwind class names (arbitrary values and non-token classes are not linted), points to `DESIGN.md`, and says `pnpm theme:check` only compares generated theme CSS.
- README lines 38 and 50 state Node.js `26.12.1`, matching `mise.toml:2` and `.github/actions/prepare/action.yml:13`.
- The lockfile diff review aborts and regenerates with the pinned pnpm if any entry reachable from another importer changes.
- The `git grep` allow-list matches one hit in `docs/design/roadmap-2026-09-no-login-live-editor.md`, not a line number.
- The PR body tells other checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling.

<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->

- After `pnpm install`, `pnpm install --frozen-lockfile` passes and every `esbuild@` version in `pnpm-lock.yaml` is unchanged.
- `git show --stat HEAD -- .gstack/pregate.json` shows the pregate edit in the commit.
- All steps land in one commit; `pnpm lint` passes with `packages/eslint-plugin-dslint/` gone from disk.
- The className check strips comment text and confirms each changed line equals its base line.
- The PR body calls out the README Node.js version fix as a separate discovered-TODO item.

<!-- /autoplan-accepted:eng -->

## Review record

### CEO Step 0 (autoplan Phase 1, SELECTIVE EXPANSION)

Mode: SELECTIVE EXPANSION; approved decisions: none. Autoplan override (Phase 1 always
runs SELECTIVE EXPANSION); the change is a removal/refactor, so the cherry-pick ceremony is
small and the HOLD checks dominate.

**System audit (main 565a7a84).** No in-flight branch touches dslint; stash `wip flex`
(on main, unrelated). The package is self-contained: `packages/eslint-plugin-dslint/`
(rules `token-only`, `ban-stylelist`; CLI `bin/dslint.js` with `css-parser`/`sync`; deps
`css-tree`, `tsup` only used there). Nothing depends on it by package name; it is wired by
path: `eslint.config.js:9` imports `./packages/eslint-plugin-dslint/dist/index.js`, so every
lint run needs a prior `pnpm --filter eslint-plugin-dslint build` (`package.json` `validate`,
`.github/workflows/lint.yml:22`, `.github/workflows/fallow.yml:40`). References outside the
package: 20 files [measured: `git grep -c -i dslint`, excluding the package, CHANGELOG and
lockfile] — eslint.config.js (5), package.json (6), .gstack/pregate.json (10),
scripts/pregate-tests.mjs (2), .coderabbit.yaml (2), lint.yml (2), fallow.yml (1),
README.md (2), docs/design/roadmap-2026-09-no-login-live-editor.md (1),
docs/designs/default-theme-shadcn.md (21, historical record), and inline directives or
comments in 10 source files (skill-tree ×5 files, CategoryManageDialog ×2
`eslint-disable-line`, SharedCategoryPicker ×1 `eslint-disable-line`, ThemeSelector,
KeybindingCaptureInput, generate-theme-css.ts ×2, generate-theme-css.test.ts).
`apps/web/tailwind.config.ts` survives: `.prettierrc:6` (prettier-plugin-tailwindcss) and
`apps/web/components.json:7` (shadcn) still read it.

**Taste calibration.** Good references: `.github/workflows/typecheck.yml`-style single-purpose
CI steps; `eslint.config.js`'s repo-relative `basePath` mapping (keeps semantics when a block
is removed). Avoid: path-imported build artefacts in lint config (`dist/index.js` import that
forces a build before lint) and rule-specific disable comments that outlive their rule.

**Landscape (Layer 1/2/3).** Layer 1: the maintained way to enforce Tailwind tokens is
eslint-plugin-tailwindcss (`no-arbitrary-value`, `no-custom-classname`; v4 rewrite for
Tailwind v4). Layer 2: small single-purpose plugins (palette guards) exist. Layer 3: this
repo already guards the one token class that matters to the brand (theme colours) with
`no-hardcoded-amber.test.ts` and the theme contract tests; a general arbitrary-value lint
mostly produced `eslint-disable` noise in skill-tree. Search: WebSearch (Aside not used per
owner constraint).

Prior learnings applied: corelive-packages-lane-zero-run (9/10) — `test:packages` will end
on `@corelive/live-editor` (no tests) after dslint leaves the chain; corelive-markdown-lint
MD028 (7/10) for the roadmap note.

#### 0A. Premise challenge

| Premise | Claim                                                | Receipt                                                                                                                                                                                                                    | Verdict                                                    |
| ------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| P1      | The owner wants the package and every reference gone | issue #218 body (owner quote 2026-11-02)                                                                                                                                                                                   | valid                                                      |
| P2      | Nothing else depends on the package                  | only `packages/eslint-plugin-dslint/package.json:2` names it; wiring is by path (`eslint.config.js:9`)                                                                                                                     | valid                                                      |
| P3      | `tailwind.config.ts` stays the token source          | `.prettierrc:6`, `apps/web/components.json:7`                                                                                                                                                                              | valid (it stays for prettier/shadcn, not as a lint source) |
| P4      | Lint stays green without the rule                    | `pnpm lint` runs `--max-warnings 0` today with the rule at `warn` (`eslint.config.js:94-96`), so no live dslint warnings exist; removing a rule cannot add warnings, but its disable directives become unknown-rule errors | valid with the directive caveat (Step 6)                   |
| P5      | No product behaviour changes                         | the plugin only runs at lint time; no runtime import (`git grep dslint apps/*/src` = comments/directives only)                                                                                                             | valid                                                      |
| P6      | Nobody runs `dslint sync`                            | no script/CI step invokes `bin/dslint.js` (`git grep "dslint sync"` = docs only)                                                                                                                                           | valid                                                      |

unverified=0. Real problem: a bespoke lint package that costs a build step, CI steps,
pregate lanes and parser maintenance (it needed a fix for the #213 media block) for a guard
the owner does not want. Do-nothing cost: every lint/validate/CI run keeps building it and
every theme CSS change risks another parser fix.

#### 0B. Existing code leverage

| Sub-problem                | Existing code                                                                  | Reuse                            |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| Remove a workspace package | `pnpm-workspace.yaml` globs `packages/*`; `pnpm install` rewrites the lockfile | reuse (no manual lockfile edits) |
| Keep ESLint semantics      | remaining blocks in `eslint.config.js` with repo-relative `basePath`           | reuse unchanged                  |
| Keep brand-colour guard    | `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, theme contract tests     | reuse; no replacement lint       |
| Lane definitions           | `scripts/pregate-tests.mjs`, `.gstack/pregate.json`                            | edit in place                    |

REALITY: premise-table pass 6 premises, unverified=0 docs/designs/remove-dslint.md:84
REALITY: already-done pass no commit on origin/main since 2026-11-02 touches the package or mentions dslint eslint.config.js:9
REALITY: surface-check pass named commands exist (`pnpm validate`, `pnpm lint`, `pnpm test:packages`, `pnpm typecheck`, `pnpm clean`) package.json:94
REALITY: binding-decisions pass `gstack-decision-search --scope branch --recent 50` returned none; no `## Binding decisions` section docs/designs/remove-dslint.md:1
REALITY: numbers pass 20 referencing files [measured: git grep -l -i dslint, package/CHANGELOG/lockfile excluded] README.md:72; 12 directives in 7 files [measured: git grep -c dslint/token-only] apps/web/src/app/(main)/skill-tree/SkillTreeView.tsx:195
REALITY: deferred-asks pass issue #218 acceptance items are all in Steps 1-8; nothing left out .github/workflows/lint.yml:22
REALITY: pr-count pass one PR (`pr_count.default_pr_count: 1`, gstack default; base has no .gstack/ship-policy.json) 565a7a84c271ef87e6508d670642d87b2dcdb0d6

#### 0C. Dream state

```
  CURRENT STATE                      THIS PLAN                         12-MONTH IDEAL
  lint = build bespoke plugin   ---> lint = stock ESLint config   ---> lint/typecheck/test are stock
  + its own lint/test/typecheck      no build step, no package         tools only; design-system
  + CI/pregate wiring + parser       no dslint directives              rules live in DESIGN.md +
  fixes on theme CSS changes                                           targeted tests (theme guards)
```

The plan moves straight toward the ideal; nothing in it blocks adopting a maintained
plugin later if a real need appears.

#### 0D. Alternatives

No new approach decision was needed: A (remove completely) is the owner's instruction;
B (keep the package but drop it from lint) and C (swap to eslint-plugin-tailwindcss) are
recorded as cherry-pick C1 below rather than approach changes.

#### 0F/0G. HOLD checks and cherry-picks

HOLD checks: (1) complexity — 26 deleted package files [measured: git ls-files, Eng Step 0] + ~20 edited files [estimated], but
zero new classes/services; deletion dominates, so fewer moving parts is the goal itself.
(2) minimum change — Steps 1-8; nothing deferrable without leaving a dangling reference.
(3) invariants kept — same ESLint coverage minus one rule, validate green, CI green.

10x ambition: a lint pipeline with no bespoke code at all. Delight scan (outcomes, not
extra work): lint without a pre-build step; one fewer CI build; skill-tree files lose
directive noise; README package table shrinks to real packages; theme generator comments
explain the real constraint instead of a tool. Platform potential: none needed.

| #   | Proposal                                                                                                          | Effort | Decision                                       | Reasoning                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Replace dslint with eslint-plugin-tailwindcss `no-arbitrary-value`                                                | M      | SKIPPED                                        | Owner asked for removal ("根絶"), not a substitute; brand colours stay guarded by theme tests (P6 bias to the stated direction; P4 avoids a new dependency) |
| C2  | Reorder `test:packages` so its last sub-run has tests (fix the ZERO-RUN lane artefact)                            | S      | ACCEPTED → SKIPPED (reopened by CEO voices V2) | In blast radius (the same script line is edited), <1h, removes a known /ship false STOP (P2)                                                                |
| C3  | A permanent test asserting no `dslint` string reappears                                                           | S      | SKIPPED                                        | YAGNI; `rg` acceptance check at ship time suffices (P5)                                                                                                     |
| C4  | Delete the dead `tsup@8.5.1>esbuild` pnpm override (found in Spec Review 1 prep: no `tsup@8.5.1` in the lockfile) | S      | ACCEPTED                                       | Same root `package.json` is edited; dead config the removal leaves behind (P2; project rule: resolve discovered TODOs in this PR)                           |

#### 0I. Temporal interrogation

```
  HOUR 1 (foundations):   which files reference the package (inventory above); lockfile via pnpm install
  HOUR 2-3 (core logic):  ESLint errors on disable directives for unknown rules -> remove all 12 directives (7 files)
  HOUR 4-5 (integration): lint.yml/fallow.yml build steps; pregate lanes; validate no longer builds
  HOUR 6+ (polish/tests): generator comment rewording + test rename; README; roadmap dated note (MD028)
```

Human team ~half a day; CC + gstack ~30 min implementation. No feasibility blockers.

#### 0H. CEO plan and Spec Review Loop

CEO summary: `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-02-remove-dslint.md`.
Spec Review Loop: 3 launches (cap). Scores 7 → 6 → 8; all NOT PASS on non-blocking points
after round 2's real blocker (`tsup` removal breaks `scripts/typescript-toolchain.test.ts`).
Found 27, reviewer-confirmed fixed 19, round-3 remaining 8; issues verified: 8 of 8 (applied
edits, not a verdict); spec not re-verified after round 3. Round 1's "four roadmap
mentions" sub-claim was not reproduced (one mention, line 309). Metrics appended to
`analytics/spec-review.jsonl`. New cherry-pick C4 (dead `tsup@8.5.1>esbuild` override)
ACCEPTED in round-1 prep.

Document approval: auto-decided **A) Approve these documents and continue to 0I** (owner's
standing instruction 2026-11-02 「全て選択肢はrecommend」; both documents reflect the exact
decisions). 0I above stands unchanged by the spec fixes (no new feasibility blockers).

CEO 0H baseline edits: spec-prep reconciliation (Electron not-in-scope line names the
comment-only `packages/live-editor` edit) and Spec Review 1 fixes (exact line ranges,
literal `test:packages`, comment wording, rg allow-list, accepted coverage loss, C4) and
Spec Review 2 fixes (tsup toolchain test/pnpmfile/doc, line-90 header, JSON validity,
whole trailing comments, `git grep` allow-list, C2 cause, acceptance heading) and Spec
Review 3 fixes (on-disk leftovers, `git add -f`, JSON parse command, lockfile commit,
headless doc text, comment count, JSX wrapper, compilerApiConsumers check) and CEO voice
decisions (V1 parser-only test and comment reason drop, V2 C2 drop, N1 PR-body note, N3
lockfile diff review, N4 staged check).

<!-- autoplan-baseline-edits:ceo {"sourceSha256":"c0ec3ff5a6c40cf5a2257cd12d743fcfd8653d8b7c13be7a484170decae4453c","replacements":[{"oldText":"2. `eslint.config.js`: drop the `dslint` import, the \"Design System Lint\" config block and\n   the two `packages/eslint-plugin-dslint/**` ignore entries. Every other block unchanged,\n   so ESLint still lints the same files with the same rules minus `dslint/token-only`.","newText":"2. `eslint.config.js`: drop the `dslint` import (line 9), the whole \"Design System Lint\"\n   config block with its header comment (lines 90-189: `plugins`, `dslint/token-only` options and that block's own\n   `ignores` list, which scopes only the dslint rule) and the\n   `packages/eslint-plugin-dslint/**` entry in the global `ignores` (line 29). Every other\n   block unchanged, so ESLint still lints the same files with the same rules minus\n   `dslint/token-only`."},{"oldText":"   In `test:packages`, run `@corelive/live-editor` (no test files, `--passWithNoTests`)\n   before `@corelive/desktop-contract`, so the script's last vitest summary reports real\n   tests (CEO C2).","newText":"   `test:packages` only loses its dslint entry and keeps its order; the resulting script is\n   exactly `pnpm --filter @corelive/desktop-contract test && pnpm --filter @corelive/live-editor test`\n   (CEO C2 reorder dropped by the CEO voices). Verification reports each package's result,\n   including `@corelive/live-editor`'s zero test files.\n   Also delete the dead `\"tsup@8.5.1>esbuild\": \"0.28.2\"` override (no `tsup@8.5.1` in\n   `pnpm-lock.yaml`; the only tsup, 9.0.0, leaves with the package) (CEO C4). `pnpm install`\n   drops the `packages/eslint-plugin-dslint` importer and its `css-tree`/`tsup` entries.\n   `tsup` leaves the dependency tree with the package (its only declarer is\n   `packages/eslint-plugin-dslint/package.json:41`), so also drop `'tsup'` from\n   `scripts/typescript-toolchain.test.ts:23` (`test.each`; `pnpm test:tools` in `validate`\n   would fail `require.resolve('tsup')`), from the `compilerApiConsumers` set in\n   `.pnpmfile.cjs:15`, and in `docs/headless-development.md:19-20` replace \"(including\n   typescript-eslint and tsup)\" with \"(including typescript-eslint)\" and reflow. No other\n   test asserts the `compilerApiConsumers` contents [measured: `git grep compilerApiConsumers`].\n   `pnpm install` then updates `pnpmfileChecksum` in the lockfile; review `git diff pnpm-lock.yaml`\n   (only the `packages/eslint-plugin-dslint` importer, the overrides/checksum lines and\n   entries reachable only from it, such as `css-tree`, `@types/css-tree`, `tsup`, may leave)\n   and commit the regenerated `pnpm-lock.yaml` (CI installs with `--frozen-lockfile`)."},{"oldText":"4. CI: `.github/workflows/lint.yml` (build + lint steps) and `.github/workflows/fallow.yml`\n   (build step) no longer touch the package.","newText":"4. CI: delete the whole \"Build workspace packages\" and \"Lint workspace packages\" steps in\n   `.github/workflows/lint.yml` (lines 21-22, 25-26; the \"Lint\" step stays) and the whole\n   \"Build workspace ESLint plugin\" step in `.github/workflows/fallow.yml` (lines 39-40)."},{"oldText":"5. Tooling config: `scripts/pregate-tests.mjs` lane, `.gstack/pregate.json` test map entries,\n   `.coderabbit.yaml` path instructions.","newText":"5. Tooling config: the `packages/eslint-plugin-dslint/` lane in `scripts/pregate-tests.mjs`\n   (lines 20-24), the three `packages/eslint-plugin-dslint/...` keys in\n   `.gstack/pregate.json` (lines 81-102; drop the comma the last remaining key would leave dangling and check with\n   `node -e \"JSON.parse(require('fs').readFileSync('.gstack/pregate.json','utf8'))\"`; stage\n   it with `git add -f .gstack/pregate.json` or `git add -u`, because a plain `git add` of a\n   path under the ignored `.gstack/` is refused; `git status` must show it staged before the\n   commit), and the `packages/eslint-plugin-dslint/**` path\n   instruction in `.coderabbit.yaml` (lines 123-126)."},{"oldText":"   keeping the `className` values unchanged) and reword \"dslint-clean\"/\"dslint-exempt\"/\"dslint parser\"\n   comments (`ThemeSelector.tsx`, `KeybindingCaptureInput.tsx`,\n   `apps/web/scripts/generate-theme-css.ts`) to state the remaining real constraint without\n   naming dslint. The generator's \"never join selectors with a comma\" rule loses its only\n   consumer: keep the separate-block output (it is the tested, shipped format) but reword\n   the reason, and rename the test in `generate-theme-css.test.ts` accordingly.","newText":"   keeping the `className` values unchanged; each trailing `// eslint-disable-line ... --\n   reason` comment goes whole, reason included, because the reason only justified the\n   exemption), reword four comments without naming dslint and drop one parser-only test\n   (only comment bodies change; the JSX `{/* ... */}` wrapper in `ThemeSelector.tsx` stays):\n   - `apps/web/src/components/ThemeSelector.tsx:126-128`: \"...shows its keyboard focus via\n     peer-focus-visible (a standard Tailwind variant, no arbitrary selector).\"\n   - `apps/web/src/components/electron/KeybindingCaptureInput.tsx:211-212`: \"Recording\n     emphasis uses the scale ring token (ring-2), not an arbitrary ring-[3px].\"\n   - `apps/web/scripts/generate-theme-css.ts:12-13`: \"...emitted as SEPARATE blocks: bare\n     `:root` and\" (the parenthetical reason goes; the comment only describes the output).\n   - `apps/web/scripts/generate-theme-css.ts:412-413`: delete the sentence \"Always separate\n     blocks, never selector lists: ...\"; the rest of the JSDoc already describes the blocks.\n   - In `apps/web/src/lib/themes/generate-theme-css.test.ts`, delete the test at line 316\n     (`never joins selectors with a comma so the dslint parser tags each block correctly`):\n     the comma ban existed only for the dslint parser. Retitle the `describe` at line 291 to\n     `generateThemesCss — Default family block layout`. `emits exactly the six Default\n     blocks first, in a fixed order` and the colour-scheme test still pin the shipped layout.\n   The generated CSS itself is unchanged; `pnpm theme:check` proves no diff."},{"oldText":"7. Docs: README package table and links; `docs/design/roadmap-2026-09-no-login-live-editor.md`\n   keeps a dated \"dslint removed in #218\" note instead of the live rule; DESIGN.md if it\n   mentions dslint. CHANGELOG history stays untouched.","newText":"7. Docs: in `README.md` delete the clause \", and the [design-system lint package](...) for\n   its rules\" (line 14) and the `packages/eslint-plugin-dslint` table row (line 72). In\n   `docs/design/roadmap-2026-09-no-login-live-editor.md:309` (its only mention) replace\n   \"(`dslint/token-only` forbids arbitrary values)\" with \"(arbitrary values were then\n   linted by `dslint/token-only`, removed in #218 on 2026-11-02)\". DESIGN.md has no\n   mention. CHANGELOG history stays untouched. `docs/designs/` (this plan and\n   `default-theme-shadcn.md`) are dated review records and stay as written."},{"oldText":"8. `rg -n dslint --glob '!CHANGELOG.md' --glob '!docs/designs/**'` returns nothing\n   outside dated historical notes.","newText":"8. On the committed tree, `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'`\n   returns exactly one hit, the dated\n   `docs/design/roadmap-2026-09-no-login-live-editor.md:309` note (the allow-list).\n   `git grep` searches tracked dot-paths too (`.github/`, `.coderabbit.yaml`, the tracked\n   `.gstack/pregate.json` under the ignored `.gstack/`), which plain `rg` skips."},{"oldText":"- `pnpm validate` green (lint, typecheck, build, theme:check, tests, Fallow dead-code).","newText":"- `pnpm validate` green (lint, typecheck, build, theme:check, tests, Fallow dead-code).\n- Coverage given up on purpose: arbitrary-value / non-token class lint\n  (`dslint/token-only`; `ban-stylelist` was never enabled in `eslint.config.js`). Remaining\n  guards: `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, the theme contract tests,\n  `apps/web/src/lib/themes/base-css-bare-root.test.ts` and `pnpm theme:check`. The PR\n  body states this loss and where a replacement would go if drift appears (a new block in\n  `eslint.config.js`, e.g. eslint-plugin-tailwindcss `no-arbitrary-value`)."},{"oldText":"- Electron release (no desktop change).","newText":"- A separate Electron release for this PR: the only `packages/live-editor` edit is a\n  comment, so the desktop bundle behaves the same (the same-day release owed by #213\n  ships it anyway).\n\n## Accepted CEO obligations"},{"oldText":"   `lint:fix`, `test:packages`, `typecheck` and `clean`; drop the package's devDependency\n   link if any.","newText":"   `lint:fix`, `test:packages`, `typecheck` and `clean` (no manifest lists the package as a\n   dependency, so there is no devDependency link to drop)."},{"oldText":"1. Delete `packages/eslint-plugin-dslint/` (src, tests, configs, README, CLAUDE.md, dist).","newText":"1. Delete `packages/eslint-plugin-dslint/` (src, tests, configs, README, CLAUDE.md, dist):\n   `git rm -r` the tracked files, then `rm -rf packages/eslint-plugin-dslint` for the\n   untracked leftovers (`dist/`, `node_modules/` and the gitignored `CLAUDE.md`), so no\n   stale workspace importer remains on disk."},{"oldText":"`pnpm install` to update `pnpm-lock.yaml` (workspace removal only).","newText":"`pnpm install` updates `pnpm-lock.yaml` (details below)."}]} -->

<!-- autoplan-accepted:ceo -->

- Remove `packages/eslint-plugin-dslint/` and every reference listed in Steps 1-8; `pnpm install` regenerates `pnpm-lock.yaml`.
- `eslint.config.js` keeps every non-dslint block unchanged; no `dslint` import, plugin, rule or ignore entry remains.
- Every `dslint/token-only` directive (12 directives in 7 files, `eslint-disable-next-line` and `eslint-disable-line`) is deleted with `className` values unchanged, so ESLint reports no unknown-rule definition errors.
- `apps/web/tailwind.config.ts` stays (prettier-plugin-tailwindcss and shadcn read it).
- `test:packages` keeps its order minus dslint; verification reports `@corelive/live-editor`'s zero test files explicitly.
- CEO C1 (replacement lint), C2 (test:packages reorder, reopened and dropped by the CEO voices) and C3 (permanent no-dslint test) are not in scope.
- The generator's parser-only comma-ban test goes; the generated CSS is unchanged (`pnpm theme:check`).
- The PR body names the lost arbitrary-value lint and where a replacement would go.
- CEO C4: the dead `"tsup@8.5.1>esbuild"` override leaves root `package.json`.
- `tsup` leaves `scripts/typescript-toolchain.test.ts`, `.pnpmfile.cjs` and `docs/headless-development.md` with the package, so `pnpm test:tools` stays green.
- `.gstack/pregate.json` still parses as JSON after its dslint keys go, and the edit is staged with `git add -f`/`git add -u`.
- `git diff pnpm-lock.yaml` removes only dslint-reachable entries, and `git status` shows `.gstack/pregate.json` staged.
- The package directory is gone from disk too (untracked `dist/`, `node_modules/`, `CLAUDE.md`), and the regenerated `pnpm-lock.yaml` is committed.
- Verification: `pnpm validate` green; `pnpm lint` green with `--max-warnings 0`; `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'` on the committed tree returns exactly the dated `docs/design/roadmap-2026-09-no-login-live-editor.md:309` note; CI `lint.yml` and `fallow.yml` pass on the PR.

<!-- /autoplan-accepted:ceo -->

### CEO dual voices (autoplan Phase 1, Step 0.5)

Input: `ceo 03711dc9bcfb4c20b9cfdf5e08b66b91c5599db739250a326fe3963cc99b2014` (both voices).

**Native CEO voice (in-host, completed).** Verdict: sound; no Critical/High. Findings:
N1 Medium (the PR does not say what stops being enforced; `no-hardcoded-amber.test.ts` covers
amber only), N2 Medium (reworded comments must describe a convention, not an enforced check),
N3 Medium (review the lockfile diff for dslint-only removals), N4 Medium (confirm with
`git status` that the ignored-path `.gstack/pregate.json` edit is staged), N5 Low (C2 is
cosmetic; `&&` keeps exit codes), N6 Low (comment-only `packages/live-editor` edit; no bundle
hash gate).

**Codex CEO voice (outside, `OUTSIDE_STATUS: completed provider=codex host=claude`,
model gpt-6-astra, VERDICT clean, FINDINGS P2).** V1 Medium: the plan re-justifies a
dslint-parser-only constraint ("never join selectors with a comma") with invented reasons
and keeps its test, turning a retired tool's quirk into permanent policy; fix: keep the
generated CSS, delete the parser-only test, let comments describe the output. V2 Low: C2
improves which log line prints last, not verification; drop it. Recommendation: "Revise and
proceed because the plan preserves a retired parser constraint as permanent policy and adds
a test-order obligation that improves presentation without improving verification."

```
CEO DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Premises valid?                   yes     yes    CONFIRMED
  2. Right problem to solve?           yes     yes    CONFIRMED
  3. Scope calibration correct?        mostly  no     DISAGREE -> taste (V1, V2)
  4. Alternatives sufficiently explored? note  n/a    DISAGREE -> taste (no-restricted-syntax note, N1)
  5. Competitive/market risks covered? n/a     n/a    CONFIRMED (internal tooling)
  6. 6-month trajectory sound?         yes*    no*    DISAGREE -> taste (*guard loss vs. retired-constraint debt)
CONFIRMED = completed subagent + outside; primary cannot replace outside.
```

Single-voice criticals: none.

#### Decision ledger (CEO)

| ID and owner                   | Contract and evidence                                                                                            | Current                                    | Proposed                  | Status               | Exact approval and scope                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| CEO-C1 (0G)                    | replacement lint                                                                                                 | skipped                                    | eslint-plugin-tailwindcss | declined             | auto-decide P4/P6, owner said 「根絶しろ」                                    |
| CEO-C2 (0G, reopened by V2/N5) | `test:packages` order (`package.json:94`)                                                                        | order unchanged minus dslint               | reorder                   | declined (reopened)  | TASTE auto-decide: Codex V2 + native N5 both cosmetic; P3/P5                  |
| CEO-C3 (0G)                    | permanent no-dslint test                                                                                         | skipped                                    | add test                  | declined             | auto-decide P5 YAGNI                                                          |
| CEO-C4 (0H prep)               | dead `tsup@8.5.1>esbuild` override (`package.json:8`, no `tsup@8.5.1` in lockfile)                               | delete                                     | —                         | approved             | auto-decide P2; project rule: resolve discovered TODOs in the PR              |
| CEO-SR (0H)                    | spec fixes: tsup toolchain test, `git grep` allow-list, line ranges, JSON check, `git add -f`, on-disk leftovers | applied                                    | —                         | approved             | 0H document approval A (owner standing instruction 「全て選択肢はrecommend」) |
| CEO-V1 (Codex)                 | parser-only comma-ban test `generate-theme-css.test.ts:316`, comments `generate-theme-css.ts:12-13,412-413`      | delete test, comments describe output only | keep + reword             | approved             | TASTE auto-decide: P5 explicit; Codex valid, native silent                    |
| CEO-N1 (native)                | PR body names the lost arbitrary-value lint and the replacement location                                         | add                                        | —                         | approved             | auto-decide P1                                                                |
| CEO-N2 (native)                | comment wording describes convention                                                                             | already met by Step 6 wording              | —                         | approved (no change) | cite Step 6 text                                                              |
| CEO-N3 (native)                | `git diff pnpm-lock.yaml` review                                                                                 | add to Step 3                              | —                         | approved             | auto-decide P1                                                                |
| CEO-N4 (native)                | `git status` shows `.gstack/pregate.json` staged                                                                 | add to Step 5                              | —                         | approved             | auto-decide P1                                                                |
| CEO-N6 (native)                | no desktop artifact hash gate                                                                                    | no change                                  | —                         | approved (no change) | Step "Not in scope" Electron line                                             |

Approval readiness: PASS (CEO-C1..C4, CEO-SR, CEO-V1, CEO-N1..N4, CEO-N6; each cites its
auto-decision above; no row pending).

#### Current scope (before Section 1)

Mode SELECTIVE EXPANSION (autoplan override). Accepted: Steps 1-8 as amended, C4, the spec
fixes, V1, N1, N3, N4. Declined: C1, C2 (reopened), C3. Deferred: none. Pending: none.

#### Section 1: Architecture Review

```
  BEFORE                                        AFTER
  eslint.config.js --imports--> packages/       eslint.config.js (stock plugins only)
     eslint-plugin-dslint/dist/index.js
        ^ built by: validate, lint.yml,         validate / lint.yml / fallow.yml:
          fallow.yml (tsup)                       no pre-lint build
  package.json lint/test/typecheck --> dslint   package.json scripts: apps + 2 packages
  pregate lanes / .coderabbit path rule         lanes: apps/desktop, apps/web, contract, live-editor
  tsup (only via dslint) <-- toolchain test     toolchain test: @typescript-eslint/parser, ts-api-utils
```

No new components, data flows, state machines or endpoints; coupling only shrinks (the
lint config loses its build-artefact import). Scaling/SPOF: one fewer build before lint.
Rollback: `git revert` of the squash commit restores the package (minutes); nothing at
runtime depends on it. Value test: no new status/meta artefact is added. Cherry-pick fit:
C4 removes dead config, no coupling. Finding: the toolchain test couples to `tsup` (fixed in
Step 3, spec round 2). Issues found: 1 (resolved by CEO-SR).

#### Section 2: Error & Rescue Map

```
  CAPABILITY / CODEPATH            | WHAT CAN GO WRONG                          | FAILURE CLASS
  ---------------------------------|--------------------------------------------|----------------------
  eslint run (pnpm lint, lint.yml) | leftover directive names unknown rule       | ESLint "Definition for rule ... not found"
  pnpm install (CI frozen)         | lockfile not regenerated/committed          | ERR_PNPM_OUTDATED_LOCKFILE
  pnpm test:tools                  | test.each still resolves 'tsup'             | Cannot find module 'tsup'
  pregate.json edit                | dangling comma / not staged                 | JSON SyntaxError / stale lanes
  fallow dead-code                 | removed file still referenced               | fallow issue (exit 1)

  FAILURE CLASS                | RESCUED? | RESCUE ACTION                        | USER SEES
  -----------------------------|----------|--------------------------------------|-----------------------------
  unknown-rule definition      | Y        | Step 6 deletes all 12 directives     | CI red before merge (dev only)
  outdated lockfile            | Y        | Step 3 commit + diff review          | CI red before merge (dev only)
  missing tsup                 | Y        | Step 3 drops 'tsup' from test.each   | validate red before merge
  pregate JSON / staging       | Y        | Step 5 JSON.parse + git status check | pregate error before ship
  fallow reference             | Y        | validate runs fallow before ship     | validate red before merge
```

All failures surface as red gates before merge; no runtime path exists. GAPS: 0.

#### Section 3: Security & Threat Model

No new endpoint, input, data access, secret or dependency; two dependencies leave
(`css-tree`, `tsup` and their transitive entries), shrinking supply-chain surface. CI
workflow edits only delete steps (no new permissions, no new actions). No issues found.

#### Section 4: Data Flow & Interaction Edge Cases

No new data flow or user interaction. The only "flow" is the lint pipeline, covered in
Section 2. Edge case checked: `.gstack/pregate.json` sits under an ignored directory, so a
plain `git add` refuses it [measured: exit 1 "paths are ignored"] — handled by Step 5's
`git add -f`/`git add -u` plus `git status`. No unhandled edge cases.

#### Section 5: Code Quality Review

Deletion-only change; no new methods. Finding (V1): keeping a parser-only comma-ban test
with invented reasons would preserve dead policy — resolved by deleting the test and the
reason clauses. Finding (N2): comment rewordings describe conventions, not enforcement —
already met. Issues found: 2 (resolved).

#### Section 6: Test Review

```
  CHANGE                               | PROOF (existing or edited)                         | TYPE
  -------------------------------------|----------------------------------------------------|------
  eslint config minus dslint           | pnpm lint --max-warnings 0 (whole repo)           | static
  12 directives removed                | pnpm lint (unknown-rule errors would fail)        | static
  tsup leaves toolchain test           | pnpm test:tools (2 remaining test.each cases)     | unit
  generator comma-ban test deleted     | 'emits exactly the six Default blocks first' +    | unit
                                       | colour-scheme test + pnpm theme:check (no diff)   |
  lockfile regenerated                 | CI pnpm install --frozen-lockfile                 | CI
  CI steps removed                     | lint.yml / fallow.yml green on the PR             | CI
  residual references                  | git grep allow-list = 1 hit (roadmap:309)         | check
```

Assertion check: `pnpm theme:check` rejects any generated CSS change (no_claim=none beyond
protects); the git grep check rejects any second hit (no_claim=untracked files, which ship
nowhere). The 2am test: `pnpm validate` exit 0 plus CI green. Hostile QA: a stray
`eslint-disable-line dslint/...` in an untouched file — caught by `pnpm lint`. Chaos: none
applicable. No flaky or time-dependent tests added. Gaps: 0.

#### Section 7: Performance Review

Removes one tsup build before every lint/validate/CI lint and fallow job; no runtime code
path changes. No issues found.

#### Section 8: Observability & Debuggability Review

No runtime codepath, so no logs/metrics/alerts needed. Debuggability of the change itself:
the PR body records the lost lint and where a replacement would go (N1), and the roadmap
keeps a dated note. No gaps found.

#### Section 9: Deployment & Rollout Review

No migration, flag or runtime change; Vercel rebuilds identical app output (theme CSS pinned
by `pnpm theme:check`). Rollback: revert the squash commit. Post-deploy check: production
`/login` loads with the same theme config as v0.28.0. Electron: no separate release; the
same-day release owed by #213 carries the comment-only `packages/live-editor` edit. Risks
flagged: 0.

#### Section 10: Long-Term Trajectory Review

Debt removed: a bespoke plugin, its build step, CI steps, pregate lanes, a dead override and
a parser-only constraint. Debt introduced: none (accepted guard loss, documented). Path
dependency: adding a maintained Tailwind lint later is one config block. Reversibility:
5/5. Ecosystem fit: stock ESLint flat config. The 1-year question: obvious — fewer moving
parts. Retrospective on cherry-picks: C2 was correctly reopened and dropped; C4 is
load-bearing only as cleanup. Debt items: 0.

#### Section 11: Design & UX Review

SKIPPED (no UI scope): the plan changes no screen, component behaviour, user-visible state
or design token; the only UI-adjacent edits are comments and lint directives with
`className` values unchanged.

#### NOT in scope

- Rejected: C1 replacement lint (owner asked for removal; PR body names where one would go).
- Rejected: C2 `test:packages` reorder (cosmetic; reopened by both CEO voices).
- Rejected: C3 permanent no-dslint test (YAGNI; the git grep check runs at ship).
- Rejected: a separate Electron release for this PR (comment-only desktop-side edit).
- Deferred: none (TODOS.md is not recreated in this repo).

#### What already exists

| Sub-problem                | Existing code                                                                                            | Plan reuses?   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| Lockfile cleanup           | `pnpm install` (workspace glob `packages/*`)                                                             | yes            |
| Brand-colour guard         | `apps/web/src/lib/themes/no-hardcoded-amber.test.ts`, theme contract tests, `base-css-bare-root.test.ts` | yes, unchanged |
| Generated CSS layout proof | `generate-theme-css.test.ts` 'six Default blocks first' + colour-scheme tests, `pnpm theme:check`        | yes            |
| Residual-reference check   | `git grep`                                                                                               | yes            |

#### Dream state delta

This plan reaches the 12-month lint ideal for this package: stock tools only, no bespoke
build. Remaining gap to the ideal: design-system intent beyond theme colours (arbitrary
Tailwind values) has no automated guard; DESIGN.md and review carry it until drift shows.

#### Error & Rescue Registry

| Capability   | Failure                 | Rescue                                            | User impact          |
| ------------ | ----------------------- | ------------------------------------------------- | -------------------- |
| ESLint       | unknown-rule directive  | delete all 12 (Step 6)                            | none (pre-merge red) |
| pnpm install | stale lockfile          | regenerate + diff review + commit (Step 3)        | none (pre-merge red) |
| test:tools   | missing `tsup`          | drop from `test.each` (Step 3)                    | none (pre-merge red) |
| pregate      | invalid JSON / unstaged | JSON.parse + `git add -f` + `git status` (Step 5) | none (pre-ship red)  |
| fallow       | dangling reference      | validate before ship                              | none (pre-merge red) |

#### Failure Modes Registry

```
  CODEPATH        | FAILURE MODE              | RESCUED? | TEST?            | USER SEES?   | LOGGED?
  ----------------|---------------------------|----------|------------------|--------------|--------
  eslint          | unknown-rule directive    | Y        | pnpm lint        | CI red       | CI log
  pnpm install    | outdated lockfile         | Y        | CI frozen install| CI red       | CI log
  test:tools      | tsup unresolved           | Y        | pnpm test:tools  | validate red | vitest
  pregate.json    | invalid JSON / unstaged   | Y        | JSON.parse check | ship red     | stderr
  fallow          | stale reference           | Y        | fallow:dead-code | CI red       | CI log
```

CRITICAL GAPS: 0.

#### Scope Expansion Decisions

CEO plan: `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-02-remove-dslint.md`.
Accepted: C4. Deferred: none. Skipped: C1, C2 (reopened), C3.

#### Diagrams

System architecture (Section 1), error flow (Section 2), test map (Section 6), failure modes
(above). Data flow, state machine, deployment sequence and rollback flowchart: not
applicable (no new data flow or state; deploy = identical Vercel build; rollback = revert).
Stale Diagram Audit: the touched files contain no ASCII diagrams [measured: grep for
box-drawing characters in all 10 touched text files]; 0 stale.

REALITY: premise-table pass 6 premises, unverified=0 docs/designs/remove-dslint.md:84
REALITY: already-done pass no commit on origin/main since 2026-11-02 touches the package or mentions dslint eslint.config.js:9
REALITY: surface-check pass named commands exist (`pnpm validate`, `pnpm lint`, `pnpm test:packages`, `pnpm typecheck`, `pnpm clean`) package.json:94
REALITY: binding-decisions pass `gstack-decision-search --scope branch --recent 50` returned none; no `## Binding decisions` section docs/designs/remove-dslint.md:1
REALITY: numbers pass 20 referencing files [measured: git grep -l -i dslint, package/CHANGELOG/lockfile excluded] README.md:72; 12 directives in 7 files [measured: git grep -c dslint/token-only] apps/web/src/app/(main)/skill-tree/SkillTreeView.tsx:195
REALITY: deferred-asks pass issue #218 acceptance items are all in Steps 1-8; nothing left out .github/workflows/lint.yml:22
REALITY: pr-count pass one PR (`pr_count.default_pr_count: 1`, gstack default; base has no .gstack/ship-policy.json) 565a7a84c271ef87e6508d670642d87b2dcdb0d6

PLAN_REALITY: phase=ceo rows=7/7 missing=none unverified=0 verdict=complete

#### Implementation Tasks (CEO)

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~1h / CC: ~10min)** — tooling — Remove the package, lint wiring, scripts, CI steps and lanes (Steps 1-5)
  - Surfaced by: Section 1 / 0B inventory, CEO-SR, CEO-C4, CEO-N3, CEO-N4
  - Files: packages/eslint-plugin-dslint/, eslint.config.js, package.json, pnpm-lock.yaml, .github/workflows/lint.yml, .github/workflows/fallow.yml, scripts/pregate-tests.mjs, .gstack/pregate.json, .coderabbit.yaml, scripts/typescript-toolchain.test.ts, .pnpmfile.cjs
  - Verify: `pnpm install`; `git diff pnpm-lock.yaml` review; JSON.parse on pregate.json; `git status` shows it staged; `pnpm validate` exit 0
- [ ] **T2 (P1, human: ~45min / CC: ~10min)** — source — Delete the 12 directives, reword comments, drop the parser-only test (Step 6)
  - Surfaced by: Section 5 (CEO-V1, CEO-N2), 0A P4
  - Files: 5 skill-tree files, CategoryManageDialog.tsx, packages/live-editor/src/SharedCategoryPicker.tsx, ThemeSelector.tsx, KeybindingCaptureInput.tsx, apps/web/scripts/generate-theme-css.ts, apps/web/src/lib/themes/generate-theme-css.test.ts
  - Verify: `pnpm lint`; `pnpm theme:check`; `pnpm test`
- [ ] **T3 (P2, human: ~20min / CC: ~5min)** — docs — README, headless-development, roadmap dated note, PR-body guard-loss note (Step 7, CEO-N1)
  - Surfaced by: Section 8, CEO-N1
  - Files: README.md, docs/headless-development.md, docs/design/roadmap-2026-09-no-login-live-editor.md
  - Verify: `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'` = 1 hit (roadmap:309)

#### CEO Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | self-contained package wired by path; 20    |
  |                      | referencing files; tsup coupling via the    |
  |                      | toolchain test                              |
  | Step 0               | SELECTIVE EXPANSION; C4 accepted; C1/C3     |
  |                      | skipped; spec loop 3 launches               |
  | Section 1  (Arch)    | 1 issues found                              |
  | Section 2  (Errors)  | 5 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 0 issues found, 0 High severity             |
  | Section 4  (Data/UX) | 1 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 2 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 0 gaps found                                |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 0           |
  | Section 11 (Design)  | SKIPPED (no UI scope)                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 5 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 5 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 0 items proposed                            |
  | Scope proposals      | 4 proposed, 1 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex completed                             |
  | Lake Score           | N/A                                         |
  | Diagrams produced    | 4 (architecture, error flow, test map,      |
  |                      | failure modes)                              |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  | Reality rows         | 7/7 rows (PLAN_REALITY), 0 unverified       |
  +====================================================================+
```

Unresolved decisions: none.

### Design review (autoplan Phase 2)

UI scope: `uiRequired=true` from the snapshot tool (rendered file paths in Step 6:
`ThemeSelector.tsx`, `KeybindingCaptureInput.tsx`, `CategoryManageDialog.tsx`,
`SharedCategoryPicker.tsx`; terms: "layout" ×2). Actual UI change: none; className values
stay byte-identical. Mockups: skipped (zero UI scope to render; the plan changes no screen).

**Step 0.** 0A initial design completeness 7/10: every edit is pinned by file, line and text,
but the plan drops two layout-intent comments and does not prove the className strings stay
identical. A 10 keeps the layout intent and proves no class string moved. 0B DESIGN.md
exists; calibration against it. 0C reuse: the existing components keep their markup;
`peer-focus-visible:ring-*` on the theme card (`ThemeSelector.tsx:137`) already is the
focus treatment the reworded comment names. 0D focus areas: auto-decided all 7 passes.

**Native design voice (in-host, completed; INPUT `design b3d46469…`).** 6 Medium: D1
arbitrary-value guard lost (PR body + checklist line), D2 trailing reasons may carry layout
intent, D3 no proof className strings are untouched, D4 verify the ThemeSelector comment
against markup, D5 check the comma-ban test's coverage is replaced, D6 the roadmap note's
"#218" must be right.

**Codex design voice (outside, `OUTSIDE_STATUS: completed provider=codex host=claude`,
gpt-6-astra, VERDICT clean, FINDINGS P3).** 1 Low: `SharedCategoryPicker.tsx:163` and
`CategoryManageDialog.tsx:758` reasons document user-facing layout purpose (actions stay
visible while the list scrolls; header stays while the body scrolls); keep them as plain
comments. Recommendation: "Approve with the two layout-purpose comments preserved because the
plan keeps existing UI behavior intact, but those comments document why scrolling must not
hide category actions or the dialog header."

```
DESIGN OUTSIDE VOICES — LITMUS SCORECARD:
  Check                                    Claude  Codex  Consensus
  1. Brand unmistakable in first screen?   n/a     n/a    NOT SPEC'D (no screen change)
  2. One strong visual anchor?             n/a     n/a    NOT SPEC'D
  3. Scannable by headlines only?          n/a     n/a    NOT SPEC'D
  4. Each section has one job?             n/a     n/a    NOT SPEC'D
  5. Cards actually necessary?             n/a     n/a    NOT SPEC'D
  6. Motion improves hierarchy?            n/a     n/a    NOT SPEC'D
  7. Premium without decorative shadows?   n/a     n/a    NOT SPEC'D
  Hard rejections triggered:               none    none   CONFIRMED (none)
```

Consensus finding: both voices flag the layout-intent comments (D2 = Codex Low) → CONFIRMED.

| ID                 | Finding                                                                              | Decision                                                                                                                                                                                                                      | Basis                                 |
| ------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| DES-1 (D2 + Codex) | keep layout intent at `SharedCategoryPicker.tsx:163`, `CategoryManageDialog.tsx:758` | ACCEPTED: plain comments with Codex's wording; other reasons go                                                                                                                                                               | structural auto-fix (P5); both voices |
| DES-2 (D3)         | prove className strings unchanged                                                    | ACCEPTED: `git diff -U0` check in Tests / verification                                                                                                                                                                        | P1, cheap                             |
| DES-3 (D4)         | ThemeSelector comment matches markup                                                 | verified: `ThemeSelector.tsx:137` uses `peer-focus-visible:ring-2`                                                                                                                                                            | no change                             |
| DES-4 (D5)         | comma-ban test coverage                                                              | keep CEO-V1 deletion: 'emits exactly the six Default blocks first' compares the first six heads exactly (`generate-theme-css.test.ts:301`), so a comma join of Default blocks still fails; non-Default joins have no consumer | no change (P5)                        |
| DES-5 (D1)         | add an "arbitrary values" QA checklist line                                          | DECLINED: CEO-N1 PR-body note covers it; /CLAUDE.md QA already flags DESIGN.md mismatches                                                                                                                                     | P4 (no duplicate rule)                |
| DES-6 (D6)         | "#218" in the roadmap note                                                           | no change: #218 is the issue that asked for the removal, valid whatever the PR number                                                                                                                                         | evidence: issue #218                  |

**Pass 1 Information Architecture: 10/10 → 10/10.** No screen, hierarchy or navigation
changes; nothing to rank. No issues found.
**Pass 2 Interaction States: 10/10 → 10/10.** Existing loading/empty/error/success states in
the category picker, category dialog and theme selector are untouched (Codex listed them);
the plan adds none. No issues found.
**Pass 3 Journey: 10/10 → 10/10.** The owner-facing journey is one step (the confusing
package disappears); no user journey changes. No issues found.
**Pass 4 AI Slop: 10/10 → 10/10.** Classifier: OPERATE (app UI) for the touched files; no
generic pattern introduced; hard rejections none. No issues found.
**Pass 5 Design System: 7/10 → 10/10.** DES-1 keeps the two layout-intent notes that explain
non-token values; DES-5 keeps DESIGN.md as the source and the PR note as the disclosure.
**Pass 6 Responsive & A11y: 8/10 → 10/10.** DES-2 proves the viewport/scroll classes
(`max-h-[calc(100dvh-2rem)]`, `min-h-0`, `overflow-*`) and focus classes stay identical.
**Pass 7 Decisions:** 2 resolved (DES-1, DES-2), 4 closed with evidence (DES-3..6), 0 deferred.

NOT in scope (design): mockups (no screen change); an arbitrary-value lint replacement
(CEO-C1). What already exists: DESIGN.md, `peer-focus-visible` focus treatment, the
viewport-bounded dialog and scroll-safe picker layouts, theme contrast tests. TODOS.md: 0
items (repo rule).

#### Implementation Tasks (Design)

- [ ] **T4 (P1, human: ~15min / CC: ~3min)** — source — Keep the two layout-intent comments and prove className strings are unchanged
  - Surfaced by: Pass 5/6 — DES-1, DES-2
  - Files: packages/live-editor/src/SharedCategoryPicker.tsx, apps/web/src/app/(main)/home/_components/CategoryManageDialog.tsx
  - Verify: `git diff -U0 origin/main -- <7 directive files> ThemeSelector.tsx KeybindingCaptureInput.tsx` shows comment-only changes

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope = comment-only  |
  |                      | edits in 4 rendered files                   |
  | Step 0               | 7/10 initial; all 7 passes                  |
  | Pass 1  (Info Arch)  | 10/10 → 10/10 after fixes                   |
  | Pass 2  (States)     | 10/10 → 10/10 after fixes                   |
  | Pass 3  (Journey)    | 10/10 → 10/10 after fixes                   |
  | Pass 4  (AI Slop)    | 10/10 → 10/10 after fixes                   |
  | Pass 5  (Design Sys) | 7/10 → 10/10 after fixes                    |
  | Pass 6  (Responsive) | 8/10 → 10/10 after fixes                    |
  | Pass 7  (Decisions)  | 2 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 0 generated, 0 approved                     |
  | Decisions made       | 2 added to plan                             |
  | Decisions deferred   | 0                                           |
  | Overall design score | 7/10 → 10/10                                |
  +====================================================================+
```

Plan is design-complete. Run /design-review after implementation for visual QA (not needed
for comment-only edits; the className diff check stands in).
Unresolved Decisions: none.

<!-- autoplan-baseline-edits:design {"sourceSha256":"19a3fd322e806f99cba27edec91afd3b9f4d6888bfb6840ec71f53cfdf8fbaa4","replacements":[{"oldText":"   keeping the `className` values unchanged; each trailing `// eslint-disable-line ... --\n   reason` comment goes whole, reason included, because the reason only justified the\n   exemption), reword four comments","newText":"   keeping the `className` values unchanged; each `// eslint-disable-... -- reason` comment\n   goes, and two reasons that record layout intent survive as plain comments without the\n   directive: `packages/live-editor/src/SharedCategoryPicker.tsx:163` becomes\n   `// Keep category actions visible while the category list scrolls.` and\n   `CategoryManageDialog.tsx:758` becomes\n   `// Keep the header visible and scroll the body within the viewport.`; the other reasons\n   only justified the exemption and go whole), reword four comments"},{"oldText":"- CI workflows parse (`lint.yml`, `fallow.yml`) and pass on the PR.","newText":"- `git diff -U0` of the 7 directive files plus `ThemeSelector.tsx` and\n  `KeybindingCaptureInput.tsx` shows only comment/directive changes; every `className`\n  string is byte-identical to the base.\n- CI workflows parse (`lint.yml`, `fallow.yml`) and pass on the PR."}]} -->

<!-- autoplan-accepted:design -->

- `SharedCategoryPicker.tsx:163` and `CategoryManageDialog.tsx:758` keep their layout intent as plain comments (`// Keep category actions visible while the category list scrolls.`, `// Keep the header visible and scroll the body within the viewport.`); every other dslint reason goes with its directive.
- `git diff -U0` of the 7 directive files, `ThemeSelector.tsx` and `KeybindingCaptureInput.tsx` shows comment-only changes; every `className` string is byte-identical to the base.

<!-- /autoplan-accepted:design -->

### DX review (autoplan Phase 2.5, DX POLISH)

**Product type:** Library/SDK-adjacent contributor tooling (lint pipeline of a pnpm
workspace); confirmed by auto-decision. **Persona:** AI coding agent working for the solo
owner (reads errors literally, cannot ask, pays per token) — the owner's agents do nearly all
contributor work in this repo. Mode: DX POLISH (autoplan override).

```
TARGET DEVELOPER PERSONA
Who:       AI coding agent (Claude Code / Codex) on a fresh worktree of laststance/corelive
Context:   runs pnpm install, pnpm lint, pnpm validate before every commit; reads CI logs
Tolerance: one failed gate = a retry loop that costs tokens; unclear errors = blind retries
Expects:   stock commands (`pnpm lint` = `eslint .`), no hidden pre-build, docs that match pins
```

**Empathy narrative.** I open a fresh worktree, run `pnpm install --frozen-lockfile`, then
`pnpm lint`. Today `pnpm lint` itself works, but `eslint.config.js:9` imports
`packages/eslint-plugin-dslint/dist/index.js`, so in a worktree where nobody ran
`pnpm --filter eslint-plugin-dslint build` ESLint fails to load its config before linting a
single file (observed wiring; `validate` and both CI workflows add the build step for that
reason). I also see `dslint/token-only` disable comments in skill-tree files and have to learn
a bespoke rule to know whether my new `className` is allowed. README tells me Node `24.20.0`
while mise and CI install `26.12.1` [measured: README.md:38,50 vs mise.toml:2], so my version
check fails on a correct setup. After this plan: `pnpm lint` is plain ESLint, no build
step, no bespoke directives, and README states the pinned Node and what lint does not cover.

**Competitive benchmark (0C).**

| Tool                         | Start → result                | Time + evidence type                                              | DX choice                           | Source                                                      |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------- |
| Typical flat-config monorepo | clone → install → `eslint .`  | one command after install (reported)                              | single root config, no plugin build | zenn.dev/chot/articles/eslint-flat-config-knowledge-sharing |
| corelive today               | install → plugin build → lint | two commands; a missing build fails config load (observed wiring) | path import of a built local plugin | eslint.config.js:9                                          |
| corelive after #218          | install → `pnpm lint`         | one command (estimated)                                           | stock plugins only                  | this plan                                                   |

TTHW (contributor, install done → first lint result): current 2 steps → target 1 step
(Champion tier for this boundary; estimate, not measured). Target auto-decided: A) Champion.
**Magical moment (0D):** `pnpm lint` works in a fresh worktree with no extra step; vehicle =
the removal itself (existing capability).

**Native DX voice (in-host, completed; INPUT `dx 6060f09b…`).** H1 contributors get no
in-repo signal about the lost guard; M1 no lockfile abort rule; M2 pregate JSON/staging
check; M3 the allow-list pins line 309; M4 other checkouts keep untracked leftovers; low:
verify "#218".

**Codex DX voice (outside, `OUTSIDE_STATUS: completed provider=codex host=claude`,
gpt-6-astra, VERDICT clean, FINDINGS P2).** C1 Medium README Node `24.20.0` vs pinned
`26.12.1`; C2 Medium fresh-checkout recipe split across README/headless doc and
`pnpm setup:env` succeeds silently without a root `.env`; C3 Low lint coverage change lives
only in the PR body and dated records. Recommendation: "Revise the contributor
documentation, then proceed because the removal simplifies lint and CI, but conflicting
runtime instructions, an incomplete fresh-checkout recipe, and PR-only lint coverage notes
still create avoidable setup and maintenance friction."

```
DX DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Getting started < 5 min?          yes     unmeasured DISAGREE -> taste (C2 declined)
  2. API/CLI naming guessable?         yes     yes    CONFIRMED
  3. Error messages actionable?        yes     yes    CONFIRMED (no new error paths)
  4. Docs findable & complete?         gap     gap    CONFIRMED gap -> DX-1
  5. Upgrade path safe?                gap     yes    DISAGREE -> taste (DX-5 PR note)
  6. Dev environment friction-free?    yes     gap    DISAGREE -> DX-2 (Node drift fix)
```

Single-voice criticals: none.

| ID             | Finding                                             | Decision                                                                                                                                                                                                                           | Basis                                                |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| DX-1 (H1 + C3) | lost guard documented only in the PR                | ACCEPTED: one README "Code quality" sentence                                                                                                                                                                                       | both voices; P1                                      |
| DX-2 (C1)      | README Node 24.20.0 vs pinned 26.12.1               | ACCEPTED: README lines 38, 50 → 26.12.1                                                                                                                                                                                            | discovered TODO; project rule resolves it in this PR |
| DX-3 (M1)      | lockfile abort rule                                 | ACCEPTED in Step 3                                                                                                                                                                                                                 | P1, cheap                                            |
| DX-4 (M3)      | allow-list pinned to a line number                  | ACCEPTED: match the file                                                                                                                                                                                                           | P5                                                   |
| DX-5 (M4)      | other checkouts' untracked leftovers                | ACCEPTED: PR-body note                                                                                                                                                                                                             | P1, cheap                                            |
| DX-6 (C2)      | restructure fresh-checkout docs; `setup:env` silent | DECLINED (TASTE): `docs/headless-development.md:27-29` already says a fresh checkout copies `.env.example` and the helper is for an existing root `.env`; restructuring setup docs is outside this removal (DX POLISH keeps scope) | P3/P5                                                |
| DX-7 (M2)      | pregate JSON + staging check                        | no change: Step 5 already requires JSON.parse and `git status` staged                                                                                                                                                              | cite Step 5                                          |
| DX-8 (low)     | "#218" number                                       | no change: #218 is the issue (same as DES-6)                                                                                                                                                                                       | issue #218                                           |

**Passes (DX POLISH; before → after).** Pass 1 Getting Started 7 → 9 (one-step lint;
estimate, not measured). Pass 2 API/CLI 8 → 8 (script names unchanged; no issues found).
Pass 3 Error Messages 8 → 8 (no new error paths; the removed failure is "config load fails
without a plugin build"; matrix below). Pass 4 Documentation 5 → 8 (DX-1, DX-2). Pass 5
Upgrade 7 → 8 (DX-3, DX-5). Pass 6 Dev Environment 7 → 9 (no build step, Node drift fixed).
Pass 7 Community 8 → 8 (internal repo; no issues found). Pass 8 Measurement 6 → 7 (the
git grep allow-list and validate are the only measurements; no telemetry added, none
needed).

```
ERROR PATH MATRIX (agent-ready-v1)
Path                          | Class      | what | fix  | recovery | code | context | trace | redaction | channel | Cap
leftover dslint directive     | validation | pass | pass | N/A      | pass | pass    | N/A   | pass      | pass    | —   (ESLint names rule + file:line, exit 1)
stale lockfile in CI          | validation | pass | pass | pass     | pass | pass    | N/A   | pass      | pass    | —   (ERR_PNPM_OUTDATED_LOCKFILE)
tsup missing in test:tools    | unexpected | pass | pass | pass     | N/A  | pass    | pass  | pass      | pass    | —   (vitest names the case)
invalid pregate.json          | validation | pass | pass | pass     | N/A  | pass    | N/A   | pass      | pass    | —   (JSON.parse position)
```

**Developer journey map (0F).**

```
STAGE           | DEVELOPER DOES                         | FRICTION POINTS                 | STATUS
1. Discover     | reads README Documentation/Code quality| dslint link; no lint-scope note | fixed (DX-1, Step 7)
2. Install      | mise install; pnpm install             | README Node 24.20.0 vs 26.12.1  | fixed (DX-2)
3. Hello World  | pnpm lint                              | needs prior plugin build        | fixed (Steps 2-4)
4. Real Usage   | edits className, commits               | bespoke dslint rule/directives  | fixed (Step 6)
5. Debug        | reads CI lint/fallow logs              | extra plugin build/lint steps   | fixed (Step 4)
6. Upgrade      | pulls the change into a worktree       | untracked plugin leftovers      | fixed (DX-5 PR note)
```

**First-time developer report (0G).** T+0:00 `pnpm install --frozen-lockfile` succeeds.
T+0:30 `node --version` prints v26.12.1 but README expects v24.20.0 → confusion (fixed by
DX-2). T+1:00 `pnpm lint` in a fresh worktree: today fails to load
`packages/eslint-plugin-dslint/dist/index.js` without a build (fixed by Steps 2-4). T+2:00 a
new `ring-[3px]` passes lint with no guidance (DX-1 documents it). T+3:00 success.

NOT in scope (DX): fresh-checkout doc restructure (DX-6, declined); TTHW instrumentation;
a replacement lint (CEO-C1). What already exists: README Getting Started, headless
development guide, `pnpm validate`, Fallow gates.

```
DX IMPLEMENTATION CHECKLIST
[x] Time to first lint result: 1 command after install (target from 0C)
[x] Installation is one command (pnpm install)
[x] First run produces meaningful output (eslint results)
[x] Magical moment delivered via the removal (no build step)
[x] Every error path meets the agent-ready contract (matrix above; no new paths)
[x] Command naming unchanged (lint, lint:fix, validate)
[ ] Docs: README lint-scope sentence and Node version (DX-1, DX-2) — implementation task
[x] Upgrade: PR-body pull note (DX-5) — implementation task
[x] Works in CI without special configuration (build steps removed)
[x] Changelog exists and is maintained (CHANGELOG.md)
```

#### Implementation Tasks (DX)

- [ ] **T5 (P1, human: ~15min / CC: ~3min)** — docs — README lint-scope sentence and Node 26.12.1 fix
  - Surfaced by: Pass 4/6 — DX-1, DX-2
  - Files: README.md
  - Verify: README Code quality has the sentence; `grep -n 24.20.0 README.md` is empty
- [ ] **T6 (P2, human: ~10min / CC: ~2min)** — ship — Lockfile abort rule, file-based allow-list, PR-body pull note
  - Surfaced by: Pass 5/8 — DX-3, DX-4, DX-5
  - Files: pnpm-lock.yaml (review only)
  - Verify: `git diff pnpm-lock.yaml` review; git grep single hit in the roadmap file; PR body contains the note

## DX Review Scorecard

```
+====================================================================+
|              DX PLAN REVIEW — SCORECARD                             |
+====================================================================+
| Dimension            | Score  | Prior  | Trend  |
|----------------------|--------|--------|--------|
| Getting Started      | 9/10   | 7/10   | +2 ↑   |
| API/CLI/SDK          | 8/10   | 8/10   | 0      |
| Error Messages       | 8/10   | 8/10   | 0      |
| Documentation        | 8/10   | 5/10   | +3 ↑   |
| Upgrade Path         | 8/10   | 7/10   | +1 ↑   |
| Dev Environment      | 9/10   | 7/10   | +2 ↑   |
| Community            | 8/10   | 8/10   | 0      |
| DX Measurement       | 7/10   | 6/10   | +1 ↑   |
+--------------------------------------------------------------------+
| TTHW                 | 1 step | 2 steps| ↑ (estimate) |
| Competitive Rank     | Champion (contributor lint boundary)        |
| Magical Moment       | designed via the removal (no build step)    |
| Product Type         | contributor tooling (lint pipeline)         |
| Mode                 | POLISH                                      |
| Overall DX           | 8/10   | 5/10   | +3 ↑   |
+====================================================================+
| DX PRINCIPLE COVERAGE                                               |
| Zero Friction      | covered                                        |
| Learn by Doing     | covered (stock ESLint)                         |
| Fight Uncertainty  | covered (DX-1, DX-2)                           |
| Opinionated + Escape Hatches | covered (replacement slot named)     |
| Code in Context    | covered                                        |
| Magical Moments    | covered                                        |
| Agents Are Users   | covered (single command, literal errors)       |
+====================================================================+
```

Prior column = this review's pre-fix scores (no earlier DX review on this branch). Overall
DX uses the lowest dimension. Unresolved Decisions: none.

<!-- autoplan-baseline-edits:dx {"sourceSha256":"4b8a0d2b229c5b499f7127943fd1741c3ca9eeea64db8bceff165f7158cfa76d","replacements":[{"oldText":"   and commit the regenerated `pnpm-lock.yaml` (CI installs with `--frozen-lockfile`).","newText":"   and commit the regenerated `pnpm-lock.yaml` (CI installs with `--frozen-lockfile`). Abort\n   rule: if the diff removes or bumps any entry still reachable from another importer,\n   restore the lockfile (`git checkout -- pnpm-lock.yaml`) and re-run `pnpm install` with the\n   `packageManager`-pinned pnpm before committing."},{"oldText":"   mention. CHANGELOG history stays untouched.","newText":"   mention. In `README.md` \"Code quality\", add one sentence after the `pnpm validate`\n   paragraph: \"`pnpm lint` does not check Tailwind class names: arbitrary values and\n   non-token classes are not linted. Follow `DESIGN.md` for tokens; `pnpm theme:check` only\n   compares the generated theme CSS.\" Also fix the README Node.js version drift found in\n   review: lines 38 and 50 say `24.20.0`, while `mise.toml:2` and\n   `.github/actions/prepare/action.yml:13` pin `26.12.1`; both README lines become\n   `26.12.1`. CHANGELOG history stays untouched."},{"oldText":"8. On the committed tree, `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'`\n   returns exactly one hit, the dated\n   `docs/design/roadmap-2026-09-no-login-live-editor.md:309` note (the allow-list).","newText":"8. On the committed tree, `git grep -n -i dslint -- ':!CHANGELOG.md' ':!docs/designs/**'`\n   returns exactly one hit, and it is in\n   `docs/design/roadmap-2026-09-no-login-live-editor.md` (the dated note, line 309 today;\n   the check matches the file, not the line number)."},{"oldText":"  `eslint.config.js`, e.g. eslint-plugin-tailwindcss `no-arbitrary-value`).","newText":"  `eslint.config.js`, e.g. eslint-plugin-tailwindcss `no-arbitrary-value`), and tells other\n  checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling."}]} -->

<!-- autoplan-accepted:dx -->

- README "Code quality" says `pnpm lint` does not check Tailwind class names (arbitrary values and non-token classes are not linted), points to `DESIGN.md`, and says `pnpm theme:check` only compares generated theme CSS.
- README lines 38 and 50 state Node.js `26.12.1`, matching `mise.toml:2` and `.github/actions/prepare/action.yml:13`.
- The lockfile diff review aborts and regenerates with the pinned pnpm if any entry reachable from another importer changes.
- The `git grep` allow-list matches one hit in `docs/design/roadmap-2026-09-no-login-live-editor.md`, not a line number.
- The PR body tells other checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling.

<!-- /autoplan-accepted:dx -->

### Eng review (autoplan Phase 3)

Scope gate: autoplan target = this plan (`docs/designs/remove-dslint.md`). Report file = this
plan. Design doc: none; CEO plan: `~/.gstack/projects/laststance-corelive/ceo-plans/2026-11-02-remove-dslint.md`.

#### Step 0: Scope Challenge

A. What already solves each sub-problem: `pnpm install` (lockfile), stock ESLint flat config
(remaining blocks), `pnpm theme:check` + theme tests (brand guard), `git grep` (residual check).
Minimum change: Steps 1-8; nothing deferrable without a dangling reference. Complexity: 26
deleted package files [measured: `git ls-files packages/eslint-plugin-dslint | wc -l`] + 24
edited files [measured: plan Steps 2-7 file list], 0 new classes/services. Search check: no new
architectural pattern (deletion only; benchmark in DX 0C). TODOS.md: none in this repo (rule:
resolve discovered TODOs in the PR). Completeness: the plan covers the indirect `tsup` chain.
Distribution: no new artifact. Retrospective: `07fb499a refactor: remove Storybook (#192)` is
the closest precedent (whole-tooling removal in one PR); no reverts touch the package
[measured: `git log --grep=revert -- packages/eslint-plugin-dslint eslint.config.js` empty].

B. Complexity gate tripped (8+ files). Structure question `plan-eng-review-structure`:
auto-decided **Original arrangement** (recommended): no smaller arrangement preserves the
accepted scope, because every edited file holds a reference that would dangle. Scope record:
feature answers: none (no cuts proposed); structure: A (auto-decide, owner standing
instruction 「全て選択肢はrecommend」); accepted scope: Steps 1-8 as amended by CEO/Design/DX/Eng;
pending remedies: none.

C. Findings: none beyond the native/outside items below. Result: **scope accepted as-is**.

```
REALITY: premise-table pass 6 premises, unverified=0 docs/designs/remove-dslint.md:84
REALITY: already-done pass origin/main 565a7a84 has no commit since 2026-11-02 touching the package eslint.config.js:9
REALITY: surface-check pass `pnpm lint`, `pnpm validate`, `pnpm test:tools`, `pnpm test:packages`, `pnpm theme:check` exist package.json:92
REALITY: binding-decisions pass no `## Binding decisions` and no branch decisions logged docs/designs/remove-dslint.md:1
REALITY: numbers pass 26 tracked package files [measured: git ls-files] packages/eslint-plugin-dslint/package.json:2; 12 directives in 7 files [measured: git grep -c dslint/token-only] apps/web/src/app/(main)/skill-tree/SkillTreeView.tsx:195
REALITY: deferred-asks pass all six #218 acceptance items map to Steps 1-8 .github/workflows/lint.yml:22
REALITY: pr-count pass one PR (gstack default; base has no .gstack/ship-policy.json) 565a7a84c271ef87e6508d670642d87b2dcdb0d6
```

PLAN_REALITY: phase=eng rows=7/7 missing=none unverified=0 verdict=complete

#### Step 0.5: Dual voices

**CLAUDE SUBAGENT (eng — independent review; INPUT `eng fd94190b…`, completed).** Verdict:
sound, low risk. E1 Medium pregate.json must be proven in the commit; E2 Medium apply in one
commit, lint only after Steps 1-2; E3 Medium `pnpm install --frozen-lockfile` re-check and
shared-transitive (esbuild) check; E4 Low verify `tsup@` absence and esbuild unchanged; E5 Low
`live-editor` zero tests; E6 Low optional arbitrary-px guard test; E7 Low strengthen the
comment-only diff check; E8 Low call out the README Node fix separately; E9 Low
`pnpm-workspace.yaml` glob.

**CODEX SAYS (eng — architecture challenge).** Attempts 1 and 2: completed runs with
`OUTSIDE_STATUS: unverified` (reason `untagged_review`: the no-findings conclusion was not the
last sentence); attempt 3: `OUTSIDE_STATUS: completed provider=codex host=claude`, gpt-6-astra,
VERDICT clean, FINDINGS none — "No issues found in the change." Recommendation: "Proceed with
implementation and require the planned lockfile review, validation, and PR CI checks before
merge because the plan covers the package's direct references and indirect toolchain
dependencies without changing application behavior."

```
ENG DUAL VOICES — CONSENSUS TABLE:
  Dimension                           Claude  Codex  Consensus
  1. Architecture sound?               yes     yes    CONFIRMED
  2. Test coverage sufficient?         gaps    yes    DISAGREE -> taste (E3/E7 checks accepted)
  3. Perf risks + budget/bench named?  n/a     n/a    CONFIRMED (no runtime path)
  4. Security threats covered?         yes     yes    CONFIRMED (surface shrinks)
  5. Error paths handled?              yes     yes    CONFIRMED (all pre-merge red gates)
  6. Deployment risk manageable?       yes     yes    CONFIRMED
```

Single-voice criticals: none.

| ID             | Finding                                                               | Decision                                                                                                          | Basis    |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| ENG-1 (E1)     | prove `.gstack/pregate.json` is committed                             | ACCEPTED: `git show --stat HEAD -- .gstack/pregate.json`; tracked [measured: `git ls-files .gstack/pregate.json`] | P1       |
| ENG-2 (E2)     | one commit; lint after Steps 1-2 with the package dir gone            | ACCEPTED                                                                                                          | P5       |
| ENG-3 (E3, E4) | `pnpm install --frozen-lockfile` re-check; esbuild versions unchanged | ACCEPTED                                                                                                          | P1       |
| ENG-4 (E7)     | comment-only diff check made mechanical                               | ACCEPTED                                                                                                          | P1       |
| ENG-5 (E8)     | README Node fix called out separately in the PR body                  | ACCEPTED                                                                                                          | P5       |
| ENG-6 (E5)     | `live-editor` zero tests                                              | no change: `--passWithNoTests` at `packages/live-editor/package.json:38`                                          | evidence |
| ENG-7 (E6)     | arbitrary-px guard test                                               | DECLINED: CEO-C1/C3 (owner asked for removal; YAGNI)                                                              | P4/P5    |
| ENG-8 (E9)     | workspace glob                                                        | no change: `pnpm-workspace.yaml:3` is `packages/*`                                                                | evidence |

#### Section 1: Architecture

```
  pnpm-workspace.yaml (packages/*)
    ├── apps/web ──────────┐
    ├── apps/desktop ──────┤
    ├── packages/desktop-contract
    ├── packages/live-editor
    └── packages/eslint-plugin-dslint   <-- DELETED
  eslint.config.js ── imports ──> [dist/index.js of the plugin]   <-- import DELETED
                    └─ stock plugins (typescript-eslint, react-hooks, ts-prefixer, ...)  KEPT
  package.json scripts: validate/lint/lint:fix/test:packages/typecheck/clean  -- dslint parts DELETED
  CI: lint.yml (build+lint-packages steps DELETED), fallow.yml (build step DELETED)
  .pnpmfile.cjs compilerApiConsumers ── tsup entry DELETED ──> scripts/typescript-toolchain.test.ts tsup case DELETED
```

Coupling only shrinks; no new module/boundary (design-twice not applicable: no new public
surface). Red flags: the removed path import was an "importable internals" / hand-built
artefact coupling; nothing new introduced. Production failure per integration: CI frozen
install on a stale lockfile → caught pre-merge (ENG-3). Rollback: revert the squash commit.
Distribution: none. Issues found: 0 (beyond ENG rows above).

#### Section 2: Code Quality

`[INFORMATIONAL] (confidence: 8/10) apps/web/src/lib/themes/generate-theme-css.test.ts:316 —
"test('never joins selectors with a comma so the dslint parser tags each block correctly'"`
guards a retired parser constraint; resolved by CEO-V1 deletion. No DRY/naming issues
introduced; comment rewordings describe conventions. Stale diagram audit: no ASCII diagrams in
touched files. Issues found: 1 (resolved).

#### Section 3: Test Review

Framework: Vitest (`vitest.config.*`, `pnpm test`, `pnpm test:tools`, `pnpm test:packages`,
`pnpm test:electron`).

```
CODE PATHS                                              USER FLOWS
[+] eslint.config.js (minus dslint block)               [+] Contributor lint
  └── [★★★ TESTED] whole-repo `pnpm lint --max-warnings 0`   ├── [★★★ TESTED] fresh worktree lint (ENG-2)
[+] 12 directive removals (7 files)                     │   └── [★★ TESTED] CI lint.yml on the PR
  └── [★★★ TESTED] unknown-rule errors fail `pnpm lint`  [+] Contributor validate
[+] scripts/typescript-toolchain.test.ts (tsup case out)    └── [★★★ TESTED] `pnpm validate` exit 0
  └── [★★ TESTED] remaining 2 cases + TS7 compiler test  [+] UI unchanged
[+] .pnpmfile.cjs set (tsup out)                            └── [★★ TESTED] className comment-only diff (ENG-4)
  └── [★★ TESTED] frozen install + toolchain test
[+] generate-theme-css.ts comments / test deletion
  └── [★★★ TESTED] six-heads order + colour-scheme tests + `pnpm theme:check`
[+] pnpm-lock.yaml regeneration
  └── [★★ TESTED] `pnpm install --frozen-lockfile` local + CI (ENG-3)
[+] .gstack/pregate.json
  └── [★★ TESTED] JSON.parse + commit stat (ENG-1)

COVERAGE: 10/10 paths covered | QUALITY: ★★★:5 ★★:5 | GAPS: 0
```

Tests made obsolete: `generate-theme-css.test.ts:316`, the `tsup` `test.each` case, all
`packages/eslint-plugin-dslint/tests/*` (deleted with the package). Regression rule: the
behaviour at risk (lint coverage of every other rule, generated CSS, class strings) is pinned
by `pnpm lint`, `pnpm theme:check` and ENG-4. No LLM/prompt files touched (no evals).
Test plan artifact: `~/.gstack/projects/laststance-corelive/ryotamurakami-fix-218-remove-dslint-eng-review-test-plan-20261102-232801.md`.
Gaps: 0.

#### Section 4: Performance

No runtime path. Lint/validate/CI lose one tsup build per run [measured: `pnpm --filter
eslint-plugin-dslint build` in `package.json:110`, `lint.yml:22`, `fallow.yml:40`]; no budget
needed. No issues found.

#### Failure modes

| Path       | Realistic failure  | Test/handling                      | User sees            |
| ---------- | ------------------ | ---------------------------------- | -------------------- |
| lint       | leftover directive | `pnpm lint` exit 1 names file:line | CI red (dev only)    |
| install    | stale lockfile     | frozen install fails               | CI red               |
| test:tools | tsup case left in  | vitest names the case              | validate red         |
| pregate    | unstaged edit      | `git show --stat` (ENG-1)          | ship pregate error   |
| UI         | className touched  | ENG-4 diff check                   | caught before commit |

Critical gaps: 0.

NOT in scope (eng): replacement lint (CEO-C1), arbitrary-px guard test (ENG-7), separate
Electron release. What already exists: stock ESLint config, `pnpm validate`, theme tests,
`pnpm theme:check`, `git grep`.

**Worktree parallelization strategy:** Sequential implementation, no parallelization
opportunity (one atomic removal commit; ENG-2 requires all steps together).

#### Implementation Tasks (Eng)

- [ ] **T7 (P1, human: ~20min / CC: ~5min)** — verification — Run the post-change checks in order
  - Surfaced by: Eng Step 0.5 — ENG-1..ENG-4
  - Files: pnpm-lock.yaml, .gstack/pregate.json (verification only)
  - Verify: `pnpm install --frozen-lockfile`; esbuild versions unchanged in `git diff pnpm-lock.yaml`; `pnpm lint` with the package dir gone; comment-only diff check; `git show --stat HEAD -- .gstack/pregate.json`
- [ ] **T8 (P2, human: ~5min / CC: ~1min)** — ship — PR body calls out the README Node fix separately
  - Surfaced by: Eng — ENG-5
  - Files: none (PR body)
  - Verify: PR body has a separate "Discovered TODO" line for DX-2

#### Eng Completion Summary

- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted (PLAN_REALITY below), 0 unverified premises
- Architecture Review: 0 issues found
- Code Quality Review: 1 issue found (resolved by CEO-V1)
- Test Review: diagram produced, 0 gaps identified
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed (repo resolves discovered TODOs in the PR)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, completed (attempt 3; attempts 1-2 unverified for format)
- Parallelization: 1 lane, 0 parallel / 1 sequential
- Lake Score: N/A (no completeness-scored questions)

<!-- autoplan-baseline-edits:eng {"sourceSha256":"d2a643caea4de316055f49fad5272b028626c927d4463dc7bf4a8a91fa990150","replacements":[{"oldText":"   `packageManager`-pinned pnpm before committing.","newText":"   `packageManager`-pinned pnpm before committing. Then run `pnpm install --frozen-lockfile`\n   once more, and confirm in the diff that every `esbuild@` version is unchanged."},{"oldText":"   commit), and the `packages/eslint-plugin-dslint/**` path","newText":"   commit, and `git show --stat HEAD -- .gstack/pregate.json` after it), and the\n   `packages/eslint-plugin-dslint/**` path"},{"oldText":"- `pnpm validate` green (lint, typecheck, build, theme:check, tests, Fallow dead-code).","newText":"- All steps land in one commit; `pnpm lint` runs only after Steps 1 and 2 are both applied,\n  with `packages/eslint-plugin-dslint/` already gone from disk (proves nothing needs a\n  prebuilt plugin).\n- `pnpm validate` green (lint, typecheck, build, theme:check, tests, Fallow dead-code)."},{"oldText":"  `KeybindingCaptureInput.tsx` shows only comment/directive changes; every `className`\n  string is byte-identical to the base.","newText":"  `KeybindingCaptureInput.tsx` shows only comment/directive changes; every `className`\n  string is byte-identical to the base (check: after stripping `//…` and `{/* … */}` comment\n  text, each changed line equals its base line)."},{"oldText":"  checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling.","newText":"  checkouts to run `rm -rf packages/eslint-plugin-dslint && pnpm install` after pulling. It\n  calls out the README Node.js version fix (DX-2) as a separate discovered-TODO item."}]} -->

<!-- autoplan-accepted:eng -->

- After `pnpm install`, `pnpm install --frozen-lockfile` passes and every `esbuild@` version in `pnpm-lock.yaml` is unchanged.
- `git show --stat HEAD -- .gstack/pregate.json` shows the pregate edit in the commit.
- All steps land in one commit; `pnpm lint` passes with `packages/eslint-plugin-dslint/` gone from disk.
- The className check strips comment text and confirms each changed line equals its base line.
- The PR body calls out the README Node.js version fix as a separate discovered-TODO item.

<!-- /autoplan-accepted:eng -->

### Final Approval Gate

**APPROVED** 2026-11-02 (gate_rev 1, reply `rec` under the owner's standing instruction 「全て選択肢はrecommend」): d1a, d2a, d3a, plan1a (approve as-is). User Challenges: none.

<!-- AUTONOMOUS DECISION LOG -->

## Decision Audit Trail

| #   | Phase  | Decision                                                                                 | Classification | Principle                             | Rationale                                                             | Rejected                  |
| --- | ------ | ---------------------------------------------------------------------------------------- | -------------- | ------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| 1   | CEO    | Mode SELECTIVE EXPANSION                                                                 | Mechanical     | override                              | autoplan Phase 1 override                                             | —                         |
| 2   | CEO    | C1 replacement lint SKIPPED                                                              | Mechanical     | P6/P4                                 | owner asked for removal; new dependency                               | eslint-plugin-tailwindcss |
| 3   | CEO    | C2 test:packages reorder ACCEPTED, then reopened → SKIPPED                               | Taste          | P3/P5                                 | both CEO voices: cosmetic                                             | reorder                   |
| 4   | CEO    | C3 permanent no-dslint test SKIPPED                                                      | Mechanical     | P5                                    | YAGNI; git grep at ship                                               | guard test                |
| 5   | CEO    | C4 dead tsup@8.5.1>esbuild override ACCEPTED                                             | Mechanical     | P2                                    | dead config in an edited file; repo TODO rule                         | keep override             |
| 6   | CEO    | 0H document approval A                                                                   | Mechanical     | owner instruction                     | 「全て選択肢はrecommend」                                             | revise/pause              |
| 7   | CEO    | Spec-review fixes (tsup chain, git grep, line ranges, JSON check, git add -f, leftovers) | Mechanical     | P1                                    | reviewer-evidenced gaps                                               | leave plan as was         |
| 8   | CEO    | V1 delete parser-only comma-ban test; comments describe output                           | Taste          | P5                                    | Codex: retired constraint must not become policy                      | keep + reword             |
| 9   | CEO    | N1 PR body names lost lint + replacement slot                                            | Mechanical     | P1                                    | disclosure                                                            | silent loss               |
| 10  | CEO    | N3 lockfile diff review; N4 staged check                                                 | Mechanical     | P1                                    | cheap verification                                                    | none                      |
| 11  | Design | DES-1 keep two layout-intent comments                                                    | Mechanical     | P5                                    | both design voices                                                    | delete all reasons        |
| 12  | Design | DES-2 className comment-only diff check                                                  | Mechanical     | P1                                    | proves no UI change                                                   | none                      |
| 13  | Design | DES-5 QA checklist line DECLINED                                                         | Mechanical     | P4                                    | covered by CEO-N1 + /CLAUDE.md QA rule                                | new checklist line        |
| 14  | DX     | Persona = AI coding agent; mode DX POLISH; TTHW target Champion                          | Mechanical     | override/P6                           | agents do the contributor work                                        | other personas            |
| 15  | DX     | DX-1 README lint-scope sentence                                                          | Mechanical     | P1                                    | both DX voices                                                        | PR-only note              |
| 16  | DX     | DX-2 README Node 24.20.0 → 26.12.1                                                       | Mechanical     | repo TODO rule                        | measured drift vs mise.toml/CI                                        | leave drift               |
| 17  | DX     | DX-3 lockfile abort rule; DX-4 file-based allow-list; DX-5 pull note                     | Mechanical     | P1/P5                                 | cheap, evidenced                                                      | none                      |
| 18  | DX     | DX-6 fresh-checkout doc restructure DECLINED                                             | Taste          | P3/P5                                 | docs/headless-development.md:27-29 already documents it; out of scope | restructure docs          |
| 19  | Eng    | Structure = original arrangement (scope accepted as-is)                                  | Mechanical     | plan-eng-review-structure auto-decide | no smaller arrangement keeps scope                                    | smaller arrangement       |
| 20  | Eng    | ENG-1..5 verification tightenings                                                        | Mechanical     | P1/P5                                 | native eng findings                                                   | none                      |
| 21  | Eng    | ENG-7 arbitrary-px guard test DECLINED                                                   | Mechanical     | P4/P5                                 | CEO-C1/C3                                                             | add test                  |

## GSTACK REVIEW REPORT

| Review         | Trigger                                         | Why                             | Runs | Status                 | Findings                                                                                                                                                                                              |
| -------------- | ----------------------------------------------- | ------------------------------- | ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEO Review     | `/plan-ceo-review` (via /autoplan)              | Scope & strategy                | 1    | CLEAR (not yet logged) | 4 proposals, 1 accepted, 0 deferred                                                                                                                                                                   |
| Outside Review | codex (autoplan CEO + Design + DX + Eng phases) | Independent 2nd opinion         | 4    | completed              | CEO: 2 findings; 2 resolved. Design: 1 finding; 1 resolved. DX: 3 findings; 3 resolved (1 declined with evidence). Eng: 0 findings — completed review (attempts 1-2 unverified, format). 0 unresolved |
| Eng Review     | `/plan-eng-review` (via /autoplan)              | Architecture & tests (required) | 1    | CLEAR (not yet logged) | 1 issues, 0 critical gaps                                                                                                                                                                             |
| Design Review  | `/plan-design-review` (via /autoplan)           | UI/UX gaps                      | 1    | CLEAR (not yet logged) | score: 7/10 → 10/10, 2 decisions                                                                                                                                                                      |
| DX Review      | `/plan-devex-review` (via /autoplan)            | Developer experience gaps       | 1    | CLEAR (not yet logged) | score: 5/10 → 8/10, TTHW: 2 steps → 1 step                                                                                                                                                            |

- **OUTSIDE COVERAGE:** codex, phase ceo, completed, 2 findings resolved; codex, phase design, completed, 1 finding resolved; codex, phase dx, completed, 3 findings (2 accepted, 1 declined); codex, phase eng, completed on attempt 3 (attempts 1-2 unverified: untagged_review), 0 findings.
- **CROSS-MODEL:** CEO: overlap on C2 being cosmetic; codex alone V1; native alone N1/N3/N4. Design: both DES-1; native alone DES-2. DX: both DX-1; codex alone DX-2 and DX-6; native alone DX-3..5. Eng: both judge the architecture sound; native alone the verification tightenings ENG-1..5.
- **VERDICT:** CEO + DESIGN + DX + ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
