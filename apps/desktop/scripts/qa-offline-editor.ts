import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  WorkspaceCommandSchema,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsPatchSchema } from '@corelive/desktop-contract/settings'
import { z } from 'zod'

import { AtomicWorkspaceFile } from '../electron/offline/AtomicWorkspaceFile'
import { initializeDeviceWorkspace } from '../electron/offline/deviceWorkspaceFixture'
import { WorkspaceWorkerClient } from '../electron/offline/WorkspaceWorkerClient'

import {
  exitWithFixtureError,
  FixtureCliError,
  parseFixtureArgs,
  requireBuiltFile,
  ScreenshotSession,
} from './qa-fixture-cli'
import { listenOnLoopback, serveBuiltFile } from './qa-fixture-server'
import {
  EDITOR_FIXTURE_NAMES,
  EDITOR_FIXTURES,
  type EditorFixtureSpec,
} from './qa-fixture-states'

const COMMAND = 'qa:offline-editor'
const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
// QA_FIXTURE_DIST lets tests point the build preflight at a missing directory.
const DIST =
  process.env.QA_FIXTURE_DIST ?? join(repo, 'apps/desktop/dist-electron')
const ASSETS = join(DIST, 'renderer')
const WORKER_SCRIPT = join(DIST, 'main/workspace-worker.cjs')

const HELP = `pnpm ${COMMAND} - isolated headless fixture of the bundled offline editor (no Electron window, no account).

Usage: pnpm ${COMMAND} [--fixture <name>] [--screenshots <dir>] [--help]

Fixtures (--fixture, default local-only):
${EDITOR_FIXTURES.map((fixture) => `  ${fixture.name.padEnd(11)} ${fixture.description}`).join('\n')}
  all         With --screenshots only: every fixture above, one after another

Options:
  --screenshots <dir>  Render each fixture at 320x300, 360x380 and 600x700 through qa:browser,
                       write <dir>/<fixture>-<w>x<h>.png and <dir>/manifest.json, then exit.
  --help               Print this text and exit 0 (needs no build).

Stdout: one JSON line {"fixture","url","pid","data"} once the worker has opened the workspace and
the server listens. Diagnostics go to stderr. Stop it with SIGTERM.
Exit codes: 2 unknown argument or fixture, 3 build missing (pnpm electron:build:ts),
4 worker failed, 5 state timeout, 6 headless Chromium missing.

Example:
  pnpm ${COMMAND} --fixture signed-out
  pnpm ${COMMAND} --fixture all --screenshots .gstack/qa-reports/desktop
`

/**
 * Completes the first two draft rows so the signed-out fixture holds unsent operations.
 *
 * @param worker - The fixture's already opened workspace worker.
 * @example await seedCompletions(worker)
 */
async function seedCompletions(worker: WorkspaceWorkerClient): Promise<void> {
  for (let index = 0; index < 2; index++) {
    const view = await worker.call('open', null)
    const row = view.draft.rows.find((candidate) => !candidate.completionId)
    if (!row) return
    await worker.call('command', {
      type: 'complete',
      commandId: randomUUID(),
      categoryId: view.selectedCategoryId,
      baseRevision: view.draft.revision,
      rowId: row.id,
      completionId: randomUUID(),
      completedAt: Date.now(),
      timezone: 'Asia/Tokyo',
    })
  }
}

/** Legacy control names of the fixture's `sync` switch, mapped onto the D2 status states. */
const SYNC_CONTROLS = [
  'local-only',
  'offline',
  'idle',
  'syncing',
  'sign-in-required',
] as const
type SyncControl = (typeof SYNC_CONTROLS)[number]
const SYNC_STATE = {
  'local-only': 'local-only',
  offline: 'waiting',
  idle: 'synced',
  syncing: 'syncing',
  'sign-in-required': 'sign-in-to-sync',
} as const
const INITIAL_SYNC: Record<EditorFixtureSpec['name'], SyncControl> = {
  'local-only': 'local-only',
  'signed-out': 'sign-in-required',
  attached: 'idle',
  recovery: 'local-only',
}
const QA_ACCOUNT_ID = 'synthetic-offline-qa'
const QA_EMAIL = 'writer@example.com'
const categories = [1, 2, 3].map((id) => ({
  id,
  name:
    id === 1 ? 'General' : id === 2 ? 'Projects with a long name' : 'Old plans',
  color: 'blue' as const,
  isDefault: id === 1,
  parentId: null,
  removed: false,
}))

/** A started fixture: where to point the browser and how to stop it. */
interface EditorFixtureHandle {
  url: string
  /** The temporary workspace directory (removed by {@link EditorFixtureHandle.close}). */
  data: string
  close: () => Promise<void>
}

/**
 * Starts one headless editor fixture on a v2 device workspace served by the real worker (DX1).
 *
 * Seeds the workspace for `name`, opens it through the worker (so a broken build fails here),
 * then serves the built editor with a stubbed `window.liveEditorAPI` bridge. Called by `main`
 * once, or four times for `--fixture all --screenshots`.
 *
 * @param name - Which scene to prepare.
 * @param paths - Built renderer directory and worker script.
 * @returns The listening URL, temp directory and a closer.
 * @throws {@link FixtureCliError} `FIXTURE_WORKER_FAILED` when the worker cannot open the workspace.
 * @example const fixture = await createEditorFixture('attached', paths)
 */
async function createEditorFixture(
  name: EditorFixtureSpec['name'],
  paths: { assets: string; script: string },
): Promise<EditorFixtureHandle> {
  const { assets, script } = paths
  const data = await mkdtemp(join(tmpdir(), 'corelive-offline-qa-'))
  const actor = () =>
    new WorkspaceWorkerClient({ directory: data, ownerId: 'device', script })
  let worker = actor()
  const bound = name === 'signed-out' || name === 'attached'
  await initializeDeviceWorkspace(data, {
    ...(bound ? { boundAccountId: QA_ACCOUNT_ID, displayEmail: QA_EMAIL } : {}),
    notes:
      name === 'local-only' || name === 'recovery'
        ? {}
        : name === 'signed-out'
          ? { 1: 'A small offline win\nAnother idea' }
          : {
              1: 'A small offline win\nAnother idea',
              2: 'Preserve destination writing',
              3: 'Writing in an old category',
            },
    ...(name === 'attached'
      ? { categoryNames: categories.map((category) => category.name) }
      : {}),
  })
  try {
    if (name === 'recovery') {
      // A second generation creates the recovery copy; then the primary file is corrupted.
      const file = new AtomicWorkspaceFile({
        directory: data,
        ownerId: DEVICE_OWNER_ID,
        fileName: DEVICE_WORKSPACE_FILE_NAME,
        parse: OfflineWorkspaceSchema.parse,
      })
      await file.update((current) => ({
        ...current,
        revision: current.revision + 1,
      }))
      await writeFile(file.path, '{ "corrupt": ')
    } else {
      await worker.call('open', null)
      if (name === 'signed-out') await seedCompletions(worker)
    }
  } catch (error) {
    // Keep a diagnostic outside the temp directory, which is removed below.
    const log = join(tmpdir(), `corelive-qa-worker-${process.pid}.log`)
    await writeFile(
      log,
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    )
    await worker.close()
    await rm(data, { recursive: true, force: true })
    throw new FixtureCliError(
      'FIXTURE_WORKER_FAILED',
      `qa:offline-editor: the workspace worker failed to open the "${name}" fixture (FIXTURE_WORKER_FAILED): ${error instanceof Error && 'reason' in error ? String(error.reason) : 'worker error'}. Worker log: ${log}`,
    )
  }
  let phase: 'ready' | 'recovery' = name === 'recovery' ? 'recovery' : 'ready'
  let sync: SyncControl = INITIAL_SYNC[name]
  let generation = 1,
    fail = false,
    delay = 0,
    clipboard = '',
    hidden = false
  let opacity = 1,
    followsSpaces = false
  const clients = new Set<ServerResponse>()
  const flushes = new Map<string, (saved: boolean) => void>()
  const events: unknown[] = []
  const broadcast = (event: string, value: unknown): void => {
    for (const response of clients)
      response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)
  }
  /** Maps the fixture's legacy control names onto the D2 sync status object. */
  const readySnapshot = async () => {
    const workspace = await worker.call('open', null)
    const state = SYNC_STATE[sync]
    return {
      phase: 'ready' as const,
      generation,
      sync: {
        state,
        waitingCount: workspace.pendingCount,
        lastSyncedAt: null,
        boundEmail: workspace.binding?.displayEmail ?? null,
      },
      workspace,
    }
  }
  const snapshot = async () =>
    phase === 'ready'
      ? await readySnapshot()
      : { phase, generation, canRecover: phase === 'recovery' }
  const publish = async (): Promise<void> =>
    broadcast('changed', await snapshot())
  async function rpc(method: string, args: unknown[]): Promise<unknown> {
    if (method === 'snapshot') return snapshot()
    if (method === 'getOpacity') return opacity
    if (method === 'setOpacity') {
      opacity = Number(args[0])
      return
    }
    if (method === 'getSpaces') return followsSpaces
    if (method === 'setSpaces') {
      followsSpaces = Boolean(args[0])
      return followsSpaces
    }
    if (method === 'retry') {
      await publish()
      return
    }
    if (method === 'syncDetails') return worker.call('syncDetails', null)
    if (method === 'signIn') {
      events.push({ method, args })
      return
    }
    if (method === 'hide') {
      const request = { requestId: randomUUID(), generation }
      const saved = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          flushes.delete(request.requestId)
          resolve(false)
        }, 16000)
        flushes.set(request.requestId, (saved) => {
          clearTimeout(timeout)
          flushes.delete(request.requestId)
          resolve(saved)
        })
        broadcast('flush', request)
      })
      hidden = saved
      events.push({ method, saved })
      return
    }
    if (method === 'replyFlush') {
      const request = args[0] as { requestId: string; generation: number }
      const reply = flushes.get(request.requestId)
      if (!reply || request.generation !== generation) return false
      reply(args[1] === true)
      return true
    }
    if (Number(args[0]) !== generation) throw new Error('account-changed')
    if (method === 'copyWriting') {
      clipboard = String(args[1])
      return true
    }
    if (method === 'previewRecovery')
      return worker.call('previewRecovery', null)
    if (method === 'recover') {
      await worker.call('recover', null)
      phase = 'ready'
      generation++
      await publish()
      return true
    }
    if (method === 'export') {
      await writeFile(
        join(data, 'fixture-export.json'),
        await worker.call('export', null),
      )
      return true
    }
    if (phase !== 'ready') throw new Error('Account locked')
    if (method === 'draft')
      return worker.call('draft', { categoryId: z.uuid().parse(args[1]) })
    if (
      method === 'details' ||
      method === 'undoHistory' ||
      method === 'recoveryCopies'
    )
      return worker.call(method, {
        offset: Number(args[1]),
        limit: Number(args[2]),
      })
    if (method === 'command') {
      if (fail) return { ok: false, reason: 'storage-failed' }
      try {
        const command = WorkspaceCommandSchema.parse(args[1])
        const view = await worker.call('command', command)
        await publish()
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        events.push({
          method,
          type: command.type,
          commandId: command.commandId,
        })
        const { writtenDraft, ...workspace } = view
        return {
          ok: true,
          generation,
          revision: view.revision,
          workspace,
          writtenDraft,
        }
      } catch (error) {
        return {
          ok: false,
          reason:
            error instanceof Error && 'reason' in error
              ? error.reason
              : 'storage-failed',
        }
      }
    }
    throw new Error('Unknown fixture RPC')
  }
  const controlSchema = z
    .object({
      fail: z.boolean().optional(),
      delay: z.number().min(0).max(15000).optional(),
      sync: z.enum(SYNC_CONTROLS).optional(),
      phase: z.enum(['ready', 'recovery']).optional(),
      restart: z.boolean().optional(),
      shown: z.boolean().optional(),
      removeCategory: z.number().int().min(1).max(3).optional(),
      theme: z.string().max(80).optional(),
      settings: UserSettingsPatchSchema.optional(),
      syncNow: z.boolean().optional(),
    })
    .strict()
  async function control(input: z.infer<typeof controlSchema>) {
    if (typeof input.fail === 'boolean') fail = input.fail
    if (typeof input.delay === 'number') delay = input.delay
    if (typeof input.sync === 'string') sync = input.sync
    if (typeof input.phase === 'string') {
      phase = input.phase
      generation++
    }
    if (input.restart) {
      const previous = worker
      await previous.close()
      if (worker === previous) {
        worker = actor()
        generation++
      }
    }
    if (input.shown) {
      hidden = false
      broadcast('shown', null)
    }
    if (input.removeCategory)
      await worker.call('reconcile', {
        accountId: QA_ACCOUNT_ID,
        displayEmail: null,
        categories: categories.filter(
          (category) => category.id !== Number(input.removeCategory),
        ),
        deletions: [
          { sourceId: Number(input.removeCategory), destinationId: 2 },
        ],
      })
    if (input.theme || input.settings) {
      const view = await worker.call('open', null)
      await worker.call('command', {
        type: 'preferences',
        commandId: randomUUID(),
        expectedRevision: view.preferences.revision,
        patch: UserSettingsPatchSchema.parse(input.settings ?? {}),
        ...(input.theme ? { theme: String(input.theme) } : {}),
      })
    }
    if (input.syncNow) {
      sync = 'syncing'
      await publish()
      const pending = await worker.call('pending', { limit: 100 })
      const sent = await worker.call('markSentBatch', {
        accountId: QA_ACCOUNT_ID,
        operationIds: pending.map((entry) => entry.operation.operationId),
      })
      await worker.call('receipts', {
        accountId: QA_ACCOUNT_ID,
        receipts: sent.flatMap((entry) =>
          entry.wire
            ? [
                {
                  operationId: entry.wire.operationId,
                  completionId: entry.wire.completionId,
                  revision: entry.wire.revision,
                  status: 'applied',
                  projection: {
                    completionId: entry.wire.completionId,
                    revision: entry.wire.revision,
                    cancelled: entry.wire.kind === 'cancel',
                    categoryId: entry.wire.categoryId,
                    title: entry.wire.title,
                    completedAt: entry.wire.completedAt,
                  },
                },
              ]
            : [],
        ),
      })
      sync = 'idle'
    }
    await publish()
    return {
      phase,
      generation,
      sync,
      fail,
      delay,
      clipboard,
      hidden,
      events,
      workspace: phase === 'ready' ? await worker.call('open', null) : null,
    }
  }
  const bridge = `
const listeners={changed:new Set(),flush:new Set(),shown:new Set(),category:new Set()};
const stream=new EventSource('/events'); for(const [event,set] of Object.entries(listeners))stream.addEventListener(event,e=>{const data=JSON.parse(e.data);for(const listener of set)listener(data)});
const call=async(method,...args)=>{const response=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,args})});const value=await response.json();if(!response.ok)throw new Error(value.error);return value.result};
const listen=(event,listener)=>{listeners[event].add(listener);return()=>listeners[event].delete(listener)};
window.liveEditorAPI={workspace:{version:1,snapshot:()=>call('snapshot'),draft:(...a)=>call('draft',...a),command:(...a)=>call('command',...a),retry:()=>call('retry'),details:(...a)=>call('details',...a),undoHistory:(...a)=>call('undoHistory',...a),recoveryCopies:(...a)=>call('recoveryCopies',...a),signIn:()=>call('signIn'),syncDetails:(...a)=>call('syncDetails',...a),copyWriting:(...a)=>call('copyWriting',...a),export:(...a)=>call('export',...a),previewRecovery:(...a)=>call('previewRecovery',...a),recover:(...a)=>call('recover',...a),replyFlush:(...a)=>call('replyFlush',...a),subscribe:l=>listen('changed',l),onFlush:l=>listen('flush',l),onShown:l=>listen('shown',l)},window:{close:()=>call('hide'),getOpacity:()=>call('getOpacity'),setOpacity:v=>call('setOpacity',v),getBounds:async()=>null,setBounds:async()=>{}},spaces:{getVisibleOnAllWorkspaces:()=>call('getSpaces'),setVisibleOnAllWorkspaces:v=>call('setSpaces',v)},note:{get:async()=>{throw new Error('Legacy note path must not run')},set:async()=>{throw new Error('Legacy note path must not run')}}};
window.liveEditorEnv={isElectron:true,isLiveEditor:true,platform:'darwin'};
window.__offlineFixture={control:async(input)=>{const response=await fetch('/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw new Error('Control failed');return response.json()}};
`
  let origin = ''
  const server = createServer(async (request, response) => {
    try {
      if (
        `http://${request.headers.host}` !== origin ||
        (request.headers.origin && request.headers.origin !== origin)
      ) {
        response.writeHead(403)
        response.end()
        return
      }
      const path = new URL(request.url ?? '/', origin).pathname
      const expectedMethod =
        path === '/rpc' || path === '/control' ? 'POST' : 'GET'
      if (request.method !== expectedMethod) {
        response.writeHead(405)
        response.end()
        return
      }
      if (path === '/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        })
        response.write(': ready\n\n')
        clients.add(response)
        request.on('close', () => clients.delete(response))
        return
      }
      if (path === '/rpc' || path === '/control') {
        let body = ''
        for await (const chunk of request) {
          body += String(chunk)
          if (Buffer.byteLength(body) > 1_000_000)
            throw new Error('Request too large')
        }
        const input: unknown = JSON.parse(body)
        const command =
          path === '/rpc'
            ? z
                .object({
                  method: z.string().max(80),
                  args: z.array(z.unknown()).max(5),
                })
                .strict()
                .parse(input)
            : null
        const value = command
          ? { result: await rpc(command.method, command.args) }
          : await control(controlSchema.parse(input))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify(value))
        return
      }
      if (path === '/qa-bridge.js') {
        response.writeHead(200, { 'content-type': 'text/javascript' })
        response.end(bridge)
        return
      }
      if (path === '/favicon.ico') {
        response.writeHead(204)
        response.end()
        return
      }
      if (
        path !== '/' &&
        path !== '/index.html' &&
        !path.startsWith('/assets/')
      ) {
        response.writeHead(404)
        response.end()
        return
      }
      await serveBuiltFile(
        response,
        assets,
        path === '/' ? 'index.html' : path.slice(1),
        "'self'",
      )
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Fixture failed',
        }),
      )
    }
  })

  origin = await listenOnLoopback(server)
  return {
    url: origin,
    data,
    close: async (): Promise<void> => {
      for (const client of clients) client.end()
      for (const resolveFlush of flushes.values()) resolveFlush(false)
      server.close()
      await worker.close()
      await rm(data, { recursive: true, force: true })
    },
  }
}

/**
 * Entry point: parse, preflight, then serve one fixture or screenshot the chosen ones (DX1, DX3).
 *
 * @throws {@link FixtureCliError} for every contract failure; `exitWithFixtureError` prints it.
 * @example await main()
 */
async function main(): Promise<void> {
  // Parse first: nothing below may run for --help or a bad argument.
  const args = parseFixtureArgs(process.argv.slice(2), COMMAND, {
    fixture: true,
  })
  if (args.help) {
    process.stdout.write(HELP)
    return
  }
  const requested = args.fixture ?? 'local-only'
  const selected: readonly EditorFixtureSpec[] =
    requested === 'all' && args.screenshots
      ? EDITOR_FIXTURES
      : EDITOR_FIXTURES.filter((fixture) => fixture.name === requested)
  if (selected.length === 0)
    throw new FixtureCliError(
      'FIXTURE_UNKNOWN',
      `${COMMAND}: unknown fixture "${requested}" (FIXTURE_UNKNOWN). Valid: ${EDITOR_FIXTURE_NAMES.join(', ')}${requested === 'all' ? ' (all needs --screenshots)' : ''}. Fix: pnpm ${COMMAND} --fixture local-only`,
    )
  await requireBuiltFile(COMMAND, 'built renderer', join(ASSETS, 'index.html'))
  await requireBuiltFile(COMMAND, 'workspace worker', WORKER_SCRIPT)
  const paths = { assets: ASSETS, script: WORKER_SCRIPT }

  if (args.screenshots) {
    const session = new ScreenshotSession({
      command: COMMAND,
      directory: args.screenshots,
    })
    await session.open()
    try {
      for (const spec of selected) {
        const fixture = await createEditorFixture(spec.name, paths)
        try {
          await session.capture({
            state: spec.name,
            url: fixture.url,
            readyText: spec.readyText,
          })
        } finally {
          await fixture.close()
        }
      }
    } finally {
      await session.finish()
    }
    return
  }

  const spec = selected[0]!
  const fixture = await createEditorFixture(spec.name, paths)
  process.stdout.write(
    `${JSON.stringify({ fixture: spec.name, url: fixture.url, pid: process.pid, data: fixture.data })}\n`,
  )
  const stop = async (): Promise<void> => {
    await fixture.close()
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
}

main().catch(exitWithFixtureError)
