# How to cut a macOS release

Ship a new signed + notarized CoreLive desktop build to a GitHub Release. The entire pipeline is driven by **pushing a lightweight `v*` git tag** — you bump the version, validate, smoke-test, tag, and then **verify the published assets**. CI does the signing, notarizing, and publishing; you never run a publish command locally.

This recipe assumes you have done the [Getting Started tutorial](./tutorial-getting-started.md) and can run the [local dev + test loop](./howto-local-dev-and-tests.md). For the _why_ behind the two-phase notarization and the CI topology, see [Why the build & CI topology looks the way it does](./explanation-build-and-ci.md).

## Hard rules (read these first)

These four mistakes are the easy ways to ship a broken release. None of the steps below violate them — but if you improvise, don't:

| Rule                                                             | Why                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Never run `pnpm electron:publish`**                            | It is `electron-builder --publish=always` (`package.json:61`) — it would double-publish _and_ skip the `finalize-mac-release-artifacts.js` step that the release depends on. Releases go through the tag → CI path, period. |
| **The generic `/electron-release` skill does NOT fit this repo** | This flow is a manual tag push that fires GitHub Actions. Cut releases by hand using the steps below.                                                                                                                       |
| **Tag must be LIGHTWEIGHT** (`git tag vX.Y.Z`, no `-a`/`-m`)     | The workflow triggers on `refs/tags/v*` (`.github/workflows/build-and-release.yml:4-6`); all prior tags are lightweight.                                                                                                    |
| **Stage with `git add package.json`, NEVER `git add -A`**        | The working tree carries tracked build/icon files that get regenerated; `git add -A` would sweep tracked deletions into your release commit.                                                                                |

## Prerequisites (one-time, mostly already done)

The standard flow needs **zero Apple credentials on your machine** — signing and notarization happen in the `build` job on a `macos-latest` runner, consuming **GitHub Secrets**.

These Secrets must exist on the repo (set once; see [`docs/BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) for the cert → `.p12` → base64 export procedure):

- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — notarization (used by `scripts/notarize.js` and `scripts/finalize-mac-release-artifacts.js`)
- `APPLE_CERTIFICATES_P12`, `APPLE_CERTIFICATES_PASSWORD` — the "Developer ID Application" signing cert, imported at `.github/workflows/build-and-release.yml:75-80`
- The Clerk + Postgres Secrets the `next build` step needs (`.github/workflows/build-and-release.yml:51-70`)

> Local Apple creds in `.env` only matter if you hand-run `pnpm electron:build:mac` for a local dry run — which this flow does **not** do.

---

## Step 1 — Bump the version

`package.json` `version` is the **single source of truth**. `electron-builder.json` inherits it (no `build` key, no separate changelog to touch).

Edit `package.json:3` to the new version, e.g. `0.9.0` → `0.9.1`. Nothing else.

## Step 2 — Validate under the CI Node version

Run the full gate, pinned to the CI Node so you reproduce CI exactly. Local Node (26) differs from CI (24.13.0) in ways that break tests — see [the local dev loop doc](./howto-local-dev-and-tests.md) for the `localStorage` gotcha.

```bash
mise exec node@24.13.0 -- pnpm validate
```

`pnpm validate` (`package.json:40`) runs six gates in parallel and aborts on the first failure: test + the in-repo `eslint-plugin-dslint` package tests (`test:packages`) + lint + `next build` + typecheck + theme-drift check. All six must be green before you tag.

> The `next build` inside `validate` needs the Clerk env vars in your `.env`; see the env tables in [`README.md`](../../README.md).

## Step 3 — Manual macOS smoke (mandatory before tagging)

The Linux + xvfb E2E suite drives the **renderer only**. The native Cocoa chrome — menu bar, system tray, dock / activation policy, traffic-light window controls, `open-url` deep links, vibrancy, the floating / braindump / startup-pill windows — has **no automated coverage**. A packaged build also exposes packaged-only bugs (e.g. `NODE_ENV` is unset in a packaged app, and electron-builder + pnpm can drop leaf asar deps) that never reproduce in `electron:dev`.

So build the real packaged app and exercise the native surfaces by hand:

```bash
pnpm electron:build:dir
open dist/mac*/CoreLive.app   # mac* glob: --dir builds your host arch (mac-arm64 on Apple Silicon, mac on Intel)
```

Click through: menu bar items (and the menu-bar toggle), the tray menu, dock show/hide, the traffic-light buttons, and a `corelive://` deep link. Verify window/menu motion by recording video frames, not stills.

## Step 4 — Commit the bump to `main`

```bash
git add package.json
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main
```

> Pushing the bump commit to `main` does **not** trigger a release — a non-tag push to `main` does nothing here. Only the tag in the next step fires the pipeline. `main` is unprotected, so committing directly is expected.

## Step 5 — Tag and push (this ships to real users)

The tag push is the point of no return: it builds, signs, notarizes, and **publishes a release users auto-update from**. Push it only after Steps 2–3 are green and you (or Raphtalia) have confirmed.

```bash
git tag vX.Y.Z            # LIGHTWEIGHT — no -a, no -m
git push origin vX.Y.Z
```

This fires `build-and-release.yml`. On a tag push the release dependency chain (`test` → `build` → `release`) runs (`.github/workflows/build-and-release.yml`):

1. **`test`** (ubuntu): typecheck → unit tests → icon gen → electron tests.
2. **`build`** (macos): `next build` → import signing cert → `pnpm electron:build:mac`. That script (`package.json:59`) does `electron-vite build` → `electron-builder --mac --publish never` → `node scripts/finalize-mac-release-artifacts.js`. **`--publish never` means electron-builder does not upload** — uploading is a separate job. The `.app` is notarized inside electron-builder via the `afterSign` hook (`electron-builder.json:106` → `scripts/notarize.js`); the **DMG wrapper** is notarized + stapled _separately_ by the finalize script, which then rewrites `latest-mac.yml` + `checksums.json` from the post-staple bytes.
3. **`release`** (ubuntu, tag-only): downloads the artifacts and runs `gh release create`/`upload` (`.github/workflows/build-and-release.yml:142-146`).

A parallel **`security-scan`** job (Trivy filesystem scan → SARIF upload, `.github/workflows/build-and-release.yml:148-172`) runs on every event — including this tag push — but it is release-irrelevant and has no `needs:` link to the chain above.

> Two notarization passes and the manifest rewrite are explained in [Why the build & CI topology looks the way it does](./explanation-build-and-ci.md) — don't worry about the mechanics here.

## Step 6 — VERIFY the release (workflow-green is not enough)

A green workflow does not prove the release is shippable. Check **both** the asset set and the auto-update manifest version.

### 6a. Exactly 8 assets

```bash
gh release view vX.Y.Z --json isDraft,assets \
  --jq '{draft: .isDraft, count: (.assets | length), names: [.assets[].name]}'
```

`draft` must be `false` and `count` must be **8**:

| Asset                                                                                | Count | Note                                                   |
| ------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------ |
| `CoreLive-X.Y.Z.dmg`, `CoreLive-X.Y.Z-arm64.dmg`                                     | 2     | DMGs — **no `.dmg.blockmap`** (intentional, see below) |
| `CoreLive-X.Y.Z-mac.zip` + `.blockmap`, `CoreLive-X.Y.Z-arm64-mac.zip` + `.blockmap` | 4     | ZIPs **with** their blockmaps                          |
| `latest-mac.yml`                                                                     | 1     | auto-update manifest                                   |
| `checksums.json`                                                                     | 1     | manual-download hashes                                 |

**The DMG blockmaps are absent on purpose — this is not a failed upload.** Stapling the notarization ticket mutates the DMG bytes _after_ electron-builder generated the blockmap, so `finalize-mac-release-artifacts.js` deletes the stale `.dmg.blockmap` files (`removeDmgBlockmaps`, `scripts/finalize-mac-release-artifacts.js:172-179`). The asset count is therefore **8, not 10**.

### 6b. `latest-mac.yml` version matches the tag

If `latest-mac.yml`'s `version:` field is stale or missing, **auto-update silently breaks** for existing users.

```bash
gh release download vX.Y.Z --pattern latest-mac.yml --dir /tmp/rel --clobber
grep '^version:' /tmp/rel/latest-mac.yml   # must print: version: X.Y.Z
```

The finalize script writes this field from `package.json`'s version (`scripts/finalize-mac-release-artifacts.js:199-211`), so a mismatch means the wrong build was published.

## Rollback

If verification fails (wrong assets, version mismatch, or a bad build slipped through), delete the release and its tag, fix, and re-cut:

```bash
gh release delete vX.Y.Z --cleanup-tag --yes
```

---

## See also

- [Why the build & CI topology looks the way it does](./explanation-build-and-ci.md) — the _why_ of two notarizations, the per-spec web matrix, and `workers: 1`.
- [`docs/BUILD_AND_DEPLOYMENT.md`](../BUILD_AND_DEPLOYMENT.md) — signing-cert setup, GitHub Secrets, the auto-updater, and signing troubleshooting. **Stale in two ways**, flagged here so you don't trip on it: its prerequisites say Node 22.21.1 / pnpm 10.27.0 — the actual toolchain is **Node 24.13.0** (`package.json` `volta`) / **pnpm from `package.json` `packageManager`** (currently 10.33.4); and it predates `finalize-mac-release-artifacts.js`, so it omits the **DMG-notarize + manifest-rewrite** phase described above (which is why DMG blockmaps are dropped and the asset count is 8).
- [How to run the local dev + test loop](./howto-local-dev-and-tests.md) — `pnpm validate` details and the CI-Node parity gotcha.
- The full command surface lives in `package.json` `scripts` — that is the canonical command list.
