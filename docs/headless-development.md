# Development without taking over the Mac

## Desktop states in two commands

The desktop editor and Settings run from bundled files, so their states need no
dev server, database, Clerk account or running Electron window. From a fresh
worktree with dependencies installed:

```sh
pnpm electron:build:ts
pnpm qa:offline-editor --fixture local-only --screenshots .gstack/qa-reports/desktop
```

The second command starts the fixture on a temporary synthetic workspace, renders
it at 320x300, 360x380 and 600x700 through the isolated `qa:browser` session,
writes `<state>-<w>x<h>.png` plus `manifest.json`, and exits. A manifest entry:

```json
{
  "state": "local-only",
  "width": 320,
  "height": 300,
  "file": "local-only-320x300.png",
  "readyText": "Saved on this Mac"
}
```

Interactive variant: read the URL from the JSON first line instead of copying it.

```sh
pnpm qa:offline-editor --fixture signed-out > .gstack/fixture.json &
pnpm qa:browser open "$(head -n1 .gstack/fixture.json | jq -r .url)"
pnpm qa:browser snapshot
kill "$(jq -r .pid .gstack/fixture.json)"; pnpm qa:browser close
```

`pnpm` reports any failed script as exit 1; the stderr line carries the stable code
(`FIXTURE_UNKNOWN`, `FIXTURE_BUILD_MISSING`, `FIXTURE_WORKER_FAILED`,
`FIXTURE_STATE_TIMEOUT`, `FIXTURE_BROWSER_MISSING`), and running the script with
`pnpm --filter @corelive/desktop exec tsx scripts/<name>.ts` returns the exact
status (2, 3, 4, 5, 6). If Chromium is missing: `pnpm exec playwright-cli install-browser chromium`.

| Command                                   | Fixtures, states or views                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm qa:offline-editor --fixture <name>` | `local-only` (default), `signed-out` (detached: save line only), `session-expired` (DA2 sign-in prompt), `attached`, `recovery`; `all` with `--screenshots`                                                                                                                                                    |
| `pnpm qa:settings` (`?state=<name>`)      | `account-never-attached` (default), `account-attached`, `account-signed-out`, `account-other-account`, `connect-confirm`, `connect-uploading`, `signout-confirm`, `signout-running`, `signout-residual`, `signin-offline`, `signin-unreachable`, `sync-details-empty`, `sync-details-rows`, `category-refusal` |
| `pnpm qa:web` (`?view=<name>`)            | `home` (default), `appearance` (the web dashboard Appearance)                                                                                                                                                                                                                                                  |
| `pnpm benchmark:offline`                  | Workspace write latency; see the [offline guide](offline-liveeditor.md#recipes)                                                                                                                                                                                                                                |

Each takes `--help` (exit 0, no build needed) and prints one JSON line
(`{"fixture","url","pid","data"}`, `{"url","pid","states"}` or `{"url","pid","views"}`)
once it is serving. A timed cold and warm run of the two commands is recorded in
each PR (`/usr/bin/time -p`; target: 5 minutes at most).

Use the web app and an isolated, headless Playwright CLI session for routine
development and renderer QA. The CLI is a development tool, not a login E2E suite.
Do not repeatedly authenticate real accounts to test local rendering, IPC contracts,
or error handling. Development Clerk results do not prove Production Clerk behavior.

## Owner instruction — 2026-11-03 (isolated dev instance QA)

When native behavior must be checked while the owner is working, QA an isolated
dev instance through agent-desktop's semantic accessibility (AX) actions only: no
`--headed`, no physical input, no focus changes, a fresh `--user-data-dir`, and
headless fixtures for everything else. Any dev or QA Electron run claims the
`corelive://` handler, so after every such run restore it to `com.corelive.app`,
verify it with `NSWorkspace URLForApplicationToOpenURL` (it must name
`com.corelive.app`), and record that verification in the QA report. This is
mandatory, not optional.

## Current QA authorization — 2026-10-07

The owner authorized completing this migration without a VM. Use Headless browser
QA, CLI checks, native contract/integration tests, and unsigned packaging. Do not
start or recreate a VM for this task, and do not substitute host GUI operation.
The VM instructions and dated native results below remain historical setup and
verification records; they are not current requirements or proof of new changes.

## Start the environment

The workspace uses TypeScript 7 for application type checks and Next.js builds.
`.pnpmfile.cjs` gives compiler-API consumers (including typescript-eslint) their
own TypeScript 6 dependency until those tools support the native API.
The Electron loader fixture uses `@typescript/typescript6` for transpilation.
`scripts/typescript-toolchain.test.ts` verifies the native compiler and the
private compiler APIs together. Keep the hook in dependency installation inputs.
Each concurrent Vitest suite uses its own filesystem module cache to avoid
clearing another suite's transformed modules.

For a fresh checkout, copy `.env.example` to `apps/web/.env` and provide the Web
configuration. For an existing root `.env`, the setup helper below copies it
without overwriting app files and keeps signing credentials in desktop only.

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm exec playwright-cli install-browser chromium
pnpm dev
```

Web configuration lives in `apps/web/.env`; the root env helper copies an existing
root `.env` without overwriting app configuration. Generated assets come from
`assets/` and are written to each app by its prebuild hook. Desktop packaging uses
`apps/desktop/.env` and emits `apps/desktop/dist/`.

In a second terminal:

```sh
pnpm qa:browser open
pnpm qa:browser snapshot
pnpm qa:browser screenshot
pnpm qa:browser close
```

`open` defaults to the public landing page `http://localhost:4991/`. Start Next.js
alone for ordinary development; `pnpm dev` does not start Electron. The wrapper
uses the repo-local CLI, explicit headless Chromium, an in-memory profile, and a
session name derived from the absolute checkout path. Sibling worktrees therefore
get different browser sessions. It removes inherited Playwright MCP connection and
profile settings, `PWDEBUG` (including npm aliases), remote Selenium settings,
and session overrides from the child environment. The browser closes after five idle
minutes. Explicitly close it when the work is done.

Put the command first and any command-specific options after it, such as
`pnpm qa:browser snapshot --json`. `open` accepts only an optional URL. The wrapper
allows an explicit set of page commands and rejects headed mode, attaching to an
existing browser, opening the dashboard, custom profiles/configuration, and
commands that stop every browser.
These would defeat this workflow's desktop or session isolation. A browser's
Playwright `press`/`click` operates inside that headless browser; it does not use
System Events, move the Mac pointer, or type into the foreground application.
The wrapper is a workflow guard, not a sandbox for arbitrary `run-code` scripts.
Do not use those scripts to launch additional browsers or operate the host.

## Operate the page and capture motion

Read a fresh snapshot before using its element references. For example, replace
`e12` with the current reference of the landing page's **Login** link:

```sh
pnpm qa:browser snapshot
pnpm qa:browser click e12
pnpm qa:browser snapshot
pnpm qa:browser goto http://localhost:4991/write   # redirects to /home, then /login while signed out
```

Writing happens only in the desktop app; exercise the LiveEditor renderer through
`pnpm qa:offline-editor` below.

Screenshots, snapshots, and CLI artifacts go under the ignored
`.gstack/headless-browser/` directory. Record a dynamic flow rather than infer its
motion from still images:

```sh
pnpm qa:browser video-start .gstack/headless-browser/editor.webm
# Exercise the relevant page controls.
pnpm qa:browser video-stop
ffmpeg -i .gstack/headless-browser/editor.webm \
  -fps_mode passthrough .gstack/headless-browser/frame_%04d.png
pnpm qa:browser close
```

Extract every recorded frame (`-fps_mode passthrough`). Sampling with `-vf fps=2`
misses any transition shorter than 500 ms, such as the 200 ms theme crossfade.

Inspect the extracted frames. Renderer video does not include Cocoa chrome,
macOS menu bars, the Dock, or native dialogs. Keep private account data out of
shared artifacts. Do not import the owner's Chrome or Electron profile.

## Isolated native renderer and Settings fixtures

```sh
pnpm electron:build:ts
pnpm qa:offline-editor --fixture attached      # prints the JSON first line
pnpm qa:browser open http://127.0.0.1:<port>   # the "url" field

pnpm qa:settings                               # then ...?state=signout-confirm
pnpm qa:web                                    # then ...?view=appearance
```

The offline fixture serves the built renderer and the real workspace worker against
a temporary synthetic v2 device workspace. It injects a test-only preload bridge for
save failure, delayed acknowledgement, sync state and preference changes.
`pnpm qa:settings` serves the built bundled `settings.html`
(`corelive-editor://app/settings.html` in the app) with a stubbed
`window.settingsAPI` under a `connect-src 'none'` policy, so it can make no network
request. `pnpm qa:web` serves the web Home sidebar and Completed card against an
in-page fake oRPC router, and the web `/settings` Appearance section. None launches
Electron, reads an owner profile, authenticates, or sends completion records to
production. The web Vite server disables env-file loading. All listen only on
loopback and are outside production bundle entries. Stop each server with SIGTERM
(Ctrl-C); the offline helper closes its worker and deletes its temporary workspace.
Save videos and screenshots under the ignored `.gstack/` directory; fixture
results establish renderer behavior, not native OS interaction.

## Coverage boundaries

| Surface                                                           | Routine method                                      | What the evidence proves                                       |
| ----------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Desktop editor, Settings and Sync details states, layout, motion  | `qa:offline-editor`, `qa:settings` + headless CLI   | Actual browser renderer behavior against a synthetic workspace |
| React settings, signed-in placeholders, recoverable errors        | Component tests; headless page fixtures when needed | UI behavior and local boundaries, not provider authentication  |
| Main-process logic and typed preload/IPC                          | Existing Electron unit/integration tests            | The tested contracts; no claim of a real Cocoa interaction     |
| Actual menu, tray, Dock, traffic lights, global shortcuts, Spaces | A dedicated macOS VM or separate test Mac           | Native behavior in that isolated environment                   |
| Production Clerk or distribution-specific behavior                | A narrowly scoped explicit validation when needed   | Only the exact production scenario exercised                   |

Keep `pnpm validate` and focused `pnpm test:electron`/database checks. There is no
login E2E test runner, authentication loop, or new E2E CI job in this setup.

### Bundled offline editor

The desktop editor loads packaged renderer assets and uses the device workspace's
storage worker. Use synthetic workspace fixtures for renderer and IPC
checks; never copy the owner's profile or use their session for refresh tests.
Inspect the packaged renderer, worker and both standalone offline preloads in
addition to the native contract tests. Record completion, Undo, save failure and
recovery navigation, then inspect extracted frames.

The [offline LiveEditor guide](offline-liveeditor.md) covers the device workspace,
connecting an account, completion synchronization, export/recovery, backup,
downgrade round trip, error codes and retention.
Its release order is the verified additive database migration, then Web/API
deployment, then desktop publication.
Run `pnpm benchmark:offline` under the pinned runtime
for reproducible synthetic volume measurements; distinguish worker acknowledgement
latency from renderer input latency and native startup latency.

## Why accessory mode is insufficient

Electron's `app.setActivationPolicy('accessory')` removes the Dock icon and menu
bar, but the application can still activate programmatically or through a window
click. CoreLive already uses accessory mode for the persisted Hide App Icon
setting. It does not isolate the keyboard, global shortcuts, tray, LaunchServices
protocol handler, notifications, or window focus from the current macOS session.

`showInactive()` can display a window without initially focusing it, while
`show: false` and offscreen rendering can support renderer checks. Neither creates
a second desktop. Hidden windows normally throttle timers/animation; disabling
that throttling changes a real runtime condition. Modifying all show/focus calls,
disabling native integration, or replacing native dialogs would produce a
different test application. Do not call that complete native QA.

## Where Hammerspoon helps

Hammerspoon can identify a target by PID or bundle ID, inspect native windows and
menus, perform AX menu actions, and direct keyboard events to a particular app.
Prefer exact identity over name searches. This is more precise than moving the
host pointer, but it still operates in the same logged-in desktop. Menu callbacks
can show/focus windows; menu availability can depend on focus. Global event taps
and synthetic shortcuts are not independent of the host input session.

Use Hammerspoon as a native driver **inside a dedicated QA VM**, or for read-only
inspection on the host. Do not load an agent's automation into the owner's
`~/.hammerspoon/init.lua`, reload their configuration, or use global mouse/key
events while they work. Hammerspoon is already installed on this machine; no
host Hammerspoon configuration was changed for this setup.

## Isolate native QA

Apple-silicon macOS supports macOS guests through Apple's Virtualization
framework. Two practical runners are Lume and Tart:

| Runner | Quiet launch                                                   | Native operation channel                 | Setup status                                         |
| ------ | -------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Lume   | `lume run corelive-qa --detach --display none`                 | Guest SSH plus guest VNC/computer driver | Documented option; not installed or provisioned here |
| Tart   | `tart run corelive-qa --no-graphics --no-audio --no-clipboard` | Guest agent commands and loopback VNC    | Provisioned and verified on 2026-10-02               |

These examples assume an already provisioned guest. `--display none`/`--no-graphics`
hides the host viewer; the guest still has its own desktop. For GUI automation,
retain a guest display and automation channel. Lume's `--vnc disabled` would remove
that channel, so it is appropriate only for SSH-only work. Tart's plain `--vnc`
can open the host Screen Sharing viewer; combine it with `--no-graphics` if using
that mode. Do not open a viewer or enable clipboard/audio integration on the host.

Provision the guest with its own user, disposable data, app/profile, local test
database, Node/pnpm and Hammerspoon or another guest native driver. Transfer only
the source/build required for QA. Keep `corelive://` registration and shortcuts
inside the guest. Do not copy the owner's browser cookies or macOS credentials.
Connect the automation driver to the guest explicitly: the current desktop CUA
binding still targets the host and does not automatically control a new VM.

VMs do not establish physical-hardware equivalence for every display/Spaces,
sleep/wake, accessibility permission or update/signing condition. Track those
limits separately. A Linux container/Xvfb or headless Chromium cannot prove native
macOS menu/tray behavior. An additional Space, monitor, hidden window, or another
profile does not provide desktop isolation.

## Sources checked on 2026-10-02

- [Playwright CLI configuration and sessions](https://github.com/microsoft/playwright-cli#configuration-file)
- [Playwright Electron automation and native dialogs](https://playwright.dev/docs/api/class-electron)
- [Electron activation policies](https://www.electronjs.org/docs/latest/api/app#appsetactivationpolicypolicy-macos)
- [Electron BrowserWindow visibility and throttling](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)
- [Hammerspoon application API](https://www.hammerspoon.org/docs/hs.application.html)
- [Hammerspoon targeted keyboard API](https://www.hammerspoon.org/docs/hs.eventtap.html)
- [Lume display, VNC, and detach options](https://cua.ai/docs/lume/reference/cli/vms)
- [Tart quiet launch implementation](https://github.com/cirruslabs/tart/blob/main/Sources/tart/Commands/Run.swift)
- [Tart guest setup and SSH](https://tart.run/quick-start/)

## Verified local native environment

Tart 2.32.1 and the `corelive-qa` guest are preserved outside disposable worktrees
under `~/.local/share/corelive-qa`. The guest runs macOS 26.6.2 with two CPUs and
4096 MiB of memory. It has its own user and a QA-only CoreLive build. Rebuild and
transfer the application when source changes; the installed guest build is a
snapshot, not a live checkout.

From a terminal, start the existing guest without opening a viewer:

```sh
export TART_HOME="$HOME/.local/share/corelive-qa/vms"
CORELIVE_TART="$HOME/.local/share/corelive-qa/tart/2.32.1/tart.app/Contents/MacOS/tart"
"$CORELIVE_TART" run corelive-qa --no-graphics --no-audio --no-clipboard \
  --dir="qa:$HOME/.local/share/corelive-qa/share"
```

Use a second terminal with the same variables to execute guest commands or stop
the VM. The preinstalled Tart guest agent does not require an SSH login:

```sh
"$CORELIVE_TART" exec corelive-qa /usr/bin/sw_vers
"$CORELIVE_TART" stop corelive-qa
```

For a native GUI driver, add `--vnc-experimental` to the quiet launch. In the
verified run this bound to `127.0.0.1` and printed a password-bearing VNC URL;
keep that URL private and use a programmatic VNC client rather than opening a
host viewer. Guest System Events/AX and guest screen recording were exercised
through `tart exec`. Permission dialogs were handled inside the guest.

The 2026-10-02 maintenance source build passed show/hide checks through the actual Window
menu, tray menu and Alt+Space: six native operations, with a 20-second guest
recording whose frames were inspected. It also passed native updater checks for
Later postponement, preserving active progress, and reopening the Restart prompt
without rechecking a prepared update. That 19.985-second recording was inspected.
The renderer was a clearly labeled local Clerk-free fixture, and update transport
was synthetic: no provider sign-in or binary download was performed. Actual web
components and recovery/update transitions were separately verified headlessly.

One launch attempt hit the macOS VM limit while two unrelated guests were running.
They were left alone; the final run started after a slot became free. Native AX
tray-item clicks did not reliably end menu tracking, so the final check selected
the observed menu item with guest-local arrow/Return keys. No host input was used.

Transfer `.app` bundles as tar archives and extract them on the guest filesystem.
A direct `ditto` across the virtiofs share failed on framework symlinks in this
environment; the resulting incomplete app failed at launch. Archive transfer
restored the framework and the subsequent native checks passed. The official
Tart release archive was installed after the Homebrew formula failed a Homebrew
compatibility check; its SHA-256 and code signature were verified.

The VM is stopped after QA to release its CPU and memory. Hammerspoon remains an
optional guest driver; no host Hammerspoon configuration was changed.

See the [maintenance QA record](qa/todos-zero-2026-10-02.md) for the verified
checks, intentional triage, and evidence boundaries.
