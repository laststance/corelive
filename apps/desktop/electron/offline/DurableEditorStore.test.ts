import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  OfflineEditorAPI,
  OfflineFlushRequest,
} from '@corelive/desktop-contract/offline-editor-api'
import type {
  OfflineEditorSnapshot,
  WorkspaceCommand,
} from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { DurableEditorStore } from '@corelive/live-editor/store'
import { afterEach, expect, test, vi } from 'vitest'

import {
  WorkspaceWorkerClient,
  WorkspaceWorkerError,
} from './WorkspaceWorkerClient'

const cleanups: (() => Promise<void>)[] = []

/** Runs the renderer store against the real durable worker and the native event-before-reply contract.
 * Only delivery timing is synthetic; no Electron window or real account is touched.
 * @example const fixture = await createFixture('First\nSecond')
 */
async function createFixture(text = 'First\nSecond', clear = false) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-editor-store-'))
  const worker = new WorkspaceWorkerClient({
    directory,
    ownerId: 'account-a',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  })
  const workspace = await worker.call('prepare', {
    ownerId: 'account-a',
    deviceId: randomUUID(),
    categories: [1, 2].map((id) => ({
      id,
      name: `Category ${id}`,
      color: 'blue',
      parentId: null,
      isDefault: id === 1,
      removed: false,
    })),
    preferences: {
      revision: 0,
      theme: 'light',
      settings: UserSettingsStateSchema.parse({
        liveEditorClearOnComplete: clear,
        liveEditorClearDelayMs: 0,
      }),
    },
    legacyNotes: { '1': text, '2': 'Destination writing' },
  })
  let snapshot: OfflineEditorSnapshot = {
    phase: 'ready',
    generation: 0,
    sync: 'offline',
    workspace,
  }
  const listeners = new Set<(snapshot: OfflineEditorSnapshot) => void>()
  const flushListeners = new Set<(request: OfflineFlushRequest) => void>()
  const shownListeners = new Set<() => void>()
  const publish = (next: OfflineEditorSnapshot): void => {
    snapshot = next
    for (const listener of listeners) listener(next)
  }
  const apply: OfflineEditorAPI['command'] = async (generation, command) => {
    if (generation !== snapshot.generation || snapshot.phase !== 'ready')
      return { ok: false, reason: 'account-changed' }
    try {
      const { writtenDraft, ...view } = await worker.call('command', command)
      publish({ phase: 'ready', generation, sync: 'offline', workspace: view })
      return {
        ok: true,
        generation,
        revision: view.revision,
        workspace: view,
        writtenDraft,
      }
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof WorkspaceWorkerError
            ? error.reason
            : 'storage-failed',
      }
    }
  }
  const command = vi.fn(apply)
  const replyFlush = vi.fn<OfflineEditorAPI['replyFlush']>(async () => true)
  const copyWriting = vi.fn<OfflineEditorAPI['copyWriting']>(async () => true)
  const host: OfflineEditorAPI = {
    version: 1,
    snapshot: async () => snapshot,
    command,
    draft: async (_generation, categoryId) =>
      worker.call('draft', { categoryId }),
    retry: async () => {
      publish({
        phase: 'ready',
        generation: snapshot.generation,
        sync: 'offline',
        workspace: await worker.call('open', null),
      })
    },
    details: async (_generation, offset, limit) =>
      worker.call('details', { offset, limit }),
    undoHistory: async (_generation, offset, limit) =>
      worker.call('undoHistory', { offset, limit }),
    recoveryCopies: async (_generation, offset, limit) =>
      worker.call('recoveryCopies', { offset, limit }),
    signIn: async () => undefined,
    manageCategories: async () => undefined,
    copyWriting,
    export: async () => true,
    previewRecovery: async () => worker.call('previewRecovery', null),
    recover: async () => false,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onFlush: (listener) => {
      flushListeners.add(listener)
      return () => flushListeners.delete(listener)
    },
    onShown: (listener) => {
      shownListeners.add(listener)
      return () => shownListeners.delete(listener)
    },
    onCategoryCreated: () => () => undefined,
    replyFlush,
  }
  const store = new DurableEditorStore(host)
  await store.connect()
  cleanups.push(async () => {
    store.disconnect()
    await worker.close()
    await rm(directory, { recursive: true })
  })
  const hold = (kind: WorkspaceCommand['type']) => {
    let release: (() => void) | undefined
    command.mockImplementationOnce(async (generation, input) => {
      const result = await apply(generation, input)
      if (input.type === kind)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return result
    })
    return {
      ready: async (): Promise<void> =>
        vi.waitFor(() => expect(release).toBeDefined()),
      release: () => release?.(),
    }
  }
  return {
    store,
    worker,
    host,
    command,
    apply,
    hold,
    publish,
    replyFlush,
    copyWriting,
    requestFlush: (): void => {
      for (const listener of flushListeners)
        listener({ requestId: randomUUID(), generation: snapshot.generation })
    },
    shown: (): void => {
      for (const listener of shownListeners) listener()
    },
  }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test.each(['older', 'status', 'revision', 'account', 'prepared'] as const)(
  'initial reading preserves the latest %s publication without allowing premature writing',
  async (ordering) => {
    // Arrange
    const fixture = await createFixture('Original writing')
    const baseline = await fixture.host.snapshot()
    if (baseline.phase !== 'ready') throw new Error('Workspace not prepared')
    const initial: OfflineEditorSnapshot =
      ordering === 'prepared'
        ? { phase: 'preparing', generation: 0, sequence: 10 }
        : { ...baseline, sequence: 10 }
    const delivered: OfflineEditorSnapshot =
      ordering === 'account'
        ? { phase: 'locked', generation: 1, sequence: 11 }
        : {
            ...baseline,
            sequence: ordering === 'older' ? 9 : 11,
            sync: 'sign-in-required',
            workspace:
              ordering === 'revision'
                ? {
                    ...baseline.workspace,
                    revision: baseline.workspace.revision + 1,
                    draft: {
                      ...baseline.workspace.draft,
                      revision: baseline.workspace.draft.revision + 1,
                      rows: [{ id: 'new-row', text: 'Newer writing' }],
                    },
                  }
                : baseline.workspace,
          }
    let release!: () => void
    vi.spyOn(fixture.host, 'snapshot').mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return initial
    })

    // Act: delivery and the invoke reply are independently delayed.
    const connecting = fixture.store.connect()
    try {
      fixture.publish(delivered)
      expect(fixture.store.getSnapshot().main.phase).toBe('opening')
      fixture.store.edit('An early edit must not replace accepted writing')
      expect(fixture.store.getSnapshot().text).toBe('')
      await expect(fixture.store.flush()).resolves.toBe(false)
    } finally {
      release()
      await connecting
    }

    // Assert: the authoritative publication order wins, including unchanged disk revisions.
    const current = fixture.store.getSnapshot()
    if (ordering === 'account') {
      expect(current.main.phase).toBe('locked')
      expect(current.text).toBe('')
    } else {
      expect(current.main).toMatchObject({
        phase: 'ready',
        sync: ordering === 'older' ? 'offline' : 'sign-in-required',
      })
      expect(current.text).toBe(
        ordering === 'revision' ? 'Newer writing' : 'Original writing',
      )
    }
    fixture.publish({ ...baseline, sequence: 8 })
    expect(fixture.store.getSnapshot()).toEqual(current)
    expect(fixture.command).not.toHaveBeenCalled()
  },
)

test('later typing stays dirty through an older save acknowledgement and is included in the final flush', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.store.edit('First edited\nSecond', { start: 5, end: 5 })
  const first = fixture.hold('save')
  const saving = fixture.store.flush()
  await first.ready()

  // Act
  fixture.store.edit('First edited\nSecond\nLater input', {
    start: 19,
    end: 19,
  })
  const second = fixture.hold('save')
  first.release()
  await second.ready()

  // Assert
  expect(fixture.store.getSnapshot()).toMatchObject({
    text: 'First edited\nSecond\nLater input',
    save: 'saving',
  })
  second.release()
  await expect(saving).resolves.toBe(true)
  expect(fixture.store.getSnapshot().save).toBe('saved')
  expect(
    (await fixture.worker.call('open', null)).draft.rows.map((row) => row.text),
  ).toEqual(['First edited', 'Second', 'Later input'])
})

test('a shortening acknowledgement cannot reject newer typing within the preserved large draft allowance', async () => {
  // Arrange
  const fixture = await createFixture('a'.repeat(60000))
  fixture.store.edit('a'.repeat(55000))
  const delivery = fixture.hold('save')
  const saving = fixture.store.flush()
  await delivery.ready()

  // Act
  fixture.store.edit('b'.repeat(60000))
  delivery.release()

  // Assert
  await expect(saving).resolves.toBe(true)
  expect(fixture.store.getSnapshot()).toMatchObject({
    text: 'b'.repeat(60000),
    save: 'saved',
  })
  expect((await fixture.worker.call('open', null)).draft).toMatchObject({
    inputLimit: 60000,
    rows: [{ text: 'b'.repeat(60000) }],
  })
})

test('a definite rejected save exposes exact Copy writing and blocks exit until a fresh corrected retry succeeds', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.store.edit('x'.repeat(51001))

  // Act
  fixture.requestFlush()
  await vi.waitFor(() => expect(fixture.replyFlush).toHaveBeenCalled())
  await fixture.store.copyWriting()

  // Assert
  expect(fixture.replyFlush.mock.calls[0]?.[1]).toBe(false)
  expect(fixture.store.getSnapshot().save).toBe('failed')
  expect(fixture.copyWriting).toHaveBeenCalledWith(0, 'x'.repeat(51001))
  fixture.store.edit('Corrected')
  await expect(fixture.store.retry()).resolves.toBe(true)
  expect(fixture.store.getSnapshot()).toMatchObject({
    text: 'Corrected',
    save: 'saved',
  })
  expect(fixture.command.mock.calls[1]?.[1].commandId).not.toBe(
    fixture.command.mock.calls[0]?.[1].commandId,
  )
})

test('an exhausted save conflict offers writing recovery while an expired Undo leaves saved writing saved', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.command.mockResolvedValue({ ok: false, reason: 'revision-conflict' })
  fixture.store.edit('Changed')

  // Act / Assert
  await expect(fixture.store.flush()).resolves.toBe(false)
  expect(fixture.store.getSnapshot()).toMatchObject({
    save: 'failed',
    error: 'Could not save writing on this Mac. Retry or copy your writing.',
  })
  fixture.command.mockImplementation(fixture.apply)
  await expect(fixture.store.retry()).resolves.toBe(true)
  fixture.command.mockResolvedValue({ ok: false, reason: 'undo-expired' })
  await expect(
    fixture.store.command({
      type: 'undo',
      commandId: randomUUID(),
      completionId: randomUUID(),
    }),
  ).resolves.toBe(false)
  expect(fixture.store.getSnapshot()).toMatchObject({
    save: 'saved',
    error: 'Undo has expired. Your writing is still saved.',
  })
})

test('a completion response cannot overwrite a later rewrite and Undo restores the captured text beside it', async () => {
  // Arrange
  const fixture = await createFixture()
  const delivery = fixture.hold('complete')
  const completing = fixture.store.completeAt(2)
  await delivery.ready()

  // Act
  fixture.store.edit('Rewritten\nSecond', { start: 0, end: 5 })
  delivery.release()
  await completing
  const id = fixture.store.getSnapshot().notice!.id
  await fixture.store.flush()
  await fixture.store.command({
    type: 'undo',
    commandId: randomUUID(),
    completionId: id,
  })

  // Assert
  expect(fixture.store.getSnapshot().text).toBe('First\nRewritten\nSecond')
  expect(
    (await fixture.worker.call('open', null)).draft.rows.map((row) => row.text),
  ).toEqual(['First', 'Rewritten', 'Second'])
})

test('an identical checked line inserted before a completion does not steal its Undo identity', async () => {
  // Arrange
  const fixture = await createFixture('Same\nLater')
  await fixture.store.completeAt(1)
  const id = fixture.store.getSnapshot().notice!.id

  // Act
  fixture.store.edit('- [x] Same\n- [x] Same\nLater', { start: 0, end: 0 })
  await fixture.store.command({
    type: 'undo',
    commandId: randomUUID(),
    completionId: id,
  })

  // Assert
  expect(fixture.store.getSnapshot().text).toBe('- [x] Same\nSame\nLater')
})

test('clear-on-complete and success feedback wait for the durable acknowledgement', async () => {
  // Arrange
  const fixture = await createFixture('First\nSecond', true)
  const delivery = fixture.hold('complete')

  // Act
  const completing = fixture.store.completeAt(1)
  await delivery.ready()

  // Assert
  expect(fixture.store.getSnapshot().text).toBe('First\nSecond')
  expect(fixture.store.getSnapshot().notice).toBeNull()
  delivery.release()
  await expect(completing).resolves.toBe(true)
  expect(fixture.store.getSnapshot().text).toBe('Second')
  expect(fixture.store.getSnapshot().notice).toMatchObject({ title: 'First' })
})

test('retry after a lost completion reply reuses its command identity and never creates another completion', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.command.mockImplementationOnce(async (generation, command) => {
    await fixture.apply(generation, command)
    throw new Error('Lost reply')
  })

  // Act
  await expect(fixture.store.completeAt(1)).resolves.toBe(false)
  expect(fixture.store.getSnapshot().save).toBe('failed')
  await expect(fixture.store.retry()).resolves.toBe(true)

  // Assert
  const creates = fixture.command.mock.calls.filter(
    ([, command]) => command.type === 'complete',
  )
  expect(creates).toHaveLength(2)
  expect(creates[1]?.[1]).toEqual(creates[0]?.[1])
  expect((await fixture.worker.call('open', null)).pendingCount).toBe(1)
  expect(fixture.store.getSnapshot().text).toBe('- [x] First\nSecond')
})

test('a native exit receives failure when saving fails and Copy writing retains the exact live text', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.command.mockResolvedValue({ ok: false, reason: 'storage-failed' })
  fixture.store.edit('  Unsaved 日本語\n\n', { start: 0, end: 12 })

  // Act
  fixture.requestFlush()
  await vi.waitFor(() => expect(fixture.replyFlush).toHaveBeenCalled())
  await fixture.store.copyWriting()

  // Assert
  expect(fixture.replyFlush.mock.calls[0]?.[1]).toBe(false)
  expect(fixture.store.getSnapshot()).toMatchObject({
    save: 'failed',
    exitPending: false,
    text: '  Unsaved 日本語\n\n',
  })
  expect(fixture.copyWriting).toHaveBeenCalledWith(0, '  Unsaved 日本語\n\n')
})

test('late old-account acknowledgement cannot restore its text or success toast into a new account', async () => {
  // Arrange
  const fixture = await createFixture()
  const delivery = fixture.hold('complete')
  const completing = fixture.store.completeAt(1)
  await delivery.ready()
  const first = await fixture.worker.call('open', null)

  // Act
  fixture.publish({ phase: 'locked', generation: 1 })
  expect(fixture.store.getSnapshot().text).toBe('')
  fixture.publish({
    phase: 'ready',
    generation: 2,
    sync: 'offline',
    workspace: {
      ...first,
      ownerId: 'account-b',
      recentUndo: [],
      eligibleUndoCount: 0,
      draft: {
        revision: 0,
        rows: [{ id: randomUUID(), text: 'Other account writing' }],
      },
    },
  })
  delivery.release()
  await completing

  // Assert
  expect(fixture.store.getSnapshot().text).toBe('Other account writing')
  expect(fixture.store.getSnapshot().notice).toBeNull()
  expect(JSON.stringify(fixture.store.getSnapshot())).not.toContain('First')
})

test('selecting another category never transplants late source edits into the destination', async () => {
  // Arrange
  const fixture = await createFixture()
  const delivery = fixture.hold('select')
  const selecting = fixture.store.command({
    type: 'select',
    commandId: randomUUID(),
    categoryId: 2,
  })
  await delivery.ready()

  // Act
  fixture.store.edit('Source edited while saving\nSecond', { start: 0, end: 5 })
  delivery.release()
  await selecting
  await fixture.store.flush()

  // Assert
  expect(fixture.store.getSnapshot().text).toBe('Destination writing')
  expect(
    (await fixture.worker.call('draft', { categoryId: 1 })).draft.rows.map(
      (row) => row.text,
    ),
  ).toEqual(['Source edited while saving', 'Second'])
  expect(
    (await fixture.worker.call('draft', { categoryId: 2 })).draft.rows.map(
      (row) => row.text,
    ),
  ).toEqual(['Destination writing'])
})

test('a confirmed category move retains destination writing and late edits to the source', async () => {
  // Arrange
  const fixture = await createFixture()
  const delivery = fixture.hold('moveCategory')
  const moving = fixture.store.command({
    type: 'moveCategory',
    commandId: randomUUID(),
    sourceId: 1,
    destinationId: 2,
  })
  await delivery.ready()

  // Act
  fixture.store.edit('Edited source\nSecond', { start: 0, end: 5 })
  delivery.release()
  await moving
  await fixture.store.flush()

  // Assert
  expect(fixture.store.getSnapshot().text).toBe(
    'Destination writing\n\nEdited source\nSecond',
  )
})

test('an explicit native reveal releases the exit input barrier after a successful flush', async () => {
  // Arrange
  const fixture = await createFixture()
  fixture.store.edit('Ready to hide', { start: 0, end: 12 })

  // Act
  fixture.requestFlush()
  await vi.waitFor(() => expect(fixture.replyFlush).toHaveBeenCalled())
  expect(fixture.store.getSnapshot().exitPending).toBe(true)
  fixture.shown()

  // Assert
  expect(fixture.store.getSnapshot().exitPending).toBe(false)
  expect(fixture.store.getSnapshot().save).toBe('saved')
})
