import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { OfflineEditorAPI } from '@corelive/desktop-contract/offline-editor-api'
import {
  OfflineWorkspaceSchema,
  type OfflineEditorSnapshot,
} from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { DurableEditorStore } from '@corelive/live-editor/store'
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { afterEach, expect, test, vi } from 'vitest'

import type { WindowManager } from '../WindowManager'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
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
const category = {
  id: 1,
  name: 'General',
  color: 'blue',
  isDefault: true,
  parentId: null,
  removed: false,
} as const
const preferences = {
  revision: 0,
  theme: 'warm-cathedral-dark',
  settings: UserSettingsStateSchema.parse({
    liveEditorFontFamily: 'sans',
    liveEditorFontSize: 19,
  }),
}

/** Uses real account files and worker threads with synthetic auth; never launches Electron.
 * @example const fixture = await createFixture(true)
 */
async function createFixture(
  prepared: boolean,
  override: Partial<Options> = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-controller-'))
  const registry = new OfflineAccountRegistry(directory)
  await registry.read()
  const workers: WorkspaceWorkerClient[] = []
  const actor = (ownerId: string): WorkspaceWorkerClient => {
    const worker = new WorkspaceWorkerClient({
      directory: join(directory, 'workspaces'),
      ownerId,
      script: new URL('./workspace-worker.ts', import.meta.url),
      execArgv: ['--import', 'tsx'],
    })
    workers.push(worker)
    return worker
  }
  if (prepared) {
    const worker = actor('account-a')
    await worker.call('prepare', {
      ownerId: 'account-a',
      deviceId: randomUUID(),
      categories: [category],
      preferences,
      legacyNotes: { '1': 'Writing survives offline startup' },
    })
    await worker.close()
    await registry.activateVerified('account-a')
  }
  const broker = {
    acquire: vi.fn<Options['broker']['acquire']>(async () => ({
      status: 'unavailable',
    })),
    reset: vi.fn(),
  }
  const requestFlush = vi.fn<Options['requestFlush']>(async () => true)
  const snapshots: OfflineEditorSnapshot[] = []
  const options: Options = {
    directory,
    registry,
    actor,
    workerScript: 'unused-with-actor-factory',
    broker,
    transport: () => {
      throw new Error('No test network transport')
    },
    requestFlush,
    onPreparationCancelled: vi.fn(),
    legacyNotes: () => ({ '1': 'Imported only after preparation' }),
    openSettingsForPreparation: vi.fn(),
    onSettingsContext: vi.fn(),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    ...override,
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
    registry,
    broker,
    requestFlush,
    snapshots,
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

/** Holds a specific worker/registry boundary until a concurrency test releases it.
 * @example const gate = deferred(); gate.resolve(); await gate.promise
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test.each(['after', 'before', 'queued'] as const)(
  'failed writing survives a renderer restart %s the worker response until acknowledged recovery',
  async (ordering) => {
    // Arrange: real controller, worker and disk; only the preload transport is in-process.
    const listeners = new Set<(snapshot: OfflineEditorSnapshot) => void>()
    const { controller, options } = await createFixture(true, {
      onSnapshot: (snapshot) => ipc.publish(snapshot),
    })
    const reached = deferred()
    const release = deferred()
    const originalActor = options.actor!
    options.actor = (ownerId) => {
      const worker = originalActor(ownerId)
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

test.each([
  { mode: 'prepare', ordering: 'lock-first' },
  { mode: 'recover', ordering: 'lock-first' },
  { mode: 'prepare', ordering: 'worker-first' },
  { mode: 'recover', ordering: 'worker-first' },
] as const)(
  'logout stays durably locked after in-flight $mode with $ordering scheduling',
  async ({ mode, ordering }) => {
    // Arrange
    const fixture = await createFixture(true, {
      transport: () => ({
        bootstrap: async () => ({
          accountId: 'account-a',
          categories: [category],
          deletions: [],
        }),
        apply: async () => ({ receipts: [] }),
        receipts: async () => ({ receipts: [] }),
        checkpoint: async () => {
          throw new Error('No count response')
        },
      }),
    })
    const { controller, options, broker, registry, directory } = fixture
    await registry.lock()
    if (mode === 'recover') {
      const file = new AtomicWorkspaceFile({
        directory: join(directory, 'workspaces'),
        ownerId: 'account-a',
        parse: OfflineWorkspaceSchema.parse,
      })
      await file.update((state) => ({ ...state, revision: state.revision + 1 }))
      await writeFile(file.path, 'Synthetic damaged primary')
    }
    const reached = deferred()
    const releaseWorker = deferred()
    let logout: Promise<boolean> | undefined
    let heldWorkerResult = false
    const originalActor = options.actor!
    options.actor = (ownerId) => {
      const worker = originalActor(ownerId)
      const originalCall = worker.call.bind(worker)
      worker.call = async <K extends keyof WorkspaceWorkerCalls>(
        method: K,
        input: WorkspaceWorkerCalls[K]['input'],
      ): Promise<WorkspaceWorkerCalls[K]['output']> => {
        const result = await originalCall(method, input)
        if (
          !heldWorkerResult &&
          method === (mode === 'prepare' ? 'categories' : 'recover')
        ) {
          heldWorkerResult = true
          reached.resolve()
          await releaseWorker.promise
          // Start logout just before the controller resumes from this worker result.
          if (ordering === 'worker-first') {
            queueMicrotask(() => {
              logout = controller.signOut()
            })
          }
        }
        return result
      }
      return worker
    }
    broker.acquire.mockImplementation(
      async (expectedAccountId, generation) => ({
        status: 'ready',
        credential: {
          status: 'ready',
          requestId: randomUUID(),
          expectedAccountId,
          generation,
          accountId: 'account-a',
          token: 'synthetic-test-token',
        },
      }),
    )
    await controller.initialize()
    controller.authenticated('account-a', true)
    let recovering: Promise<boolean> | undefined
    if (mode === 'recover') {
      await vi.waitFor(() =>
        expect(controller.getSnapshot().phase).toBe('recovery'),
      )
      recovering = controller.recover(controller.getSnapshot().generation)
    }
    await reached.promise
    const lockCommitted = deferred()
    const releaseLock = deferred()
    const originalLock = registry.lock.bind(registry)
    vi.spyOn(registry, 'lock').mockImplementationOnce(async () => {
      const state = await originalLock()
      lockCommitted.resolve()
      await releaseLock.promise
      return state
    })
    const activate = vi.spyOn(registry, 'activateVerified')

    // Act: cover both an installed barrier and logout starting at the activation boundary.
    if (ordering === 'lock-first') logout = controller.signOut()
    else releaseWorker.resolve()
    try {
      await lockCommitted.promise
      releaseWorker.resolve()
      await new Promise<void>((resolve) => setImmediate(resolve))
    } finally {
      releaseWorker.resolve()
      releaseLock.resolve()
    }
    expect(await logout).toBe(true)
    if (recovering) {
      const recovered = await recovering
      if (ordering === 'lock-first') expect(recovered).toBe(false)
    }
    const restarted = new OfflineEditorController(options)
    await restarted.initialize()

    // Assert
    if (ordering === 'lock-first') expect(activate).not.toHaveBeenCalled()
    expect((await registry.read()).activeAccountId).toBeNull()
    expect(controller.getSnapshot().phase).toBe('locked')
    expect(restarted.getSnapshot().phase).toBe('locked')
    await restarted.shutdown()
  },
)

test('a prepared Mac opens its writing and saved appearance without waiting for authentication', async () => {
  // Arrange
  const { controller, broker } = await createFixture(true)
  broker.acquire.mockImplementation(async () => new Promise(() => undefined))

  // Act
  await controller.initialize()

  // Assert
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    generation: 0,
    workspace: {
      preferences: {
        theme: 'warm-cathedral-dark',
        settings: { liveEditorFontSize: 19 },
      },
      draft: { rows: [{ text: 'Writing survives offline startup' }] },
    },
  })
  expect(broker.acquire).toHaveBeenCalledWith('account-a', 0)
})

test('session expiry preserves editing while explicit logout locks the next offline launch', async () => {
  // Arrange
  const { controller, options, requestFlush } = await createFixture(true)
  await controller.initialize()

  // Act
  controller.sessionUnavailable()
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    sync: 'sign-in-required',
  })
  await controller.signOut()
  const restarted = new OfflineEditorController(options)
  await restarted.initialize()
  restarted.authenticated('account-a')

  // Assert
  expect(requestFlush).toHaveBeenCalledWith(0)
  expect(controller.getSnapshot()).toEqual({
    phase: 'locked',
    generation: 1,
    sequence: expect.any(Number),
  })
  expect(restarted.getSnapshot()).toEqual({
    phase: 'locked',
    generation: 0,
    sequence: expect.any(Number),
  })
  await restarted.shutdown()
})

test('a failed final save cancels logout and leaves the same account available for recovery', async () => {
  // Arrange
  const { controller, requestFlush, registry } = await createFixture(true)
  await controller.initialize()
  requestFlush.mockResolvedValue(false)

  // Act
  const signedOut = await controller.signOut()

  // Assert
  expect(signedOut).toBe(false)
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    generation: 0,
  })
  expect((await registry.read()).activeAccountId).toBe('account-a')
})

test.each(['failed', 'rejected'] as const)(
  'a %s account-switch save preserves the current account and accepts a later save',
  async (failure) => {
    // Arrange
    const { controller, requestFlush, registry, broker, snapshots } =
      await createFixture(true)
    await controller.initialize()
    const release = deferred()
    requestFlush.mockImplementation(async () => {
      await release.promise
      if (failure === 'rejected') throw new Error('Synthetic flush failure')
      return false
    })
    broker.acquire.mockClear()
    const lock = vi.spyOn(registry, 'lock')

    // Act: repeated login notifications must share the pending transition.
    for (let notification = 0; notification < 8; notification++)
      controller.authenticated('account-b', true)
    try {
      expect(requestFlush).toHaveBeenCalledOnce()
      expect(controller.getSnapshot()).toMatchObject({
        phase: 'ready',
        generation: 0,
        workspace: { ownerId: 'account-a' },
      })
    } finally {
      release.resolve()
    }
    await new Promise<void>((resolve) => setImmediate(resolve))

    // Assert: no generation/phase/registry change can clear the live editor.
    expect(snapshots.every((snapshot) => snapshot.phase === 'ready')).toBe(true)
    expect(lock).not.toHaveBeenCalled()
    expect(broker.acquire).not.toHaveBeenCalled()
    expect((await registry.read()).activeAccountId).toBe('account-a')
    const snapshot = controller.getSnapshot()
    if (snapshot.phase !== 'ready') throw new Error('Current editor was lost')
    await expect(
      controller.command(0, {
        type: 'save',
        commandId: randomUUID(),
        categoryId: 1,
        baseRevision: snapshot.workspace.draft.revision,
        rows: [{ id: randomUUID(), text: 'Writing can still be saved' }],
      }),
    ).resolves.toMatchObject({ ok: true, generation: 0 })
    controller.authenticated('account-b', true)
    expect(requestFlush).toHaveBeenCalledTimes(2)
    await new Promise<void>((resolve) => setImmediate(resolve))
  },
)

test('account switching waits for the departing draft to commit before opening the next account', async () => {
  // Arrange
  const { controller, requestFlush, broker, registry, directory } =
    await createFixture(true)
  await controller.initialize()
  const snapshot = controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Missing prepared account')
  const release = deferred()
  requestFlush.mockImplementation(async (generation) => {
    await release.promise
    const result = await controller.command(generation, {
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: snapshot.workspace.draft.revision,
      rows: [{ id: randomUUID(), text: 'Final writing from account A' }],
    })
    return result.ok
  })
  broker.acquire.mockClear()
  const lock = vi.spyOn(registry, 'lock')

  // Act
  controller.authenticated('account-b', true)
  try {
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      generation: 0,
    })
    expect(lock).not.toHaveBeenCalled()
    expect(broker.acquire).not.toHaveBeenCalled()
  } finally {
    release.resolve()
  }
  await vi.waitFor(() =>
    expect(broker.acquire).toHaveBeenCalledWith('account-b', 1),
  )

  // Assert: the actual departing account file contains its last acknowledged text.
  const file = new AtomicWorkspaceFile({
    directory: join(directory, 'workspaces'),
    ownerId: 'account-a',
    parse: OfflineWorkspaceSchema.parse,
  })
  expect((await file.read()).drafts['1']).toMatchObject({
    rows: [{ text: 'Final writing from account A' }],
  })
  expect(lock).toHaveBeenCalledOnce()
})

test('only the latest login notification can proceed after a shared departing-account flush', async () => {
  // Arrange
  const { controller, requestFlush, broker } = await createFixture(true)
  await controller.initialize()
  const release = deferred()
  requestFlush.mockImplementation(async () => {
    await release.promise
    return true
  })
  broker.acquire.mockClear()

  // Act: repeated owner IDs must not allow an older attempt to win.
  for (const owner of ['b', 'c', 'b', 'd', 'b', 'e', 'f', 'b'])
    controller.authenticated(`account-${owner}`, true)
  try {
    expect(broker.acquire).not.toHaveBeenCalled()
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'ready',
      generation: 0,
    })
  } finally {
    release.resolve()
  }
  await vi.waitFor(() => expect(broker.acquire).toHaveBeenCalledOnce())

  // Assert
  expect(broker.acquire).toHaveBeenCalledWith('account-b', 1)
})

test('logout during an account-switch flush cannot be undone by its late successful reply', async () => {
  // Arrange
  const { controller, requestFlush, broker, registry } =
    await createFixture(true)
  await controller.initialize()
  const release = deferred()
  requestFlush.mockImplementationOnce(async () => {
    await release.promise
    return true
  })
  broker.acquire.mockClear()

  // Act
  controller.authenticated('account-b', true)
  try {
    expect(await controller.signOut()).toBe(true)
  } finally {
    release.resolve()
  }
  await new Promise<void>((resolve) => setImmediate(resolve))

  // Assert
  expect(controller.getSnapshot()).toEqual({
    phase: 'locked',
    generation: 1,
    sequence: expect.any(Number),
  })
  expect((await registry.read()).activeAccountId).toBeNull()
  expect(broker.acquire).not.toHaveBeenCalled()
})

test('returning to the active account cancels pending switches without requiring the network again', async () => {
  // Arrange
  const { controller, requestFlush, broker, registry, options } =
    await createFixture(true)
  await controller.initialize()
  const release = deferred()
  const lock = vi.spyOn(registry, 'lock')
  requestFlush.mockImplementation(async () => {
    await release.promise
    return true
  })
  broker.acquire.mockClear()

  // Act: every returning notification must cancel its older pending switch.
  for (let attempt = 0; attempt < 8; attempt++) {
    controller.authenticated('account-b', true)
    controller.authenticated('account-a', true)
  }
  release.resolve()
  await vi.waitFor(() =>
    expect(options.onPreparationCancelled).toHaveBeenCalledWith(0),
  )

  // Assert: the still-prepared account stays usable even though the broker is offline.
  expect(lock).not.toHaveBeenCalled()
  expect(broker.acquire.mock.calls).not.toContainEqual(['account-b', 1])
  expect(
    broker.acquire.mock.calls.every(
      ([owner, generation]) => owner === 'account-a' && generation === 0,
    ),
  ).toBe(true)
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    generation: 0,
    workspace: { ownerId: 'account-a' },
  })
  expect((await registry.read()).activeAccountId).toBe('account-a')
  const snapshot = controller.getSnapshot()
  if (snapshot.phase !== 'ready') throw new Error('Current editor was lost')
  await expect(
    controller.command(0, {
      type: 'save',
      commandId: randomUUID(),
      categoryId: 1,
      baseRevision: snapshot.workspace.draft.revision,
      rows: [{ id: randomUUID(), text: 'Editing continues in account A' }],
    }),
  ).resolves.toMatchObject({ ok: true, generation: 0 })
})

test.each(['crashed', 'loading', 'destroyed', 'contents-destroyed', 'missing'])(
  'a %s renderer cannot allow normal exit to discard main-retained writing',
  async (state) => {
    // Arrange: capacity rejection keeps a real failed-save rescue in main.
    const { controller, requestFlush } = await createFixture(true)
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
      categoryId: 1,
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
    controller.retryPreparation()
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
  const { controller, options } = await createFixture(true)
  const reached = deferred()
  const release = deferred()
  const originalActor = options.actor!
  options.actor = (ownerId) => {
    const worker = originalActor(ownerId)
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
    categoryId: 1,
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
  await expect(controller.draft(0, 1)).resolves.toMatchObject({
    draft: { rows: [{ text: 'In-flight writing survives' }] },
  })
  await expect(controller.shutdown()).resolves.toBe(true)
})

test('a newer login arriving immediately after the flush acknowledgement owns the transition', async () => {
  // Arrange
  const { controller, requestFlush, broker } = await createFixture(true)
  await controller.initialize()
  broker.acquire.mockClear()
  let finishFlush!: (saved: boolean) => void
  const flush = new Promise<boolean>((resolve) => {
    finishFlush = resolve
  })
  requestFlush.mockReturnValueOnce(flush)

  // Act: run the newer notification between the flush continuation and its caller.
  controller.authenticated('account-b', true)
  finishFlush(true)
  queueMicrotask(() => {
    queueMicrotask(() => controller.authenticated('account-c', true))
  })
  await vi.waitFor(() => expect(broker.acquire).toHaveBeenCalledOnce())

  // Assert
  expect(broker.acquire).toHaveBeenCalledWith('account-c', 1)
})

test('an obsolete account lock cannot restart authentication after a newer login has taken over', async () => {
  // Arrange
  const { controller, broker, registry } = await createFixture(true)
  await controller.initialize()
  broker.acquire.mockClear()
  const reached = deferred()
  const release = deferred()
  const originalLock = registry.lock.bind(registry)
  vi.spyOn(registry, 'lock').mockImplementationOnce(async () => {
    const state = await originalLock()
    reached.resolve()
    await release.promise
    return state
  })

  // Act: the old disk operation finishes, but its reply arrives after another login.
  controller.authenticated('account-b', true)
  await reached.promise
  try {
    controller.authenticated('account-c', true)
    await vi.waitFor(() =>
      expect(broker.acquire).toHaveBeenCalledWith('account-c', 2),
    )
  } finally {
    release.resolve()
  }
  await new Promise<void>((resolve) => setImmediate(resolve))

  // Assert
  expect(broker.acquire).toHaveBeenCalledOnce()
  expect(broker.acquire).toHaveBeenCalledWith('account-c', 2)
})

test('a failed account lock cancels logout without stranding the prepared editor', async () => {
  // Arrange
  const { controller, registry } = await createFixture(true)
  await controller.initialize()
  vi.spyOn(registry, 'lock').mockRejectedValueOnce(
    new Error('Synthetic storage error'),
  )

  // Act
  const signedOut = await controller.signOut()

  // Assert
  expect(signedOut).toBe(false)
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'ready',
    generation: 0,
  })
  expect((await registry.read()).activeAccountId).toBe('account-a')
  expect(await controller.signOut()).toBe(true)
  expect((await registry.read()).activeAccountId).toBeNull()
})

test('first preparation waits for hydrated Settings and publishes readiness only after account files commit', async () => {
  // Arrange
  const bootstrap = {
    accountId: 'account-a',
    categories: [category],
    deletions: [],
  }
  const { controller, broker, options, registry } = await createFixture(false, {
    transport: () => ({
      bootstrap: async () => bootstrap,
      apply: async () => ({ receipts: [] }),
      receipts: async () => ({ receipts: [] }),
      checkpoint: async () => {
        throw new Error('No count response')
      },
    }),
  })
  broker.acquire.mockImplementation(async (expectedAccountId, generation) => ({
    status: 'ready',
    credential: {
      status: 'ready',
      requestId: randomUUID(),
      expectedAccountId,
      generation,
      accountId: 'account-a',
      token: 'synthetic-test-token',
    },
  }))

  // Act
  await controller.initialize()
  await vi.waitFor(() =>
    expect(options.openSettingsForPreparation).toHaveBeenCalledOnce(),
  )
  expect(controller.getSnapshot().phase).toBe('preparing')
  expect((await registry.read()).activeAccountId).toBeNull()
  const context = controller.settingsContext('account-a')!
  expect(
    controller.provideSettings(
      'other-account',
      context.generation,
      preferences,
    ),
  ).toBe(false)
  expect(
    controller.provideSettings('account-a', context.generation, preferences),
  ).toBe(true)
  await vi.waitFor(() => expect(controller.getSnapshot().phase).toBe('ready'))

  // Assert
  expect(controller.getSnapshot()).toMatchObject({
    workspace: {
      preferences: {
        theme: 'warm-cathedral-dark',
        settings: { liveEditorFontFamily: 'sans', liveEditorFontSize: 19 },
      },
      draft: { rows: [{ text: 'Imported only after preparation' }] },
    },
  })
  expect((await registry.read()).activeAccountId).toBe('account-a')
})

test('a corrupt prepared snapshot opens recovery instead of creating an empty draft', async () => {
  // Arrange
  const { controller, directory } = await createFixture(true)
  const file = new AtomicWorkspaceFile({
    directory: join(directory, 'workspaces'),
    ownerId: 'account-a',
    parse: OfflineWorkspaceSchema.parse,
  })
  await writeFile(file.path, 'broken snapshot', 'utf8')

  // Act
  await controller.initialize()

  // Assert
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'recovery',
    canRecover: false,
  })
  expect(controller.getSnapshot()).not.toHaveProperty('workspace')
  await expect(file.read()).rejects.toMatchObject({ reason: 'invalid' })
})
