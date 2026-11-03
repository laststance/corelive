import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'

import {
  exitWithFixtureError,
  parseFixtureArgs,
  requireBuiltFile,
  ScreenshotSession,
} from './qa-fixture-cli'
import { listenOnLoopback, serveBuiltFile } from './qa-fixture-server'
import {
  SETTINGS_FIXTURE_STATES,
  SETTINGS_STATE_NAMES,
} from './qa-fixture-states'

const COMMAND = 'qa:settings'
const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
// QA_FIXTURE_DIST lets tests point the build preflight at a missing directory.
const ASSETS = join(
  process.env.QA_FIXTURE_DIST ?? join(repo, 'apps/desktop/dist-electron'),
  'renderer',
)

const HELP = `pnpm ${COMMAND} - isolated headless fixture of the bundled Settings window (no Electron window, no account, no network).

Usage: pnpm ${COMMAND} [--screenshots <dir>] [--help]

Serves the built apps/desktop/dist-electron/renderer/settings.html with a stubbed window.settingsAPI.
Pick a state with ?state=<name> on the printed URL (default ${SETTINGS_STATE_NAMES[0]}):
${SETTINGS_FIXTURE_STATES.map((state) => `  ${state.name.padEnd(24)} ${state.description}`).join('\n')}

An unknown state renders a role="alert" message and sets
window.__settingsFixture.error = { code: 'FIXTURE_STATE_UNKNOWN', valid }.

Options:
  --screenshots <dir>  Render every state at 320x300, 360x380 and 600x700 through qa:browser,
                       write <dir>/<state>-<w>x<h>.png and <dir>/manifest.json, then exit.
  --help               Print this text and exit 0 (needs no build).

Stdout: one JSON line {"url","pid","states":[...]} once the server listens. Diagnostics go to stderr.
Exit codes: 2 unknown argument, 3 build missing (pnpm electron:build:ts), 5 state timeout,
6 headless Chromium missing.

Example:
  pnpm ${COMMAND}, then pnpm qa:browser open "<url>?state=signout-confirm"
  pnpm ${COMMAND} --screenshots .gstack/qa-reports/desktop-settings
`

/**
 * Builds the in-page script that installs `window.settingsAPI` and drives the chosen state.
 *
 * The script is plain JavaScript because it runs before the bundled module in the browser. It
 * receives the state list as JSON, so the names stay the single exported list (EA16).
 *
 * @returns The `qa-bridge.js` source.
 * @example const source = bridgeSource()
 */
function bridgeSource(): string {
  const settings = UserSettingsStateSchema.parse({})
  return `
const STATES = ${JSON.stringify(SETTINGS_FIXTURE_STATES)};
const SETTINGS = ${JSON.stringify(settings)};
const GENERAL = {id:'00000000-0000-4000-8000-000000000001',name:'General',color:'blue',isDefault:true,parentId:null,removed:false,historical:false,fieldRevisions:{name:0,color:0,parentLocalId:0}};
const requested = new URLSearchParams(location.search).get('state');
const name = requested ?? STATES[0].name;
const spec = STATES.find((state) => state.name === name);
const fixture = (window.__settingsFixture = { state: name, error: null, driven: false });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (!spec) {
  const valid = STATES.map((state) => state.name);
  fixture.error = { code: 'FIXTURE_STATE_UNKNOWN', valid };
  document.addEventListener('DOMContentLoaded', () => {
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'Unknown fixture state "' + name + '". Valid: ' + valid.join(', ');
    document.body.appendChild(alert);
  });
} else {
  let account = { state:'never-attached', boundEmail:null, signedInEmail:null, waitingCount:0, needsALookCount:0, lastSyncedAt:null, pendingConnect:null, firstUpload:null, signIn:'idle', ...spec.account };
  const stored = { revision: 1, settings: SETTINGS, theme: 'system' };
  const listeners = new Set();
  const emit = () => { for (const listener of listeners) listener(); };
  const done = async (result) => {
    account = { ...account, state: 'signed-out' };
    emit();
    return result;
  };
  const afterSignOut = () => spec.signOut === 'pending' ? new Promise(() => {}) : done(spec.signOut ?? { status: 'signed-out' });
  window.settingsAPI = {
    version: 1,
    platform: 'darwin',
    snapshot: async () => ({ phase:'ready', generation:1, preferences: structuredClone(stored), categories:[GENERAL], account }),
    onChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    preferences: { patch: async (_generation, command) => {
      if (command.expectedRevision !== stored.revision) return { ok:false, reason:'revision-conflict' };
      Object.assign(stored.settings, command.patch);
      if (command.theme !== undefined) stored.theme = command.theme;
      stored.revision++;
      return { ok:true, generation:1, preferences: structuredClone(stored) };
    } },
    categories: { command: async () => ({ ok:true, generation:1, revision:2, workspace:null }) },
    account: {
      status: async () => account,
      connect: async () => true,
      notNow: async () => ({ status: 'signed-out' }),
      signIn: async () => ({ status: spec.signIn ?? 'opened' }),
      cancelSignIn: async () => {},
      signOut: afterSignOut,
      clearAgain: async () => ({ status: 'signed-out' }),
      acknowledgeFirstUpload: async () => {},
      openDashboard: async () => true,
    },
    syncDetails: async () => ({ rows: spec.rows ?? [], history: [], migrationSummary: null, preservedBackups: [], dashboardOnlyCount: 0 }),
    config: { get: async (_path, fallback) => fallback, set: async () => true, open: async () => true },
    app: { getVersion: async () => '0.0.0' },
    updater: {
      checkForUpdates: async () => true,
      quitAndInstall: async () => true,
      getStatus: async () => ({ updateAvailable:false, updateDownloaded:false, downloadProgress:null, isChecking:false, message:null }),
    },
    settings: {
      setHideAppIcon: async () => true,
      setShowInMenuBar: async () => true,
      setStartAtLogin: async () => true,
      getLoginItemSettings: async () => ({ openAtLogin: false }),
      resetPopoverSize: async () => true,
    },
    floatingPanels: {
      getVisibleOnAllWorkspaces: async () => false,
      setVisibleOnAllWorkspaces: async () => true,
      getLiveEditorAlwaysOnTop: async () => false,
      setLiveEditorAlwaysOnTop: async () => true,
    },
    liveEditor: {
      show: async () => {},
      getOpacity: async () => 1,
      setOpacity: async (value) => value,
      getShortcut: async () => '',
      setShortcut: async () => true,
      getShortcutSecondary: async () => '',
      setShortcutSecondary: async () => true,
    },
  };
  // Click the scripted buttons once the bundled page has rendered them.
  const findButton = async (source) => {
    const pattern = new RegExp(source);
    for (let attempt = 0; attempt < 160; attempt++) {
      const button = [...document.querySelectorAll('button')].find((candidate) => !candidate.disabled && pattern.test((candidate.textContent ?? '').trim()));
      if (button) return button;
      await sleep(50);
    }
    return null;
  };
  window.addEventListener('load', async () => {
    for (const source of spec.drive ?? []) {
      const button = await findButton(source);
      if (!button) break;
      button.click();
      await sleep(150);
    }
    fixture.driven = true;
  });
}
`
}

/**
 * Starts the loopback server for the built Settings document and the bridge (DX2).
 *
 * The CSP is `connect-src 'none'`, so the page cannot make a network request even by mistake.
 *
 * @returns The server and its origin, e.g. `http://127.0.0.1:53000`.
 * @example const { origin } = await startServer()
 */
async function startServer() {
  const bridge = bridgeSource()
  let origin = ''
  const server = createServer(async (request, response) => {
    try {
      // Same-host guard so another local page cannot read the fixture.
      if (
        `http://${request.headers.host}` !== origin ||
        request.method !== 'GET'
      ) {
        response.writeHead(403)
        response.end()
        return
      }
      const path = new URL(request.url ?? '/', origin).pathname
      if (path === '/favicon.ico') {
        response.writeHead(204)
        response.end()
        return
      }
      if (path === '/qa-bridge.js') {
        response.writeHead(200, { 'content-type': 'text/javascript' })
        response.end(bridge)
        return
      }
      if (
        path !== '/' &&
        path !== '/settings.html' &&
        !path.startsWith('/assets/')
      ) {
        response.writeHead(404)
        response.end()
        return
      }
      await serveBuiltFile(
        response,
        ASSETS,
        path === '/' || path === '/settings.html'
          ? 'settings.html'
          : path.slice(1),
        "'none'",
      )
    } catch {
      response.writeHead(500)
      response.end()
    }
  })
  origin = await listenOnLoopback(server)
  return { server, origin }
}

/**
 * Entry point: parse, preflight, then serve the fixture or screenshot every state (DX2, DX3).
 *
 * @throws {@link FixtureCliError} for every contract failure; `exitWithFixtureError` prints it.
 * @example await main()
 */
async function main(): Promise<void> {
  // Parse first: nothing below may run for --help or a bad argument.
  const args = parseFixtureArgs(process.argv.slice(2), COMMAND, {
    fixture: false,
  })
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  await requireBuiltFile(
    COMMAND,
    'built renderer',
    join(ASSETS, 'settings.html'),
  )
  const { server, origin } = await startServer()

  if (args.screenshots) {
    const session = new ScreenshotSession({
      command: COMMAND,
      directory: args.screenshots,
    })
    try {
      await session.open()
      for (const state of SETTINGS_FIXTURE_STATES)
        await session.capture({
          state: state.name,
          url: `${origin}/?state=${state.name}`,
          readyText: state.readyText,
        })
    } finally {
      await session.finish().finally(() => server.close())
    }
    return
  }

  process.stdout.write(
    `${JSON.stringify({ url: `${origin}/`, pid: process.pid, states: SETTINGS_STATE_NAMES })}\n`,
  )
  const stop = (): void => {
    server.close()
    process.exit(0)
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

main().catch(exitWithFixtureError)
