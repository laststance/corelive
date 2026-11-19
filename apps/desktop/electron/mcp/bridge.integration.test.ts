import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { link, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { McpHistoryInputSchema } from '@corelive/desktop-contract/completion-history'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { initializeDeviceWorkspace } from '../offline/deviceWorkspaceFixture'
import { OfflineEditorController } from '../offline/OfflineEditorController'
import { WorkspaceWorkerClient } from '../offline/WorkspaceWorkerClient'

import { createAppActions } from './appActions'
import { createMcpClient } from './bridgeClient'
import { startMcpOwner } from './bridgeOwner'
import type { EditorRuntime } from './editorActions'
import { createCompletionHistory } from './history'
import { McpAccountError } from './historyAuthority'
import {
  adoptPeer,
  checkPeerDirectory,
  loadPeerBinding,
  peerEndpoint,
} from './peer'
import { BRIDGE_VERSION, encodeFrame, readFrames, writeFrame } from './protocol'
import { publishExportFile } from './publishExportFile'
import { mcpSuccess } from './result'
import { parseMcpCall } from './tools'

vi.mock('./activityExport', () => ({ exportActivityPng: vi.fn() }))

const desktop = fileURLToPath(new URL('../../', import.meta.url))
const runtime = join(desktop, 'dist-electron/mcp-runtime')
const stdio = join(runtime, 'stdio.cjs')
const appleSilicon = process.platform === 'darwin' && process.arch === 'arm64'
const cleanup: Array<() => void | Promise<void>> = []

vi.mock(import('node:fs/promises'), async (importOriginal) => {
  const fs = await importOriginal()
  return { ...fs, link: vi.fn(fs.link) }
})

function isolatedProfile() {
  const directory = mkdtempSync(join(tmpdir(), 'corelive-mcp-integration-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function stdioClient(profile: string) {
  const client = new Client({ name: 'CoreLive integration test', version: '1' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [stdio, '--user-data-dir=' + profile],
    stderr: 'pipe',
  })
  cleanup.push(async () => client.close())
  return { client, transport }
}

// Allow the cold helper bundle and native build to finish before stdio tests start.
beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build-mcp.mjs'], {
    cwd: desktop,
    timeout: 55_000,
  })
}, 60_000)

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

test('discovers distinct draft and completion tools over stdio while the isolated app is closed', async () => {
  // Arrange
  const { client, transport } = stdioClient(isolatedProfile())

  // Act
  await client.connect(transport)
  const list = await client.listTools()

  // Assert
  const names = list.tools.map((tool) => tool.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'read_draft',
      'append_unfinished_task',
      'record_completed_task',
      'list_completions',
    ]),
  )
  expect(
    list.tools.find((tool) => tool.name === 'append_unfinished_task')
      ?.inputSchema.required,
  ).toEqual(['title', 'operationId'])
  expect(
    list.tools.find((tool) => tool.name === 'read_skill_tree'),
  ).toMatchObject({
    description: expect.stringContaining('Creates and saves the default tree'),
    annotations: { readOnlyHint: false },
  })
  expect(
    list.tools.find((tool) => tool.name === 'list_unassigned_skill_tasks'),
  ).toMatchObject({
    annotations: { readOnlyHint: true },
    inputSchema: {
      properties: { pageSize: { default: 50, maximum: 100 }, cursor: {} },
    },
  })
})

test.each([
  { dispatched: true, effect: 'unknown' },
  { dispatched: false, effect: 'none' },
])(
  'a lost skill-tree response with dispatched=$dispatched reports $effect for default creation',
  async ({ dispatched, effect }) => {
    // Arrange
    const runtime = {
      controller: {
        getSnapshot: () => ({ generation: 1 }),
        mcpAccountBinding: () => null,
        withMcpAccount: async () => {
          throw new McpAccountError('account-unavailable', dispatched)
        },
      },
      ipc: {},
    } as unknown as EditorRuntime
    const actions = createAppActions({
      profileDirectory: isolatedProfile(),
      runtime,
      native: async () => undefined,
      signOutDevice: async (run) => run(),
    })

    // Act
    const result = await actions.call('session', 'read_skill_tree', {})

    // Assert
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { code: 'account-unavailable', effect },
    })
  },
)

test('an overlong unknown tool name receives a bounded error and the helper stays connected', async () => {
  // Arrange
  const { client, transport } = stdioClient(isolatedProfile())
  await client.connect(transport)

  // Act
  const unknown = await client.callTool({ name: 'unregistered_tool' })
  const rejected = await client.callTool({ name: 'x'.repeat(6 * 1024 * 1024) })
  const tools = await client.listTools()

  // Assert
  expect(unknown).toMatchObject({
    isError: true,
    structuredContent: {
      code: 'unknown-tool',
      effect: 'none',
      operation: 'unregistered_tool',
    },
  })
  expect(rejected).toMatchObject({
    isError: true,
    structuredContent: {
      code: 'unknown-tool',
      effect: 'none',
      operation: 'tools/call',
    },
  })
  expect(tools.tools.map((tool) => tool.name)).toContain('read_draft')
})

describe.runIf(appleSilicon)('verified Mac socket', () => {
  test('the built launcher and peer addon contain only an arm64 slice', () => {
    // Arrange
    const binaries = ['corelive-mcp', 'peer.node']

    // Act
    const slices = binaries.map((binary) =>
      execFileSync('/usr/bin/lipo', ['-archs', join(runtime, binary)], {
        encoding: 'utf8',
      }).trim(),
    )

    // Assert
    expect(slices).toEqual(['arm64', 'arm64'])
  })

  test('exports on a volume without hard links publish complete bytes once and preserve an occupied name', async () => {
    // Arrange
    const profile = isolatedProfile()
    const path = join(profile, 'activity.png')
    const unsupported = Object.assign(new Error('Hard links unsupported'), {
      code: 'ENOTSUP',
    })
    vi.mocked(link)
      .mockRejectedValueOnce(unsupported)
      .mockRejectedValueOnce(unsupported)
    const request = {
      filename: path,
      bytes: Buffer.from('first export'),
      profileDirectory: profile,
    }

    // Act
    const saved = await publishExportFile(request)
    const duplicate = publishExportFile({
      ...request,
      bytes: Buffer.from('second export'),
    })

    // Assert
    await expect(duplicate).rejects.toMatchObject({
      code: 'file-exists',
      effect: 'none',
    })
    expect(saved.path).toBe(path)
    expect(await readFile(path, 'utf8')).toBe('first export')
    expect(await readdir(profile)).toEqual(['activity.png'])
  })

  test('an account change while a volume rejects hard links cancels the exclusive rename', async () => {
    // Arrange
    const profile = isolatedProfile()
    let changed = false
    vi.mocked(link).mockImplementationOnce(async () => {
      changed = true
      throw Object.assign(new Error('Hard links unsupported'), {
        code: 'ENOTSUP',
      })
    })

    // Act
    const result = publishExportFile({
      filename: join(profile, 'activity.png'),
      bytes: Buffer.from('private'),
      profileDirectory: profile,
      beforePublish: () => {
        if (changed) throw new McpAccountError('account-changed', false)
      },
    })

    // Assert
    await expect(result).rejects.toMatchObject({ code: 'account-changed' })
    expect(await readdir(profile)).toEqual([])
  })

  test('the kernel peer check rejects a mismatched effective user and an invalid descriptor', () => {
    // Arrange
    const binary = join(isolatedProfile(), 'test-peer-identity')
    execFileSync(
      '/usr/bin/xcrun',
      ['clang', 'native/mcp/peer_identity_test.c', '-o', binary],
      { cwd: desktop },
    )
    // Act / Assert
    expect(() => execFileSync(binary)).not.toThrow()
  })

  test('the owner closes its listener if the published endpoint cannot be inspected', async () => {
    // Arrange
    const profile = isolatedProfile()
    const peers = await import('./peer')
    const native = peers.loadPeerBinding()
    const close = vi.fn(native.close)
    const useBinding = vi.spyOn(peers, 'loadPeerBinding').mockReturnValue({
      connect: native.connect,
      renameExclusive: native.renameExclusive,
      close,
      listen(path, adopt) {
        const listener = native.listen(path, adopt)
        cleanup.push(() => native.close(listener))
        unlinkSync(path)
        return listener
      },
    })
    cleanup.push(() => useBinding.mockRestore())

    // Act
    const failed = startMcpOwner(profile, {
      call: async () => mcpSuccess({}),
      closeSession: vi.fn(),
    })

    // Assert
    await expect(failed).rejects.toMatchObject({ code: 'ENOENT' })
    expect(close).toHaveBeenCalledOnce()
  })

  test('closing one stdio helper releases its session and leaves the other helper connected', async () => {
    // Arrange
    const profile = isolatedProfile()
    const closeSession = vi.fn()
    cleanup.push(
      await startMcpOwner(profile, {
        call: async (sessionId, name) => mcpSuccess({ sessionId, name }),
        closeSession,
      }),
    )
    const first = stdioClient(profile)
    const second = stdioClient(profile)
    await Promise.all([
      first.client.connect(first.transport),
      second.client.connect(second.transport),
    ])
    const reply = z.object({
      sessionId: z.uuid(),
      name: z.literal('read_draft'),
    })
    const [firstRead, secondRead] = await Promise.all([
      first.client.callTool({ name: 'read_draft' }),
      second.client.callTool({ name: 'read_draft' }),
    ])
    const firstSession = reply.parse(firstRead.structuredContent)
    const secondSession = reply.parse(secondRead.structuredContent)

    // Act
    await first.client.close()
    const continued = await second.client.callTool({ name: 'read_draft' })

    // Assert
    expect(firstSession.sessionId).not.toBe(secondSession.sessionId)
    await vi.waitFor(() =>
      expect(closeSession).toHaveBeenCalledWith(firstSession.sessionId),
    )
    expect(closeSession).not.toHaveBeenCalledWith(secondSession.sessionId)
    expect(continued.structuredContent).toEqual(secondSession)
  })

  test('aliases share a profile endpoint while distinct case-sensitive directories keep separate endpoints', () => {
    // Arrange
    const root = isolatedProfile()
    const stored = join(root, 'CoreLive')
    const lowercase = join(root, 'corelive')
    const linked = join(root, 'ProfileLink')
    mkdirSync(stored)
    symlinkSync(stored, linked)

    // Act / Assert
    expect(peerEndpoint(linked)).toEqual(peerEndpoint(stored))
    // The same spelling difference can name one directory or two on different volumes.
    if (existsSync(lowercase)) {
      expect(peerEndpoint(lowercase)).toEqual(peerEndpoint(stored))
    } else {
      mkdirSync(lowercase)
      expect(peerEndpoint(lowercase).path).not.toBe(peerEndpoint(stored).path)
    }
  })

  test('an explicit profile follows a symlink before parent traversal and keeps missing profile suffixes', async () => {
    // Arrange
    const root = isolatedProfile()
    const profiles = join(root, 'profiles')
    const tree = join(root, 'qa')
    const alias = join(profiles, 'link')
    const stored = join(tree, 'CoreLive')
    const other = join(profiles, 'CoreLive')
    mkdirSync(other, { recursive: true })
    mkdirSync(stored, { recursive: true })
    mkdirSync(join(tree, 'nested'))
    symlinkSync(join(tree, 'nested'), alias)

    for (const [profile, text] of [
      [stored, 'Requested profile'],
      [other, 'Different profile'],
    ] as const) {
      cleanup.push(
        await startMcpOwner(profile, {
          call: async () => mcpSuccess({ text }),
          closeSession: vi.fn(),
        }),
      )
    }

    // Act
    const { client, transport } = stdioClient(alias + '/../CoreLive')
    await client.connect(transport)
    const read = await client.callTool({ name: 'read_draft' })

    // Assert
    expect(read.structuredContent).toEqual({ text: 'Requested profile' })
    expect(peerEndpoint(alias + '/../Future')).toEqual(
      peerEndpoint(join(tree, 'Future')),
    )
    expect(() => peerEndpoint(profiles + '/missing/../CoreLive')).toThrow()
  })

  test('a cold helper finds the owner after the profile is created under its canonical spelling', async () => {
    // Arrange
    const root = isolatedProfile()
    const stored = join(root, 'CoreLive')
    const alias = join(root, 'corelive')
    const wake = vi.fn(async () => {
      mkdirSync(stored)
      // On a case-sensitive volume, an explicit alias still exercises creation after lookup.
      if (!existsSync(alias)) symlinkSync(stored, alias)
      cleanup.push(
        await startMcpOwner(stored, {
          call: async () => mcpSuccess({ text: 'Profile found' }),
          closeSession: vi.fn(),
        }),
      )
    })
    const helper = createMcpClient(alias, wake, 1_000)
    cleanup.push(() => helper.close())

    // Act
    const result = await helper.call(parseMcpCall('read_draft', {}))

    // Assert
    expect(result).toMatchObject({
      isError: false,
      structuredContent: { text: 'Profile found' },
    })
    expect(wake).toHaveBeenCalledOnce()
  })

  test('cancelling a draft read lets the helper continue its frozen history read', async () => {
    // Arrange
    const profile = isolatedProfile()
    const draft = new EventEmitter()
    const dispatched = once(draft, 'dispatched')
    const finishDraft = once(draft, 'finish')
    const history = createCompletionHistory({
      controller: {
        mcpDeviceHistory: async ({ from }) => ({
          rows: ['Earlier work', 'Later work'].map((title, index) => ({
            id: String(index + 1),
            title,
            completedAt: from + index,
            categoryId: null,
            boundIdentity: false,
            pending: false,
            categoryMovePending: false,
          })),
          boundAccountId: null,
          categories: [],
          suppressedIds: [],
        }),
        mcpAccountBinding: () => null,
        withMcpAccount: async () => {
          throw new Error('No account attached')
        },
      },
    })
    cleanup.push(
      await startMcpOwner(profile, {
        async call(sessionId, name, args) {
          if (name === 'list_completions') {
            return mcpSuccess(
              await history.list(sessionId, McpHistoryInputSchema.parse(args)),
            )
          }
          draft.emit('dispatched')
          await finishDraft
          return mcpSuccess({ text: 'Cancelled draft' })
        },
        closeSession: history.closeSession,
      }),
    )
    cleanup.push(() => {
      draft.emit('finish')
    })
    const { client, transport } = stdioClient(profile)
    await client.connect(transport)
    const first = await client.callTool({
      name: 'list_completions',
      arguments: { pageSize: 1 },
    })
    const page = first.structuredContent
    const cursor =
      typeof page === 'object' && page !== null && 'nextCursor' in page
        ? page.nextCursor
        : undefined
    expect(cursor).toEqual(expect.any(String))

    // Act
    const cancel = new AbortController()
    const pendingDraft = client.callTool({ name: 'read_draft' }, undefined, {
      signal: cancel.signal,
    })
    const rejected = expect(pendingDraft).rejects.toThrow(
      'Draft read cancelled',
    )
    await dispatched
    cancel.abort(new Error('Draft read cancelled'))
    await rejected
    // A ping confirms the helper has processed the preceding cancellation notification.
    await client.ping()
    const next = client.callTool({
      name: 'list_completions',
      arguments: { cursor },
    })
    draft.emit('finish')

    // Assert
    expect(await next).toMatchObject({
      isError: false,
      structuredContent: {
        entries: [{ title: 'Earlier work' }],
        nextCursor: null,
        total: 2,
      },
    })
  })

  test('the helper serves a new call when a cancelled write never replies', async () => {
    // Arrange
    const profile = isolatedProfile()
    const signals = new EventEmitter()
    const dispatched = once(signals, 'dispatched')
    const finishWrite = once(signals, 'finish')
    cleanup.push(
      await startMcpOwner(profile, {
        call: async (_session, name) => {
          if (name === 'append_unfinished_task') {
            signals.emit('dispatched')
            await finishWrite
          }
          return mcpSuccess({ name })
        },
        closeSession: vi.fn(),
      }),
    )
    cleanup.push(() => {
      signals.emit('finish')
    })
    const client = createMcpClient(
      profile,
      async () => {
        throw new Error('Unexpected wake')
      },
      200,
    )
    cleanup.push(() => client.close())
    const operationId = '00000000-0000-4000-8000-000000000001'
    const signal = new AbortController()
    const write = client.call(
      parseMcpCall('append_unfinished_task', { title: 'Ship it', operationId }),
      signal.signal,
    )

    // Act
    await dispatched
    signal.abort()
    const cancelled = await write
    const next = await client.call(parseMcpCall('read_draft', {}))

    // Assert
    expect(cancelled.structuredContent).toMatchObject({
      code: 'cancelled',
      effect: 'unknown',
      operationId: '00000000-0000-4000-8000-000000000001',
    })
    expect(next.structuredContent).toEqual({ name: 'read_draft' })
  })

  test('a worker that loses a committed write reply releases the real dispatcher and its durable receipt', async () => {
    // Arrange
    const profile = isolatedProfile()
    const directory = join(profile, 'workspaces')
    await initializeDeviceWorkspace(directory, { notes: { 1: 'Original' } })
    const workerURL = new URL('../offline/workspace-worker.ts', import.meta.url)
      .href
    const script = join(profile, 'withhold-append-reply.mjs')
    const seen = join(directory, 'append-attempts')
    const persisted = join(directory, 'append-committed')
    await writeFile(
      script,
      `import { appendFileSync, writeFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
let appendId;
parentPort.on('message', (request) => {
  if (request.type !== 'appendTask') return;
  appendId = request.requestId;
  appendFileSync(join(workerData.directory, 'append-attempts'), 'append\\n');
});
const send = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = (reply) => {
  if (reply.requestId === appendId && reply.activity === 'request-settled') return;
  if (reply.requestId === appendId && reply.ok) {
    writeFileSync(join(workerData.directory, 'append-committed'), 'committed');
    return;
  }
  send(reply);
};
await import(${JSON.stringify(workerURL)});
`,
    )
    const actor = new WorkspaceWorkerClient({
      script,
      directory,
      ownerId: 'device',
      execArgv: ['--import', 'tsx'],
      idleTimeoutMs: 4_000,
    })
    const controller = new OfflineEditorController({
      directory: profile,
      workerScript: script,
      actor: () => actor,
      broker: {
        acquire: async () => {
          throw new Error('Unexpected account request')
        },
        reset: () => undefined,
        revoke: async () => 'revoked',
      },
      transport: () => {
        throw new Error('Unexpected outbound synchronization')
      },
      legacyNotes: () => ({}),
      requestFlush: async () => true,
      onSnapshot: () => undefined,
      endLocalSession: async () => ({ status: 'signed-out' }),
    })
    cleanup.push(async () => actor.close())
    cleanup.push(async () => {
      await controller.shutdown()
    })
    await controller.initialize()
    expect(controller.getSnapshot().phase).toBe('ready')
    // Isolate the dispatcher's ordering from the controller's independent snapshot barrier.
    vi.spyOn(controller, 'readSnapshot').mockImplementation(async () =>
      controller.getSnapshot(),
    )

    const ipc = {
      flush: vi.fn(async () => true),
      shown: vi.fn(),
    } as unknown as EditorRuntime['ipc']
    const actions = createAppActions({
      profileDirectory: profile,
      runtime: { controller, ipc },
      native: async () => undefined,
      signOutDevice: async (run) => run(),
    })
    const signals = new EventEmitter()
    const reachedOwner = once(signals, 'read')
    cleanup.push(
      await startMcpOwner(profile, {
        ...actions,
        async call(session, name, args) {
          const reply = actions.call(session, name, args)
          // The IPC and snapshot stubs settle in microtasks, so an unserialized draft would run by this turn.
          if (name === 'read_draft') setImmediate(() => signals.emit('read'))
          return reply
        },
      }),
    )
    const first = stdioClient(profile)
    const second = stdioClient(profile)
    await Promise.all([
      first.client.connect(first.transport),
      second.client.connect(second.transport),
    ])
    const operationId = '00000000-0000-4000-8000-000000000001'
    const draft = vi.spyOn(controller, 'draft')

    // Act
    const writing = first.client.callTool({
      name: 'append_unfinished_task',
      arguments: { title: 'Ship it', operationId },
    })
    await vi.waitFor(() => expect(existsSync(persisted)).toBe(true))
    const reading = second.client.callTool({ name: 'read_draft' })
    await reachedOwner

    const readsBeforeWriteReply = draft.mock.calls.length

    // Assert
    expect(await writing).toMatchObject({
      isError: true,
      structuredContent: {
        code: 'worker-unavailable',
        effect: 'unknown',
        operationId: '00000000-0000-4000-8000-000000000001',
        nextAction: expect.stringContaining('get_task_addition_result'),
      },
    })
    const read = await reading
    if (read.isError) {
      // A request can see the retiring worker before its exit, but it must return.
      expect(read.structuredContent).toMatchObject({
        code: 'worker-unavailable',
        effect: 'none',
      })
    } else {
      expect(read.structuredContent).toMatchObject({
        text: 'Original\n- [ ] Ship it',
      })
    }
    await vi.waitFor(
      async () => {
        const receipt = await second.client.callTool({
          name: 'get_task_addition_result',
          arguments: { operationId },
        })
        expect(receipt).toMatchObject({
          isError: false,
          structuredContent: {
            operationId: '00000000-0000-4000-8000-000000000001',
            status: 'saved',
            title: 'Ship it',
          },
        })
      },
      { timeout: 6_000 },
    )
    expect(readsBeforeWriteReply).toBe(0)
    expect(await readFile(seen, 'utf8')).toBe('append\n')
  }, 20_000)

  test('the stdio client receives uncertain and never-dispatched write outcomes before its own deadline', async () => {
    // Arrange
    const profile = isolatedProfile()
    const { MCP_CALL_TIMEOUT_MS } = await import('./protocol')
    const { DEFAULT_REQUEST_TIMEOUT_MSEC } =
      await import('@modelcontextprotocol/sdk/shared/protocol.js')
    expect(MCP_CALL_TIMEOUT_MS).toBeLessThan(DEFAULT_REQUEST_TIMEOUT_MSEC)
    const signals = new EventEmitter()
    const dispatched = once(signals, 'dispatched')
    const finish = once(signals, 'finish')
    const received: string[] = []
    cleanup.push(
      await startMcpOwner(profile, {
        async call(_session, name) {
          received.push(name)
          if (name === 'append_unfinished_task') {
            signals.emit('dispatched')
            await finish
          }
          return mcpSuccess({ name })
        },
        closeSession: vi.fn(),
      }),
    )
    cleanup.push(() => {
      signals.emit('finish')
    })

    // Accelerate only the bundled helper's clocks. The client still uses its default SDK deadline.
    const preload = `let count = 0;
const schedule = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms, ...args) => schedule(callback,
  ms === ${MCP_CALL_TIMEOUT_MS} ? ([1200, 100][count++] ?? 1200) : ms, ...args);`
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        '--import',
        'data:text/javascript,' + encodeURIComponent(preload),
        stdio,
        '--user-data-dir=' + profile,
      ],
      stderr: 'pipe',
    })
    const client = new Client({
      name: 'CoreLive integration test',
      version: '1',
    })
    cleanup.push(async () => client.close())
    await client.connect(transport)

    // Act
    const dispatchedWrite = client.callTool({
      name: 'append_unfinished_task',
      arguments: {
        title: 'Ship it',
        operationId: '00000000-0000-4000-8000-000000000001',
      },
    })
    await dispatched
    const queued = await client.callTool({
      name: 'append_unfinished_task',
      arguments: {
        title: 'Finish later',
        operationId: '00000000-0000-4000-8000-000000000002',
      },
    })

    // Assert
    expect(queued.structuredContent).toMatchObject({
      code: 'request-timeout',
      effect: 'none',
    })
    expect((await dispatchedWrite).structuredContent).toMatchObject({
      code: 'request-timeout',
      effect: 'unknown',
      message: 'The CoreLive request did not complete before its deadline.',
      operationId: '00000000-0000-4000-8000-000000000001',
      nextAction: expect.stringContaining('get_task_addition_result'),
    })
    const read = await client.callTool({ name: 'read_draft' })
    expect(read.structuredContent).toEqual({ name: 'read_draft' })
    expect(received).toEqual(['append_unfinished_task', 'read_draft'])
  })

  test('canceling a cold wake releases the queue while its launch callback is still pending', async () => {
    // Arrange
    const profile = isolatedProfile()
    const signals = new EventEmitter()
    const launched = once(signals, 'launched')
    const wake = vi.fn(async () => {
      signals.emit('launched')
      await new Promise<void>(() => undefined)
    })
    const client = createMcpClient(profile, wake, 5_000)
    cleanup.push(() => client.close())
    const cancellation = new AbortController()
    const pending = client.call(
      parseMcpCall('read_draft', {}),
      cancellation.signal,
    )
    await launched

    // Act
    cancellation.abort()
    const read = client.call(parseMcpCall('read_draft', {}))
    const call = vi.fn(async () => mcpSuccess({ text: 'CoreLive is ready' }))
    cleanup.push(await startMcpOwner(profile, { call, closeSession: vi.fn() }))

    // Assert
    expect((await pending).structuredContent).toMatchObject({
      code: 'cancelled',
      effect: 'none',
    })
    expect((await read).structuredContent).toEqual({
      text: 'CoreLive is ready',
    })
    expect(call).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'read_draft',
      {},
    )
  }, 3_000)

  test('canceling an unfinished handshake closes only its connection before dispatch', async () => {
    // Arrange
    const profile = isolatedProfile()
    const endpoint = peerEndpoint(profile)
    checkPeerDirectory(endpoint, true)
    const peer = loadPeerBinding()
    const signals = new EventEmitter()
    const hello = once(signals, 'hello')
    const closed = once(signals, 'closed')
    const listener = peer.listen(endpoint.path, (fd) => {
      const socket = adoptPeer(fd)
      if (!socket) return undefined
      cleanup.push(() => {
        socket.destroy()
      })
      socket.once('close', () => signals.emit('closed'))
      void readFrames(socket)
        .next()
        .then(() => signals.emit('hello'))
      return socket
    })
    cleanup.push(() => {
      peer.close(listener)
      if (existsSync(endpoint.path)) unlinkSync(endpoint.path)
    })
    const client = createMcpClient(
      profile,
      async () => {
        throw new Error('Unexpected wake')
      },
      5_000,
    )
    cleanup.push(() => client.close())
    const cancellation = new AbortController()
    const pending = client.call(
      parseMcpCall('read_draft', {}),
      cancellation.signal,
    )
    await hello

    // Act
    cancellation.abort()
    const result = await pending
    await closed
    peer.close(listener)
    unlinkSync(endpoint.path)
    const call = vi.fn(async () => mcpSuccess({ text: 'Second connection' }))
    cleanup.push(await startMcpOwner(profile, { call, closeSession: vi.fn() }))

    // Assert
    expect(result.structuredContent).toMatchObject({
      code: 'cancelled',
      effect: 'none',
    })
    expect(
      (await client.call(parseMcpCall('read_draft', {}))).structuredContent,
    ).toEqual({ text: 'Second connection' })
    expect(call).toHaveBeenCalledOnce()
  }, 3_000)

  test('connection startup shares the call deadline and releases the helper queue', async () => {
    // Arrange
    const profile = isolatedProfile()
    const wake = vi.fn(async () => new Promise<void>(() => undefined))
    const helper = createMcpClient(profile, wake, 5_000, 250)
    cleanup.push(() => helper.close())

    // Act
    const timedOut = await helper.call(
      parseMcpCall('append_unfinished_task', {
        title: 'Ship it',
        operationId: '00000000-0000-4000-8000-000000000001',
      }),
    )
    const calls = vi.fn(async (_session: string, name: string) =>
      mcpSuccess({ name }),
    )
    cleanup.push(
      await startMcpOwner(profile, { call: calls, closeSession: vi.fn() }),
    )
    const read = await helper.call(parseMcpCall('read_draft', {}))

    // Assert
    expect(wake).toHaveBeenCalledOnce()
    expect(timedOut.structuredContent).toMatchObject({
      code: 'request-timeout',
      effect: 'none',
    })
    expect(read.structuredContent).toEqual({ name: 'read_draft' })
    expect(calls.mock.calls.map(([, name]) => name)).toEqual(['read_draft'])
  })

  test.each([
    {
      label: 'dispatches an 11 MiB edit',
      text: 'x',
      repeats: 11 * 1024 * 1024,
      errors: false,
    },
    {
      label: 'declines an edit whose UTF-8 bridge frame exceeds 32 MiB',
      text: 'é',
      repeats: 16 * 1024 * 1024,
      errors: true,
    },
  ])(
    'the helper $label and still accepts the next call',
    async ({ text, repeats, errors }) => {
      // Arrange
      const profile = isolatedProfile()
      const received: string[] = []
      cleanup.push(
        await startMcpOwner(profile, {
          call: async (_session, name, args) => {
            received.push(name)
            const call = parseMcpCall(name, args)
            return mcpSuccess(
              call.name === 'edit_draft'
                ? {
                    textBytes: Buffer.byteLength(call.args.rows[0]?.text ?? ''),
                  }
                : { text: 'Still connected' },
            )
          },
          closeSession: vi.fn(),
        }),
      )
      const { client, transport } = stdioClient(profile)
      await client.connect(transport)

      // Act
      const edit = await client.callTool({
        name: 'edit_draft',
        arguments: {
          categoryId: '00000000-0000-4000-8000-000000000001',
          baseRevision: 0,
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              text: text.repeat(repeats),
            },
          ],
        },
      })
      const read = await client.callTool({ name: 'read_draft' })

      // Assert
      expect(edit.isError).toBe(errors)
      if (errors) {
        expect(edit.structuredContent).toMatchObject({
          code: 'request-too-large',
          effect: 'none',
          limitBytes: 33_554_432,
        })
        expect(received).toEqual(['read_draft'])
      } else {
        expect(edit.structuredContent).toEqual({ textBytes: 11_534_336 })
        expect(received).toEqual(['edit_draft', 'read_draft'])
      }
      expect(read.structuredContent).toEqual({ text: 'Still connected' })
    },
    // Allow the SDK's default 60-second request timeout plus helper startup.
    70_000,
  )

  test.each(['profile', 'version'])(
    'a mismatched %s is refused before a call can reach the workspace',
    async (mismatch) => {
      // Arrange
      const profile = isolatedProfile()
      const endpoint = peerEndpoint(profile)
      const call = vi.fn(async () => mcpSuccess({}))
      cleanup.push(
        await startMcpOwner(profile, { call, closeSession: vi.fn() }),
      )
      const socket = loadPeerBinding().connect(endpoint.path, adoptPeer)
      cleanup.push(() => {
        socket.destroy()
      })
      const frames = readFrames(socket)

      // Act
      await writeFrame(
        socket,
        encodeFrame({
          type: 'hello',
          profile:
            mismatch === 'profile' ? 'a-different-profile' : endpoint.identity,
          version: mismatch === 'version' ? BRIDGE_VERSION + 1 : BRIDGE_VERSION,
        }),
      )
      const reply = await frames.next()
      const closed = await frames.next()

      // Assert
      expect(reply.value).toEqual({ type: 'incompatible' })
      expect(closed.done).toBe(true)
      expect(call).not.toHaveBeenCalled()
    },
  )

  test('an interrupted write is reported as unknown and a lookup after owner restart uses the original UUID', async () => {
    // Arrange
    const profile = isolatedProfile()
    const operationId = randomUUID()
    const signals = new EventEmitter()
    const dispatched = once(signals, 'dispatched')
    const finish = once(signals, 'finish')
    const original = vi.fn(async () => {
      signals.emit('dispatched')
      await finish
      return mcpSuccess({ operationId })
    })
    const stop = await startMcpOwner(profile, {
      call: original,
      closeSession: vi.fn(),
    })
    cleanup.push(stop)
    const client = createMcpClient(profile, async () => {
      throw new Error('Unexpected wake')
    })
    cleanup.push(() => client.close())

    // Act
    const pending = client.call(
      parseMcpCall('append_unfinished_task', {
        title: 'Test the reconnect',
        operationId,
      }),
    )
    await dispatched
    stop()
    signals.emit('finish')
    const interrupted = await pending
    const lookup = vi.fn(
      async (_session: string, _name: string, args: unknown) =>
        mcpSuccess({ saved: true, args }),
    )
    cleanup.push(
      await startMcpOwner(profile, { call: lookup, closeSession: vi.fn() }),
    )
    const found = await client.call(
      parseMcpCall('get_task_addition_result', { operationId }),
    )

    // Assert
    expect(interrupted.structuredContent).toMatchObject({
      code: 'worker-unavailable',
      effect: 'unknown',
      operationId,
    })
    expect(found.structuredContent).toEqual({
      saved: true,
      args: { operationId },
    })
    expect(original).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls.map(([, name]) => name)).toEqual([
      'get_task_addition_result',
    ])
  })

  test('a saved addition is confirmed by its receipt when the owner drops the original reply', async () => {
    // Arrange
    const profile = isolatedProfile()
    const operationId = '00000000-0000-4000-8000-000000000001'
    const saved = {
      status: 'saved',
      operationId,
      title: 'Verify this write',
      rowId: '00000000-0000-4000-8000-000000000002',
    }
    const lookup = vi.fn(async () => mcpSuccess(saved))
    const write = vi.fn(async () => {
      stop()
      cleanup.push(
        await startMcpOwner(profile, { call: lookup, closeSession: vi.fn() }),
      )
      return mcpSuccess(saved)
    })
    const stop = await startMcpOwner(profile, {
      call: write,
      closeSession: vi.fn(),
    })
    cleanup.push(stop)
    const client = createMcpClient(profile, async () => {
      throw new Error('Unexpected wake')
    })
    cleanup.push(() => client.close())

    // Act
    const result = await client.call(
      parseMcpCall('append_unfinished_task', {
        title: 'Verify this write',
        operationId,
      }),
    )

    // Assert
    expect(result.structuredContent).toEqual({
      status: 'saved',
      operationId: '00000000-0000-4000-8000-000000000001',
      title: 'Verify this write',
      rowId: '00000000-0000-4000-8000-000000000002',
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'get_task_addition_result',
      { operationId, original: { title: 'Verify this write' } },
    )
  })
})
