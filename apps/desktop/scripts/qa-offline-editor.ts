import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WorkspaceCommandSchema } from '@corelive/desktop-contract/offline-workspace-v2'
import { UserSettingsPatchSchema } from '@corelive/desktop-contract/settings'
import { z } from 'zod'

import { initializeDeviceWorkspace } from '../electron/offline/deviceWorkspaceFixture'
import { WorkspaceWorkerClient } from '../electron/offline/WorkspaceWorkerClient'

const run = fileURLToPath(new URL('.', import.meta.url))
const repo = resolve(run, '../../..')
const assets = join(repo, 'apps/desktop/dist-electron/renderer')
const data = await mkdtemp(join(tmpdir(), 'corelive-offline-qa-'))
const actor = () =>
  new WorkspaceWorkerClient({
    directory: data,
    ownerId: 'device',
    script: join(repo, 'apps/desktop/dist-electron/main/workspace-worker.cjs'),
  })
let worker = actor()
const QA_ACCOUNT_ID = 'synthetic-offline-qa'
const categories = [1, 2, 3].map((id) => ({
  id,
  name:
    id === 1 ? 'General' : id === 2 ? 'Projects with a long name' : 'Old plans',
  color: 'blue' as const,
  isDefault: id === 1,
  parentId: null,
  removed: false,
}))
await initializeDeviceWorkspace(data, {
  categoryCount: 3,
  boundAccountId: QA_ACCOUNT_ID,
  notes: {
    1: 'A small offline win\nAnother idea',
    2: 'Preserve destination writing',
    3: 'Writing in an old category',
  },
})
let phase: 'ready' | 'recovery' = 'ready'
let sync: 'offline' | 'idle' | 'syncing' | 'sign-in-required' = 'offline'
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
  const state = {
    offline: 'waiting',
    idle: 'synced',
    syncing: 'syncing',
    'sign-in-required': 'sign-in-to-sync',
  }[sync]
  return {
    phase: 'ready' as const,
    generation,
    sync: {
      state,
      waitingCount: workspace.pendingCount,
      lastSyncedAt: null,
      boundEmail: null,
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
  if (method === 'signIn' || method === 'manageCategories') {
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
  if (method === 'previewRecovery') return worker.call('previewRecovery', null)
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
      events.push({ method, type: command.type, commandId: command.commandId })
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
    sync: z.enum(['offline', 'idle', 'syncing', 'sign-in-required']).optional(),
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
      deletions: [{ sourceId: Number(input.removeCategory), destinationId: 2 }],
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
window.liveEditorAPI={workspace:{version:1,snapshot:()=>call('snapshot'),draft:(...a)=>call('draft',...a),command:(...a)=>call('command',...a),retry:()=>call('retry'),details:(...a)=>call('details',...a),undoHistory:(...a)=>call('undoHistory',...a),recoveryCopies:(...a)=>call('recoveryCopies',...a),signIn:()=>call('signIn'),manageCategories:(...a)=>call('manageCategories',...a),copyWriting:(...a)=>call('copyWriting',...a),export:(...a)=>call('export',...a),previewRecovery:(...a)=>call('previewRecovery',...a),recover:(...a)=>call('recover',...a),replyFlush:(...a)=>call('replyFlush',...a),subscribe:l=>listen('changed',l),onFlush:l=>listen('flush',l),onShown:l=>listen('shown',l),onCategoryCreated:l=>listen('category',l)},window:{close:()=>call('hide'),getOpacity:()=>call('getOpacity'),setOpacity:v=>call('setOpacity',v),getBounds:async()=>null,setBounds:async()=>{}},spaces:{getVisibleOnAllWorkspaces:()=>call('getSpaces'),setVisibleOnAllWorkspaces:v=>call('setSpaces',v)},note:{get:async()=>{throw new Error('Legacy note path must not run')},set:async()=>{throw new Error('Legacy note path must not run')}}};
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
    const file = resolve(assets, path === '/' ? 'index.html' : path.slice(1))
    if (!file.startsWith(assets + '/')) throw new Error('Invalid path')
    let content: Buffer | string = await readFile(file)
    if (file.endsWith('.html'))
      content = content
        .toString()
        .replace('<head>', '<head><script src="/qa-bridge.js"></script>')
    response.writeHead(200, {
      'content-type':
        (
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.map': 'application/json',
          } as Record<string, string>
        )[extname(file)] ?? 'application/octet-stream',
      'content-security-policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self' data:; frame-src 'none'; object-src 'none'",
    })
    response.end(content)
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Fixture failed',
      }),
    )
  }
})
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address')
  origin = `http://127.0.0.1:${address.port}`
  process.stdout.write(
    JSON.stringify({ url: origin, pid: process.pid, data }) + '\n',
  )
})
const close = async (): Promise<void> => {
  for (const client of clients) client.end()
  for (const resolveFlush of flushes.values()) resolveFlush(false)
  server.close()
  await worker.close()
  await rm(data, { recursive: true, force: true })
  process.exit(0)
}
process.once('SIGTERM', () => void close())
process.once('SIGINT', () => void close())
