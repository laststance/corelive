# Development without taking over the Mac

Use the web app and an isolated, headless Playwright CLI session for routine
development and renderer QA. The CLI is a development tool, not a login E2E suite.
Do not repeatedly authenticate real accounts to test local rendering, IPC contracts,
or error handling. Development Clerk results do not prove Production Clerk behavior.

## Current QA authorization — 2026-10-07

The owner authorized completing this migration without a VM. Use Headless browser
QA, CLI checks, native contract/integration tests, and unsigned packaging. Do not
start or recreate a VM for this task, and do not substitute host GUI operation.
The VM instructions and dated native results below remain historical setup and
verification records; they are not current requirements or proof of new changes.

## Start the environment

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

`open` defaults to the public `http://localhost:4991/write` page. Start Next.js
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
`e12` with the current textbox reference:

```sh
pnpm qa:browser fill e12 'A small local win'
pnpm qa:browser press Meta+Enter
pnpm qa:browser snapshot
pnpm qa:browser reload
```

Screenshots, snapshots, and CLI artifacts go under the ignored
`.gstack/headless-browser/` directory. Record a dynamic flow rather than infer its
motion from still images:

```sh
pnpm qa:browser video-start .gstack/headless-browser/editor.webm
# Exercise the relevant page controls.
pnpm qa:browser video-stop
ffmpeg -i .gstack/headless-browser/editor.webm \
  -vf fps=2 .gstack/headless-browser/frame_%03d.png
pnpm qa:browser close
```

Inspect the extracted frames. Renderer video does not include Cocoa chrome,
macOS menu bars, the Dock, or native dialogs. Keep private account data out of
shared artifacts. Do not import the owner's Chrome or Electron profile.

## Coverage boundaries

| Surface                                                           | Routine method                                      | What the evidence proves                                      |
| ----------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Public LiveEditor, local persistence, Undo, layout, motion        | Headless CLI                                        | Actual browser renderer behavior with isolated local storage  |
| React settings, signed-in placeholders, recoverable errors        | Component tests; headless page fixtures when needed | UI behavior and local boundaries, not provider authentication |
| Main-process logic and typed preload/IPC                          | Existing Electron unit/integration tests            | The tested contracts; no claim of a real Cocoa interaction    |
| Actual menu, tray, Dock, traffic lights, global shortcuts, Spaces | A dedicated macOS VM or separate test Mac           | Native behavior in that isolated environment                  |
| Production Clerk or distribution-specific behavior                | A narrowly scoped explicit validation when needed   | Only the exact production scenario exercised                  |

Keep `pnpm validate` and focused `pnpm test:electron`/database checks. There is no
login E2E test runner, authentication loop, or new E2E CI job in this setup.

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
