import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
import { afterEach, expect, test, vi } from 'vitest'

import { DurableEditorStore } from '../../renderer/editor/DurableEditorStore'
import type { WindowManager } from '../WindowManager'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import {
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
    onSettingsContext: vi.fn(),
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
      } as unknown as WindowManager,
      controller,
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
      manageCategories: async () => undefined,
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
      onCategoryCreated: () => () => undefined,
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
      } as unknown as WindowManager,
      controller,
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
