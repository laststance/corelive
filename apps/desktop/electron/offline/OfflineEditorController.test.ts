import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type OfflineEditorSnapshot,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { afterEach, expect, onTestFinished, test, vi } from 'vitest'

import { DurableEditorStore } from '../../renderer/editor/DurableEditorStore'
import type { WindowManager } from '../WindowManager'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import {
  buildDeviceWorkspace,
  categoryUuid,
  initializeDeviceWorkspace,
} from './deviceWorkspaceFixture'
import { OfflineAccountRegistry } from './OfflineAccountRegistry'
import { OfflineEditorController } from './OfflineEditorController'
import { OfflineEditorIPC } from './OfflineEditorIPC'
import type { WorkspaceWorkerCalls } from './workspace-worker-protocol'
import { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  clipboard: { writeText: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
}))

type Options = ConstructorParameters<typeof OfflineEditorController>[0]
const cleanups: (() => Promise<void>)[] = []
const serverCategory = {
  id: 1,
  name: 'General',
  color: 'blue',
  isDefault: true,
  parentId: null,
  removed: false,
} as const

/** A synthetic server: counts every call so tests can prove nothing was sent. */
function createTransport(identity: { clerkId: string; email: string | null }) {
  return {
    whoami: vi.fn<CompletionSyncTransport['whoami']>(async () => identity),
    bootstrap: vi.fn<CompletionSyncTransport['bootstrap']>(async () => ({
      accountId: identity.clerkId,
      categories: [serverCategory],
      deletions: [],
    })),
    apply: vi.fn<CompletionSyncTransport['apply']>(async ({ operations }) => ({
      receipts: operations.map((operation) => ({
        operationId: operation.operationId,
        completionId: operation.completionId,
        revision: operation.revision,
        status: 'applied' as const,
        projection: {
          completionId: operation.completionId,
          revision: operation.revision,
          cancelled: operation.kind === 'cancel',
          categoryId: operation.categoryId,
          title: operation.title,
          completedAt: operation.completedAt,
        },
      })),
    })),
    receipts: vi.fn<CompletionSyncTransport['receipts']>(async () => ({
      receipts: [],
    })),
    categoryApply: vi.fn<CompletionSyncTransport['categoryApply']>(
      async () => ({
        receipts: [],
      }),
    ),
    categoryReceipts: vi.fn<CompletionSyncTransport['categoryReceipts']>(
      async () => ({ receipts: [] }),
    ),
    checkpoint: vi.fn<CompletionSyncTransport['checkpoint']>(
      async ({ day, timezone, completionIds }) => ({
        day,
        timezone,
        total: 0,
        fetchedAt: Date.now(),
        identities: Object.fromEntries(completionIds.map((id) => [id, null])),
      }),
    ),
  }
}
type Transport = ReturnType<typeof createTransport>

/** The synchronization endpoints a sign-in alone must never reach. */
function syncCalls(transport: Transport): number {
  return (
    transport.bootstrap.mock.calls.length +
    transport.apply.mock.calls.length +
    transport.receipts.mock.calls.length +
    transport.checkpoint.mock.calls.length
  )
}

/**
 * Uses the real device files, registry and worker thread with synthetic auth; never launches
 * Electron. `bound` pre-binds the account the way a previous Connect would have.
 * @example const fixture = await createFixture({ bound: 'account-a', attached: true })
 */
async function createFixture(
  input: {
    existing?: boolean
    bound?: string
    attached?: boolean
    signOutPending?: boolean
    transport?: Transport
    identity?: { clerkId: string; email: string | null }
    override?: Partial<Options>
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-controller-'))
  const registry = new OfflineAccountRegistry(directory)
  const workspaces = join(directory, 'workspaces')
  if (input.existing ?? true) {
    await initializeDeviceWorkspace(workspaces, {
      notes: { 1: 'Writing survives offline startup' },
      boundAccountId: input.bound,
      displayEmail: input.bound ? 'bound@example.com' : null,
    })
    await registry.read()
    await registry.update({
      attachedAccountId: input.attached ? (input.bound ?? null) : null,
      signOutPending: input.signOutPending ?? false,
    })
  }
  const workers: WorkspaceWorkerClient[] = []
  const actor = (): WorkspaceWorkerClient => {
    const worker = new WorkspaceWorkerClient({
      directory: workspaces,
      ownerId: DEVICE_OWNER_ID,
      script: new URL('./workspace-worker.ts', import.meta.url),
      execArgv: ['--import', 'tsx'],
    })
    workers.push(worker)
    return worker
  }
  const identity = input.identity ?? {
    clerkId: input.bound ?? 'account-a',
    email: 'me@example.com',
  }
  const transport = input.transport ?? createTransport(identity)
  const broker = {
    acquire: vi.fn<Options['broker']['acquire']>(
      async (expectedAccountId, generation) => ({
        status: 'ready',
        credential: {
          status: 'ready',
          requestId: randomUUID(),
          expectedAccountId,
          generation,
          accountId: identity.clerkId,
          token: 'test-token',
        },
      }),
    ),
    reset: vi.fn(),
    revoke: vi.fn<Options['broker']['revoke']>(async () => 'revoked'),
  }
  const requestFlush = vi.fn<Options['requestFlush']>(async () => true)
  const endLocalSession = vi.fn<Options['endLocalSession']>(async () => ({
    status: 'signed-out',
  }))
  const log = vi.fn<(line: string) => void>()
  const snapshots: OfflineEditorSnapshot[] = []
  const options: Options = {
    directory,
    registry,
    actor,
    workerScript: 'unused-with-actor-factory',
    broker,
    transport: () => transport,
    requestFlush,
    legacyNotes: () => ({}),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    endLocalSession,
    log,
    settleTimeoutMs: 100,
    ...input.override,
  }
  const controller = new OfflineEditorController(options)
  cleanups.push(async () => {
    requestFlush.mockResolvedValue(true)
    await controller.shutdown()
    // Failed-exit cases intentionally retain actors; only these synthetic workers are terminated.
    await Promise.all(workers.map(async (worker) => worker.close()))
    await rm(directory, { recursive: true })
  })
  return {
    controller,
    options,
    directory,
    workspaces,
    registry,
    broker,
    requestFlush,
    endLocalSession,
    transport,
    log,
    snapshots,
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

/** Holds a specific worker boundary until a concurrency test releases it.
 * @example const gate = deferred(); gate.resolve(); await gate.promise
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** Reads the device workspace file the way a relaunch would. */
async function readDevice(workspaces: string) {
  return new AtomicWorkspaceFile({
    directory: workspaces,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  }).read()
}

test.each(['after', 'before', 'queued'] as const)(
  'failed writing survives a renderer restart %s the worker response until acknowledged recovery',
  async (ordering) => {
    // Arrange: real controller, worker and disk; only the preload transport is in-process.
    const listeners = new Set<(snapshot: OfflineEditorSnapshot) => void>()
    const { controller, options } = await createFixture({
      override: { onSnapshot: (snapshot) => ipc.publish(snapshot) },
    })
    const reached = deferred()
    const release = deferred()
    const originalActor = options.actor!
    options.actor = () => {
      const worker = originalActor()
      const originalCall = worker.call.bind(worker)
      worker.call = async <K extends keyof WorkspaceWorkerCalls>(
        method: K,
        input: WorkspaceWorkerCalls[K]['input'],
      ): Promise<WorkspaceWorkerCalls[K]['output']> => {
        if (method === 'command') {
          reached.resolve()
          await release.promise
        }
        return originalCall(method, input)
      }
      return worker
    }
    const frame = {
      url: 'corelive-editor://app/index.html',
      origin: 'corelive-editor://app',
    }
    const editor = {
      isDestroyed: () => false,
      webContents: {
        mainFrame: frame,
        getURL: () => frame.url,
        isDestroyed: () => false,
        isLoadingMainFrame: () => false,
        isCrashed: () => false,
        send: (channel: string, snapshot: OfflineEditorSnapshot): void => {
          if (channel === 'offline-editor-changed')
            for (const listener of listeners) listener(snapshot)
        },
      },
    }
    const ipc = new OfflineEditorIPC(
      {
        getLiveEditorWindow: () => editor as unknown as BrowserWindow,
        getSettingsWindow: () => null,
        setLoginWindowObserver: vi.fn(),
      } as unknown as WindowManager,
      controller,
      { signOutDevice: vi.fn(), isOnline: () => true },
    )
    ipc.register()
    const readSnapshot = vi
      .mocked(ipcMain.handle)
      .mock.calls.filter(([name]) => name === 'offline-editor-snapshot')
      .at(-1)?.[1]
    if (!readSnapshot) throw new Error('Missing snapshot handler')
    const event = {
      sender: editor.webContents,
      senderFrame: frame,
    } as unknown as IpcMainInvokeEvent
    await controller.initialize()
    const command = vi.fn<OfflineEditorAPI['command']>(
      async (generation, input) => controller.command(generation, input),
    )
    const host: OfflineEditorAPI = {
      version: 1,
      snapshot: async () =>
        (await readSnapshot(event)) as OfflineEditorSnapshot,
      command,
      draft: async (generation, categoryId) =>
        controller.draft(generation, categoryId),
      retry: async () => undefined,
      details: async (generation, offset, limit) =>
        controller.details(generation, offset, limit),
      undoHistory: async (generation, offset, limit) =>
        controller.undoHistory(generation, offset, limit),
      recoveryCopies: async (generation, offset, limit) =>
        controller.recoveryCopies(generation, offset, limit),
      signIn: async () => undefined,
      syncDetails: async () => ({
        rows: [],
        history: [],
        migrationSummary: null,
        preservedBackups: [],
        dashboardOnlyCount: 0,
      }),
      copyWriting: async () => true,
      export: async () => true,
      previewRecovery: async (generation) =>
        controller.previewRecovery(generation),
      recover: async (generation) => controller.recover(generation),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      onFlush: () => () => undefined,
      onShown: () => () => undefined,
      replyFlush: async () => true,
    }
    const store = new DurableEditorStore(host)
    const restarted = new DurableEditorStore(host)
    const fresh = new DurableEditorStore(host)
    cleanups.push(async () => {
      store.disconnect()
      restarted.disconnect()
      fresh.disconnect()
    })
    await store.connect()

    // Act: restart immediately after failure, without waiting for a worker refresh.
    const previouslySent = controller.getSnapshot()
    store.edit('x'.repeat(51001))
    const saving = store.flush()
    await reached.promise
    let reconnect: Promise<void> | undefined
    try {
      if (ordering !== 'after') {
        store.disconnect()
        reconnect = restarted.connect()
        await new Promise<void>((resolve) => setImmediate(resolve))
        // A background notification must not expose old writing during the handoff.
        ipc.publish(controller.getSnapshot())
        // Already-sent notifications can arrive after the new snapshot request starts.
        if (ordering === 'queued')
          for (let delivery = 0; delivery < 8; delivery++)
            for (const listener of listeners) listener(previouslySent)
        expect(restarted.getSnapshot().main.phase).toBe('opening')
        restarted.edit('This edit must wait for the accepted writing')
        expect(restarted.getSnapshot().text).toBe('')
        await expect(ipc.flush(0)).resolves.toBe(false)
      }
    } finally {
      release.resolve()
      await saving
      await reconnect
    }
    await expect(saving).resolves.toBe(false)
    if (ordering === 'after') {
      expect(store.getSnapshot().save).toBe('failed')
      store.disconnect()
      await restarted.connect()
    }

    // Assert: the replacement renderer receives the exact writing and its failed state.
    expect(restarted.getSnapshot()).toMatchObject({
      text: 'x'.repeat(51001),
      save: 'failed',
    })

    // Act: only the user's acknowledged recovery clears the main rescue copy.
    restarted.edit('Writing survives offline startup')
    await expect(restarted.retry()).resolves.toBe(true)
    restarted.disconnect()
    await fresh.connect()

    // Assert: a baseline ACK also removes the retained failed text in main.
    expect(command).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot()).not.toHaveProperty('unsavedDraft')
    expect(fresh.getSnapshot()).toMatchObject({
      text: 'Writing survives offline startup',
      save: 'saved',
      error: null,
    })
  },
)

test.each(['crashed', 'loading', 'destroyed', 'contents-destroyed', 'missing'])(
  'a %s renderer cannot allow normal exit to discard main-retained writing',
  async (state) => {
    // Arrange: capacity rejection keeps a real failed-save rescue in main.
    const { controller, requestFlush } = await createFixture()
    await controller.initialize()
    const snapshot = controller.getSnapshot()
    if (snapshot.phase !== 'ready') throw new Error('Missing prepared account')
    const editor = {
      isDestroyed: () => state === 'destroyed',
      webContents: {
        isDestroyed: () => state === 'contents-destroyed',
        isLoadingMainFrame: () => state === 'loading',
        isCrashed: () => state === 'crashed',
        send: vi.fn(),
      },
    }
    const ipc = new OfflineEditorIPC(
      {
        getLiveEditorWindow: () =>
          state === 'missing' ? null : (editor as unknown as BrowserWindow),
        setLoginWindowObserver: vi.fn(),
      } as unknown as WindowManager,
      controller,
      { signOutDevice: vi.fn(), isOnline: () => true },
    )
    requestFlush.mockImplementation(async (generation) => ipc.flush(generation))
    const save = {
      type: 'save' as const,
      commandId: randomUUID(),
      categoryId: categoryUuid(1),
      baseRevision: snapshot.workspace.draft.revision,
      rows: [{ id: randomUUID(), text: 'x'.repeat(51001) }],
    }
    await expect(controller.command(0, save)).resolves.toMatchObject({
      ok: false,
      reason: 'invalid-row',
    })

    // Act / Assert: no unreachable renderer challenge and no destructive exit.
    await expect(ipc.flush(0)).resolves.toBe(false)
    await expect(controller.shutdown()).resolves.toBe(false)
    expect(editor.webContents.send).not.toHaveBeenCalled()
    controller.retrySync()
    await vi.waitFor(() =>
      expect(controller.getSnapshot()).toMatchObject({ unsavedDraft: save }),
    )

    // A successful recovery ACK removes the rescue and permits a later exit.
    await expect(
      controller.command(0, {
        ...save,
        commandId: randomUUID(),
        rows: [{ id: randomUUID(), text: 'Recovered writing' }],
      }),
    ).resolves.toMatchObject({ ok: true })
    await expect(controller.shutdown()).resolves.toBe(true)
  },
)

test('normal exit waits for a main-process writing command even when the renderer is unavailable', async () => {
  // Arrange
  const { controller, options } = await createFixture()
  const reached = deferred()
  const release = deferred()
  const originalActor = options.actor!
  options.actor = () => {
    const worker = originalActor()
    const originalCall = worker.call.bind(worker)
    worker.call = async <K extends keyof WorkspaceWorkerCalls>(
      method: K,
      input: WorkspaceWorkerCalls[K]['input'],
    ): Promise<WorkspaceWorkerCalls[K]['output']> => {
      if (method === 'command') {
        reached.resolve()
        await release.promise
      }
      return originalCall(method, input)
    }
    return worker
  }
  await controller.initialize()
  const snapshot = controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Missing prepared account')
  const save = controller.command(0, {
    type: 'save',
    commandId: randomUUID(),
    categoryId: categoryUuid(1),
    baseRevision: snapshot.workspace.draft.revision,
    rows: [{ id: randomUUID(), text: 'In-flight writing survives' }],
  })
  await reached.promise

  // Act / Assert: a true renderer no-op cannot bypass an unresolved main command.
  try {
    await expect(controller.shutdown()).resolves.toBe(false)
  } finally {
    release.resolve()
    await save
  }
  await expect(save).resolves.toMatchObject({ ok: true })
  await expect(controller.draft(0, categoryUuid(1))).resolves.toMatchObject({
    draft: { rows: [{ text: 'In-flight writing survives' }] },
  })
  await expect(controller.shutdown()).resolves.toBe(true)
})

/** Completes the first draft row so one unsent operation exists in the outbox. */
async function completeOneLine(
  controller: OfflineEditorController,
): Promise<void> {
  const snapshot = controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Editor is not ready')
  const result = await controller.command(snapshot.generation, {
    type: 'complete',
    commandId: randomUUID(),
    categoryId: categoryUuid(1),
    baseRevision: snapshot.workspace.draft.revision,
    rowId: snapshot.workspace.draft.rows[0]!.id,
    completionId: randomUUID(),
    completedAt: Date.now(),
    timezone: 'UTC',
  })
  if (!result.ok) throw new Error('Could not complete the line')
}

test('the very first launch opens a local General category with no account, no sign-in prompt and no request', async () => {
  // Arrange
  const fixture = await createFixture({ existing: false })

  // Act
  await fixture.controller.initialize()

  // Assert
  const snapshot = fixture.controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Expected a ready editor')
  expect(
    snapshot.workspace.categories.map((category) => category.name),
  ).toEqual(['General'])
  expect(snapshot.sync).toEqual({
    state: 'local-only',
    waitingCount: 0,
    lastSyncedAt: null,
    boundEmail: null,
  })
  expect(fixture.broker.acquire).not.toHaveBeenCalled()
  expect(syncCalls(fixture.transport)).toBe(0)
})

test('a Mac with writing opens it from disk without waiting for authentication', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.broker.acquire.mockImplementation(
    async () => new Promise(() => undefined),
  )

  // Act
  await fixture.controller.initialize()

  // Assert
  expect(fixture.controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    generation: 0,
    workspace: {
      preferences: { theme: 'cathedral-dark' },
      draft: { rows: [{ text: 'Writing survives offline startup' }] },
    },
  })
  expect(fixture.broker.acquire).not.toHaveBeenCalled()
})

test('a copied workspace and registry open on another Mac with every draft and completion', async () => {
  // Arrange: a source Mac with three drafts and one unsent completion
  const source = await createFixture({ existing: false })
  const seeded = buildDeviceWorkspace({
    categoryCount: 3,
    notes: { 1: 'First draft', 2: 'Second draft', 3: 'Third draft' },
  })
  const completionId = randomUUID()
  const operationId = randomUUID()
  seeded.completions[completionId] = {
    id: completionId,
    categoryId: categoryUuid(1),
    originalCategoryId: categoryUuid(1),
    title: 'Carried across Macs',
    rawText: 'Carried across Macs',
    lineId: randomUUID(),
    lineIndex: 0,
    completedAt: 1_800_000_000_000,
    originalCompletedAt: 1_800_000_000_000,
    timezone: 'Asia/Tokyo',
    revision: 1,
    undoUntil: 0,
    cancelled: false,
    restored: false,
    remote: null,
    clearAfter: null,
    cleared: false,
  }
  seeded.outbox[operationId] = {
    state: 'queued',
    operation: {
      operationId,
      completionId,
      deviceId: seeded.deviceId,
      revision: 1,
      expectedRemoteRevision: 0,
      kind: 'create',
      categoryId: categoryUuid(1),
      title: 'Carried across Macs',
      completedAt: 1_800_000_000_000,
      originalCompletedAt: 1_800_000_000_000,
      timezone: 'Asia/Tokyo',
    },
  }
  await new AtomicWorkspaceFile({
    directory: source.workspaces,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  }).initialize(seeded)
  await source.registry.read()
  const target = await createFixture({ existing: false })

  // Act: copy userData/offline the way Time Machine or Migration Assistant would
  await cp(source.directory, target.directory, { recursive: true })
  await target.controller.initialize()

  // Assert
  const snapshot = target.controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Expected a ready editor')
  const drafts = await Promise.all(
    [1, 2, 3].map(async (index) =>
      target.controller.draft(snapshot.generation, categoryUuid(index)),
    ),
  )
  expect(drafts.map((record) => record.draft.rows[0]?.text)).toEqual([
    'First draft',
    'Second draft',
    'Third draft',
  ])
  expect(
    (await target.controller.details(snapshot.generation, 0, 10)).records.map(
      (record) => record.completion.title,
    ),
  ).toEqual(['Carried across Macs'])
})

test('a corrupt device workspace and recovery copy open recovery and are never replaced by a fresh workspace', async () => {
  // Arrange
  const fixture = await createFixture()
  const file = new AtomicWorkspaceFile({
    directory: fixture.workspaces,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  await writeFile(file.path, 'broken snapshot', 'utf8')
  await writeFile(file.recoveryPath, 'broken recovery', 'utf8')

  // Act
  await fixture.controller.initialize()

  // Assert
  expect(fixture.controller.getSnapshot()).toMatchObject({
    phase: 'recovery',
    canRecover: false,
  })
  expect(await readFile(file.path, 'utf8')).toBe('broken snapshot')
  expect(await readFile(file.recoveryPath, 'utf8')).toBe('broken recovery')
})

test('signing in on a Mac that never attached waits for Connect and sends nothing to the sync endpoints', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()

  // Act
  await fixture.controller.authenticated('account-a')

  // Assert
  expect(syncCalls(fixture.transport)).toBe(0)
  expect(fixture.transport.whoami).toHaveBeenCalledOnce()
  expect(fixture.controller.accountStatus()).toMatchObject({
    state: 'never-attached',
    pendingConnect: { displayEmail: 'me@example.com' },
  })
  expect((await fixture.registry.read()).attachedAccountId).toBeNull()
})

test('the pending Connect prompt survives a relaunch', async () => {
  // Arrange
  const first = await createFixture()
  await first.controller.initialize()
  await first.controller.authenticated('account-a')
  await first.controller.shutdown()
  const relaunched = new OfflineEditorController({
    ...first.options,
    registry: new OfflineAccountRegistry(first.directory),
  })

  // Act
  await relaunched.initialize()

  // Assert
  expect(relaunched.accountStatus().pendingConnect).toEqual({
    displayEmail: 'me@example.com',
  })
  await relaunched.shutdown()
})

test('a payload account that differs from the verified identity is ignored and logged', async () => {
  // Arrange
  const fixture = await createFixture({
    identity: { clerkId: 'account-b', email: 'b@example.com' },
  })
  await fixture.controller.initialize()

  // Act
  await fixture.controller.authenticated('account-a')

  // Assert
  expect(fixture.log).toHaveBeenCalledWith('AUTH_IDENTITY_MISMATCH')
  expect(fixture.controller.accountStatus().pendingConnect).toBeNull()
  expect(syncCalls(fixture.transport)).toBe(0)
})

test('Connect this Mac binds the account, uploads and reports the Mac as synced', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()
  await completeOneLine(fixture.controller)
  await fixture.controller.authenticated('account-a')

  // Act
  const accepted = await fixture.controller.connect()

  // Assert
  expect(accepted).toBe(true)
  await vi.waitFor(() =>
    expect(fixture.controller.getSnapshot()).toMatchObject({
      sync: { state: 'synced', waitingCount: 0, boundEmail: 'me@example.com' },
    }),
  )
  expect(fixture.transport.apply).toHaveBeenCalledOnce()
  expect(fixture.controller.accountStatus()).toMatchObject({
    state: 'attached',
    boundEmail: 'me@example.com',
    pendingConnect: null,
  })
  expect((await readDevice(fixture.workspaces)).binding?.accountId).toBe(
    'account-a',
  )
})

test('Not now ends the session locally and keeps the Mac unbound', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()
  await fixture.controller.authenticated('account-a')

  // Act
  const result = await fixture.controller.notNow()

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledOnce()
  expect(fixture.controller.accountStatus()).toMatchObject({
    state: 'never-attached',
    pendingConnect: null,
  })
  expect((await readDevice(fixture.workspaces)).binding).toBeNull()
  expect(syncCalls(fixture.transport)).toBe(0)
})

test('a different account signed in over the bound one stays detached, sends nothing and keeps editing', async () => {
  // Arrange
  const fixture = await createFixture({
    bound: 'account-a',
    identity: { clerkId: 'account-b', email: 'b@example.com' },
  })
  await fixture.controller.initialize()

  // Act
  await fixture.controller.authenticated('account-b')

  // Assert
  expect(syncCalls(fixture.transport)).toBe(0)
  expect(fixture.controller.accountStatus()).toMatchObject({
    state: 'other-account',
    boundEmail: 'bound@example.com',
    signedInEmail: 'b@example.com',
  })
  await expect(completeOneLine(fixture.controller)).resolves.toBeUndefined()
})

test('the bound account signing in again re-attaches and resumes sync', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  expect(fixture.transport.bootstrap).not.toHaveBeenCalled()

  // Act
  await fixture.controller.authenticated('account-a')

  // Assert
  await vi.waitFor(() =>
    expect(fixture.controller.accountStatus().state).toBe('attached'),
  )
  await vi.waitFor(() => expect(fixture.transport.bootstrap).toHaveBeenCalled())
  expect((await fixture.registry.read()).attachedAccountId).toBe('account-a')
})

// Regression: /ship pre-landing review 2026-11-03 — a sign-out that started during the sign-in
// identity round trip was undone when that round trip resumed (re-attach + loop restart).
test('a sign-out that starts while the sign-in identity check is in flight is never undone by that check', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  const identityReply = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await identityReply.promise
    return { clerkId: 'account-a', email: null }
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )

  // Act
  const result = await fixture.controller.signOut()
  identityReply.resolve()
  await signingIn

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
  expect(fixture.controller.accountStatus().state).toBe('signed-out')
  expect(fixture.transport.bootstrap).not.toHaveBeenCalled()
})

// Regression: /ship Step 11 (Codex adversarial) 2026-11-03 — a sign-in notification queued before
// a sign-out was evaluated after it with the new epoch and re-attached the account.
test('a sign-in notification queued before a sign-out is dropped after that sign-out', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  const firstReply = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await firstReply.promise
    return { clerkId: 'account-a', email: null }
  })
  const first = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )
  const queued = fixture.controller.authenticated('account-a')

  // Act
  await fixture.controller.signOut()
  firstReply.resolve()
  await Promise.all([first, queued])

  // Assert
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
  expect(fixture.transport.whoami).toHaveBeenCalledOnce()
  expect(fixture.transport.bootstrap).not.toHaveBeenCalled()
})

// Regression: /ship Step 11 (Codex adversarial) 2026-11-03 — the attached fast path skipped the
// verified sign-in that clears a journaled sign-out, so sync never resumed.
test('signing in again after a sign-out whose detach and sweep both failed re-attaches and clears the journal', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (Object.keys(patch).join() === 'attachedAccountId')
      throw new Error('disk full')
    return realUpdate(patch)
  })
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()

  // Act
  await fixture.controller.authenticated('account-a')

  // Assert
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
  expect(fixture.controller.accountStatus().state).toBe('attached')
})

// Regression: /ship Step 11 (Codex adversarial) 2026-11-03 — Clear again detached a sign-in that
// had completed after the residual result.
test('Clear again after a later successful sign-in leaves that sign-in attached and sweeps nothing', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  await fixture.controller.authenticated('account-a')
  const sweepsBefore = fixture.endLocalSession.mock.calls.length

  // Act
  const result = await fixture.controller.clearAgain()

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledTimes(sweepsBefore)
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship Step 11 rerun (Codex adversarial) 2026-11-03 — a login that reported in while
// Clear again was sweeping re-attached the Mac and cleared the journal behind a residual result.
test('a sign-in that reports in while Clear again is sweeping cannot attach the Mac', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const sweep = deferred()
  fixture.endLocalSession.mockImplementationOnce(async () => {
    await sweep.promise
    return {
      status: 'signed-out-residual',
      code: 'SIGNOUT_RESIDUAL_COOKIE',
      cookieNames: ['__session'],
      domains: ['corelive.app'],
    }
  })
  const clearing = fixture.controller.clearAgain()
  await vi.waitFor(() =>
    expect(fixture.endLocalSession).toHaveBeenCalledTimes(2),
  )

  // Act
  const reported = fixture.controller.authenticated('account-a')
  sweep.resolve()
  const [result] = await Promise.all([clearing, reported])

  // Assert
  expect(result).toMatchObject({ status: 'signed-out-residual' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: true,
  })
  expect(fixture.controller.accountStatus().state).not.toBe('attached')
})

// Regression: /ship exception review (Codex adversarial) 2026-11-03 — an attach already being saved
// when Clear again started landed during the sweep, leaving a residual result on an attached Mac.
test('a sign-in already saving its attach when Clear again starts wins, and Clear again sweeps nothing', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const residual = {
    status: 'signed-out-residual' as const,
    code: 'SIGNOUT_RESIDUAL_COOKIE' as const,
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  }
  fixture.endLocalSession.mockResolvedValueOnce(residual)
  await fixture.controller.signOut()
  fixture.endLocalSession.mockResolvedValueOnce(residual)
  const attachSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const attachWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.attachedAccountId === 'account-a') {
      attachWrite()
      await attachSaved.promise
    }
    return realUpdate(patch)
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() => expect(attachWrite).toHaveBeenCalledOnce())

  // Act
  const clearing = fixture.controller.clearAgain()
  attachSaved.resolve()
  const [result] = await Promise.all([clearing, signingIn])

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledOnce()
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship exception review (Codex adversarial) 2026-11-03 — a sign-in reported during the
// sweep waited behind an older identity check and attached once the sweep had finished.
test('a sign-in reported while Clear again sweeps is dropped even when an older sign-in check is still waiting', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const residual = {
    status: 'signed-out-residual' as const,
    code: 'SIGNOUT_RESIDUAL_COOKIE' as const,
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  }
  fixture.endLocalSession.mockResolvedValueOnce(residual)
  await fixture.controller.signOut()
  const olderReply = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await olderReply.promise
    return { clerkId: 'account-a', email: null }
  })
  const older = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )
  const sweep = deferred()
  fixture.endLocalSession.mockImplementationOnce(async () => {
    await sweep.promise
    return residual
  })
  const clearing = fixture.controller.clearAgain()

  // Act
  const reported = fixture.controller.authenticated('account-a')
  sweep.resolve()
  olderReply.resolve()
  const [result] = await Promise.all([clearing, older, reported])

  // Assert
  expect(result).toEqual(residual)
  expect(fixture.transport.whoami).toHaveBeenCalledOnce()
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: true,
  })
})

// Regression: /ship exception review round 2 (Codex + Claude adversarial) 2026-11-03 — an explicit
// sign-out during a Clear again that found a racing sign-in attached shared its no-op result.
test('an explicit sign-out during a Clear again that finds the Mac signed in again still signs out', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const attachSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const attachWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.attachedAccountId === 'account-a') {
      attachWrite()
      await attachSaved.promise
    }
    return realUpdate(patch)
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() => expect(attachWrite).toHaveBeenCalledOnce())
  const clearing = fixture.controller.clearAgain()

  // Act
  const explicit = fixture.controller.signOut()
  attachSaved.resolve()
  const [cleared, signedOut] = await Promise.all([
    clearing,
    explicit,
    signingIn,
  ])

  // Assert
  expect(cleared).toEqual({ status: 'signed-out' })
  expect(signedOut).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledTimes(2)
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
})

// Regression: /ship exception review round 2 (Codex adversarial) 2026-11-03 — a sign-in reported
// during a sign-out that was then cancelled by a failed save was dropped, so sync never resumed.
test('a sign-in reported during a sign-out that fails to save is kept and attaches', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  const flushed = deferred()
  fixture.requestFlush.mockImplementationOnce(async () => {
    await flushed.promise
    return false
  })
  const signingOut = fixture.controller.signOut()

  // Act
  const reported = fixture.controller.authenticated('account-a')
  flushed.resolve()
  const [result] = await Promise.all([signingOut, reported])

  // Assert
  expect(result).toMatchObject({ status: 'flush-failed' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship exception review round 2 (Claude adversarial) 2026-11-03 — Clear again waited on
// the whole sign-in queue, so a hung identity check left "Clearing…" forever.
test('Clear again does not wait forever on a sign-in whose identity check hangs', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const hung = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await hung.promise
    return { clerkId: 'account-a', email: null }
  })
  const stuck = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )

  // Act
  const result = await fixture.controller.clearAgain()
  hung.resolve()
  await stuck

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
})

// Regression: /ship exception review round 3 (Codex adversarial) 2026-11-03 — on an unbound Mac a
// sign-out shared a Clear again that a Connect prompt had made a no-op, leaving the session alive.
test('an explicit sign-out during a Clear again on an unbound Mac ends the session that reached Connect', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const promptSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const promptWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.pendingConnect?.accountId === 'account-a') {
      promptWrite()
      await promptSaved.promise
    }
    return realUpdate(patch)
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() => expect(promptWrite).toHaveBeenCalledOnce())
  const clearing = fixture.controller.clearAgain()

  // Act
  const explicit = fixture.controller.signOut()
  promptSaved.resolve()
  const [, signedOut] = await Promise.all([clearing, explicit, signingIn])

  // Assert
  expect(signedOut).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledTimes(2)
  expect(fixture.controller.accountStatus().pendingConnect).toBeNull()
  expect(await fixture.registry.read()).toMatchObject({
    pendingConnect: null,
    signOutPending: false,
  })
})

// Regression: /ship exception review round 3 (Codex + Claude adversarial) 2026-11-03 — a sign-out
// cancelled by a failed save still invalidated a sign-in that had arrived before it.
test('a sign-in that arrived before a sign-out cancelled by a failed save still attaches', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  const identityReply = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await identityReply.promise
    return { clerkId: 'account-a', email: null }
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )
  fixture.requestFlush.mockResolvedValueOnce(false)

  // Act
  const result = await fixture.controller.signOut()
  identityReply.resolve()
  await signingIn

  // Assert
  expect(result).toMatchObject({ status: 'flush-failed' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship exception review round 3 (Codex adversarial) 2026-11-03 — a Clear again that
// found nothing to clear still dropped the sign-in of the session that stayed alive.
test('a sign-in reported during a Clear again that clears nothing is still handled', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const attachSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const attachWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.attachedAccountId === 'account-a') {
      attachWrite()
      await attachSaved.promise
    }
    return realUpdate(patch)
  })
  const signingInA = fixture.controller.authenticated('account-a')
  await vi.waitFor(() => expect(attachWrite).toHaveBeenCalledOnce())
  const clearing = fixture.controller.clearAgain()
  // The identity check asks with no expected account; the woken sync loop asks for account-a.
  fixture.broker.acquire.mockImplementation(
    async (expectedAccountId, generation) => ({
      status: 'ready',
      credential: {
        status: 'ready',
        requestId: randomUUID(),
        expectedAccountId,
        generation,
        accountId: expectedAccountId ?? 'account-b',
        token: 'test-token',
      },
    }),
  )
  fixture.transport.whoami.mockImplementation(async () => ({
    clerkId: 'account-b',
    email: 'b@example.com',
  }))

  // Act
  const signingInB = fixture.controller.authenticated('account-b')
  attachSaved.resolve()
  await Promise.all([clearing, signingInA, signingInB])

  // Assert
  expect(fixture.endLocalSession).toHaveBeenCalledOnce()
  expect(fixture.controller.accountStatus().state).toBe('other-account')
  expect((await fixture.registry.read()).attachedAccountId).toBeNull()
})

// Regression: /ship exception review round 3 (Claude adversarial) 2026-11-03 — a failing final detach
// write rejected the sign-out after the session had already been swept.
test('a sign-out whose final detach write fails still finishes and keeps the journal for next launch', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.signOutPending === false && patch.attachedAccountId === null)
      throw new Error('disk full')
    return realUpdate(patch)
  })

  // Act
  const result = await fixture.controller.signOut()

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(fixture.log).toHaveBeenCalledWith('SIGNOUT_DETACH_DEFERRED')
  expect((await fixture.registry.read()).signOutPending).toBe(true)
  expect(fixture.controller.accountStatus().state).toBe('signed-out')
})

// Regression: /ship exception review round 3 (Claude adversarial) 2026-11-03 — after a deferred detach
// the editor kept showing a synced state while Settings said signed out.
test('after a sign-out whose detach was deferred the editor shows local-only sync', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (Object.keys(patch).join() === 'attachedAccountId')
      throw new Error('disk full')
    return realUpdate(patch)
  })
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })

  // Act
  await fixture.controller.signOut()

  // Assert
  const snapshot = fixture.controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Expected a ready editor')
  expect(snapshot.sync.state).toBe('local-only')
})

// Regression: /ship exception review round 3 (Claude adversarial) 2026-11-03 — Connect used the prompt
// it read before its worker calls and attached that account after a newer sign-in replaced it.
test('Connect attaches nothing when a newer sign-in replaced the prompt while it was preparing', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()
  await fixture.controller.authenticated('account-a')
  const realCall = WorkspaceWorkerClient.prototype.call
  const totalAsked = vi.fn()
  const totalGate = deferred()
  const callSpy = vi
    .spyOn(WorkspaceWorkerClient.prototype, 'call')
    .mockImplementation(async function (
      this: WorkspaceWorkerClient,
      type,
      input,
    ) {
      if (type === 'pendingTotal') {
        totalAsked()
        await totalGate.promise
      }
      return realCall.call(this, type, input)
    })
  onTestFinished(() => callSpy.mockRestore())
  const connecting = fixture.controller.connect()
  await vi.waitFor(() => expect(totalAsked).toHaveBeenCalledOnce())
  fixture.broker.acquire.mockImplementation(
    async (expectedAccountId, generation) => ({
      status: 'ready',
      credential: {
        status: 'ready',
        requestId: randomUUID(),
        expectedAccountId,
        generation,
        accountId: 'account-b',
        token: 'test-token',
      },
    }),
  )
  fixture.transport.whoami.mockImplementation(async () => ({
    clerkId: 'account-b',
    email: 'b@example.com',
  }))
  await fixture.controller.authenticated('account-b')

  // Act
  totalGate.resolve()
  const connected = await connecting

  // Assert
  expect(connected).toBe(false)
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    pendingConnect: { accountId: 'account-b' },
  })
})

// Regression: /ship exception review round 4 (Codex adversarial) 2026-11-03 — a sign-in made after
// the sweep, while the final detach was being saved, was dropped as part of the ended session.
test('a sign-in made after the sign-out sweep is kept while the final detach is being saved', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const detachSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const finalWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.signOutPending === false && patch.attachedAccountId === null) {
      finalWrite()
      await detachSaved.promise
    }
    return realUpdate(patch)
  })
  const signingOut = fixture.controller.signOut()
  await vi.waitFor(() => expect(finalWrite).toHaveBeenCalledOnce())

  // Act
  const signingIn = fixture.controller.authenticated('account-a')
  detachSaved.resolve()
  const [result] = await Promise.all([signingOut, signingIn])

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship exception review round 4 (Codex adversarial) 2026-11-03 — quitting did not wait for
// a sign-out in flight, so the app could exit before its journal reached disk.
test('quitting during a sign-out waits until that sign-out has finished', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const journalSaved = deferred()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  const journalWrite = vi.fn()
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.signOutPending === true) {
      journalWrite()
      await journalSaved.promise
    }
    return realUpdate(patch)
  })
  const signingOut = fixture.controller.signOut()
  await vi.waitFor(() => expect(journalWrite).toHaveBeenCalledOnce())
  const quitFinished = vi.fn()

  // Act
  const quitting = fixture.controller.shutdown().then(quitFinished)
  await new Promise((resolve) => setTimeout(resolve, 20))
  const quitBeforeJournal = quitFinished.mock.calls.length
  journalSaved.resolve()
  await Promise.all([signingOut, quitting])

  // Assert
  expect(quitBeforeJournal).toBe(0)
  expect(quitFinished).toHaveBeenCalledWith(true)
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
})

// Regression: /ship exception review round 4 (Codex + Claude adversarial) 2026-11-03 — a sign-out
// cancelled by a failed journal write still invalidated a sign-in that had arrived before it.
test('a sign-in queued before a sign-out whose journal write fails still attaches', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a' })
  await fixture.controller.initialize()
  const identityReply = deferred()
  fixture.transport.whoami.mockImplementationOnce(async () => {
    await identityReply.promise
    return { clerkId: 'account-a', email: null }
  })
  const signingIn = fixture.controller.authenticated('account-a')
  await vi.waitFor(() =>
    expect(fixture.transport.whoami).toHaveBeenCalledOnce(),
  )
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (patch.signOutPending === true) throw new Error('disk full')
    return realUpdate(patch)
  })

  // Act
  const result = await fixture.controller.signOut()
  identityReply.resolve()
  await signingIn

  // Assert
  expect(result).toMatchObject({ status: 'flush-failed' })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
})

// Regression: /ship exception review round 4 (Claude adversarial) 2026-11-03 — a sign-in for another
// account right after Connect, before the binding existed, left one account attached and the other
// account's Connect prompt showing.
test('another account signing in right after Connect, before the binding exists, detaches and offers it Connect', async () => {
  // Arrange
  const fixture = await createFixture()
  await fixture.controller.initialize()
  fixture.transport.bootstrap.mockImplementation(
    async () => new Promise<never>(() => undefined),
  )
  await fixture.controller.authenticated('account-a')
  await fixture.controller.connect()
  // The identity check asks with no expected account; a woken sync loop asks for account-a.
  fixture.broker.acquire.mockImplementation(
    async (expectedAccountId, generation) => ({
      status: 'ready',
      credential: {
        status: 'ready',
        requestId: randomUUID(),
        expectedAccountId,
        generation,
        accountId: expectedAccountId ?? 'account-b',
        token: 'test-token',
      },
    }),
  )
  fixture.transport.whoami.mockImplementation(async () => ({
    clerkId: 'account-b',
    email: 'b@example.com',
  }))

  // Act
  await fixture.controller.authenticated('account-b')

  // Assert
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    pendingConnect: { accountId: 'account-b' },
  })
  expect(fixture.controller.accountStatus().pendingConnect).toEqual({
    displayEmail: 'b@example.com',
  })
})

// Regression: /ship exception review round 4 (Claude adversarial) 2026-11-03 — Clear again during a
// sign-out cancelled by a failed save returned that flush-failed and swept nothing.
test('Clear again during a sign-out that fails to save still clears the leftover sign-in data', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })
  await fixture.controller.signOut()
  const flushed = deferred()
  fixture.requestFlush.mockImplementationOnce(async () => {
    await flushed.promise
    return false
  })
  const signingOut = fixture.controller.signOut()

  // Act
  const clearing = fixture.controller.clearAgain()
  flushed.resolve()
  const [, cleared] = await Promise.all([signingOut, clearing])

  // Assert
  expect(cleared).toEqual({ status: 'signed-out' })
  expect(fixture.endLocalSession).toHaveBeenCalledTimes(2)
  expect((await fixture.registry.read()).signOutPending).toBe(false)
})

// Regression: /ship Step 11 (Codex adversarial) 2026-11-03 — a sweep that threw rejected the
// sign-out, so Settings showed neither the cleanup note nor Clear again.
test('a session sweep that throws ends in the residual result with the journal kept for Clear again', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.endLocalSession.mockRejectedValueOnce(
    new Error('cookies unavailable'),
  )

  // Act
  const result = await fixture.controller.signOut()

  // Assert
  expect(result).toEqual({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: [],
    domains: [],
  })
  expect((await fixture.registry.read()).signOutPending).toBe(true)
  expect(fixture.log).toHaveBeenCalledWith('SIGNOUT_SWEEP_FAILED')
})

// Regression: /ship Step 11 (Codex structured review) 2026-11-03 — the sign-out flush left the
// open editor's exit barrier set, so writing stayed disabled after a Settings sign-out.
test('signing out releases the open editor once its writing is saved, so editing continues', async () => {
  // Arrange
  const releaseEditorBarrier = vi.fn()
  const fixture = await createFixture({
    bound: 'account-a',
    attached: true,
    override: { releaseEditorBarrier },
  })
  await fixture.controller.initialize()

  // Act
  await fixture.controller.signOut()

  // Assert
  expect(releaseEditorBarrier).toHaveBeenCalledOnce()
})

test('sign-out completes offline with unsent operations, keeps the editor ready and the binding untouched', async () => {
  // Arrange
  const transport = createTransport({ clerkId: 'account-a', email: null })
  transport.bootstrap.mockRejectedValue(new Error('network down'))
  const fixture = await createFixture({
    bound: 'account-a',
    attached: true,
    transport,
  })
  fixture.broker.revoke.mockResolvedValue('skipped')
  await fixture.controller.initialize()
  await completeOneLine(fixture.controller)
  const before = await readDevice(fixture.workspaces)

  // Act
  const result = await fixture.controller.signOut()

  // Assert
  expect(result).toEqual({ status: 'signed-out' })
  const after = await readDevice(fixture.workspaces)
  expect(Object.keys(after.outbox)).toEqual(Object.keys(before.outbox))
  expect(after.binding).toEqual(before.binding)
  expect(fixture.controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    sync: { state: 'local-only', waitingCount: 1 },
  })
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: null,
    signOutPending: false,
  })
  expect(fixture.log).toHaveBeenCalledWith('SIGNOUT_REMOTE_REVOKE_SKIPPED')
})

test('sign-out runs flush, journal, revoke and local session end in that order', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  const order: string[] = []
  fixture.requestFlush.mockImplementation(async () => {
    order.push('flush')
    return true
  })
  fixture.broker.revoke.mockImplementation(async () => {
    order.push(
      `revoke journal=${(await fixture.registry.read()).signOutPending}`,
    )
    return 'revoked'
  })
  fixture.endLocalSession.mockImplementation(async () => {
    order.push('end-session')
    return { status: 'signed-out' }
  })
  await fixture.controller.initialize()

  // Act
  await fixture.controller.signOut()

  // Assert
  expect(order).toEqual(['flush', 'revoke journal=true', 'end-session'])
})

test('a failed disk flush cancels sign-out without any side effect', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  fixture.requestFlush.mockResolvedValue(false)

  // Act
  const result = await fixture.controller.signOut()

  // Assert
  expect(result).toEqual({
    status: 'flush-failed',
    code: 'SIGNOUT_FLUSH_FAILED',
  })
  expect(fixture.endLocalSession).not.toHaveBeenCalled()
  expect(await fixture.registry.read()).toMatchObject({
    attachedAccountId: 'account-a',
    signOutPending: false,
  })
  expect(fixture.log).toHaveBeenCalledWith('SIGNOUT_FLUSH_FAILED')
})

test('a residual cookie keeps the journal set and Clear again finishes it', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const residual = {
    status: 'signed-out-residual' as const,
    code: 'SIGNOUT_RESIDUAL_COOKIE' as const,
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  }
  fixture.endLocalSession.mockResolvedValueOnce(residual)

  // Act
  const first = await fixture.controller.signOut()
  const journalAfterResidual = (await fixture.registry.read()).signOutPending
  const second = await fixture.controller.clearAgain()

  // Assert
  expect(first).toEqual(residual)
  expect(journalAfterResidual).toBe(true)
  expect(second).toEqual({ status: 'signed-out' })
  expect((await fixture.registry.read()).signOutPending).toBe(false)
})

// Regression: /ship pre-landing review 2026-11-03 (pass 2) — a deferred detach plus a residual sweep
// left the signed-out Mac reported as attached.
test('a sign-out whose detach write fails and whose sweep is residual never reports the Mac as attached', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()
  const realUpdate = fixture.registry.update.bind(fixture.registry)
  vi.spyOn(fixture.registry, 'update').mockImplementation(async (patch) => {
    if (Object.keys(patch).join() === 'attachedAccountId')
      throw new Error('disk full')
    return realUpdate(patch)
  })
  fixture.endLocalSession.mockResolvedValueOnce({
    status: 'signed-out-residual',
    code: 'SIGNOUT_RESIDUAL_COOKIE',
    cookieNames: ['__session'],
    domains: ['corelive.app'],
  })

  // Act
  const result = await fixture.controller.signOut()

  // Assert
  expect(result.status).toBe('signed-out-residual')
  expect(fixture.controller.accountStatus().state).toBe('signed-out')
  expect(fixture.log).toHaveBeenCalledWith('SIGNOUT_DETACH_DEFERRED')
})

test('a crash after detach is finished at the next launch before any attach, and a lingering session does not re-attach', async () => {
  // Arrange
  const fixture = await createFixture({
    bound: 'account-a',
    signOutPending: true,
  })

  // Act
  await fixture.controller.initialize()

  // Assert
  expect(fixture.endLocalSession).toHaveBeenCalledOnce()
  expect((await fixture.registry.read()).signOutPending).toBe(false)
  expect(fixture.broker.acquire).not.toHaveBeenCalled()
  expect(syncCalls(fixture.transport)).toBe(0)
  expect(fixture.controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    sync: { state: 'local-only' },
  })
})

test.each(['settling', 'never-settling'] as const)(
  'signing out during an in-flight batch with a %s request leaves the operation uncertain for the bound account',
  async (kind) => {
    // Arrange
    const transport = createTransport({ clerkId: 'account-a', email: null })
    transport.apply.mockImplementation(
      async (_input, signal) =>
        new Promise((_resolve, reject) => {
          if (kind === 'settling')
            signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            )
        }),
    )
    const fixture = await createFixture({
      bound: 'account-a',
      attached: true,
      transport,
    })
    await fixture.controller.initialize()
    await completeOneLine(fixture.controller)
    await vi.waitFor(() => expect(transport.apply).toHaveBeenCalledOnce())

    // Act
    const result = await fixture.controller.signOut()

    // Assert
    expect(result).toEqual({ status: 'signed-out' })
    const state = await readDevice(fixture.workspaces)
    expect(Object.values(state.outbox).map((entry) => entry.state)).toEqual([
      'sent',
    ])
    expect(state.binding?.accountId).toBe('account-a')
  },
)

test('an expired session of the attached account asks to sign in to sync, but a deliberate sign-out never does', async () => {
  // Arrange
  const fixture = await createFixture({ bound: 'account-a', attached: true })
  await fixture.controller.initialize()

  // Act
  fixture.controller.sessionUnavailable()
  const expired = fixture.controller.getSnapshot()
  await fixture.controller.signOut()
  const signedOut = fixture.controller.getSnapshot()

  // Assert
  expect(expired).toMatchObject({ sync: { state: 'sign-in-to-sync' } })
  expect(signedOut).toMatchObject({ sync: { state: 'local-only' } })
})

test('signing out while another account is signed in leaves the binding, outbox and last sync time untouched', async () => {
  // Arrange
  const fixture = await createFixture({
    bound: 'account-a',
    identity: { clerkId: 'account-b', email: 'b@example.com' },
  })
  await fixture.controller.initialize()
  await completeOneLine(fixture.controller)
  await fixture.controller.authenticated('account-b')
  const before = await readDevice(fixture.workspaces)

  // Act
  await fixture.controller.signOut()

  // Assert
  const after = await readDevice(fixture.workspaces)
  expect(after.binding).toEqual(before.binding)
  expect(after.outbox).toEqual(before.outbox)
  expect(fixture.controller.accountStatus().state).toBe('signed-out')
})
