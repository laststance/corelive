import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  OfflineWorkspaceV1Schema,
  type OfflineWorkspaceV1,
} from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { afterEach, describe, expect, test } from 'vitest'
import type { z } from 'zod'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import { migrateWorkspaceV1, type MigrationStage } from './migrateWorkspaceV1'
import { REGISTRY_OWNER_ID, registrySchema } from './OfflineAccountRegistry'

const directories: string[] = []
const NOW = 1_800_000_000_000

/** Builds a valid UUID from a number so fixtures stay readable. */
function uid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
}

/** A full v1 workspace: drafts, a pending outbox entry, a receipted one, moves, deletions, Undo deadline, checkpoint. */
function v1Workspace(
  ownerId: string,
  overrides: Partial<OfflineWorkspaceV1> = {},
) {
  const operation = (
    completionId: string,
    categoryId: number,
    title: string,
  ) => ({
    operationId: uid(Number(completionId.slice(-3)) + 500),
    completionId,
    deviceId: uid(1),
    revision: 1,
    expectedRemoteRevision: 0,
    kind: 'create' as const,
    categoryId,
    title,
    completedAt: NOW,
    originalCompletedAt: NOW,
    timezone: 'Asia/Tokyo',
  })
  const completion = (id: string, categoryId: number, title: string) => ({
    id,
    categoryId,
    originalCategoryId: categoryId,
    title,
    rawText: `- [x] ${title}`,
    lineId: uid(Number(id.slice(-3)) + 800),
    lineIndex: 0,
    completedAt: NOW,
    originalCompletedAt: NOW,
    timezone: 'Asia/Tokyo',
    revision: 1,
    undoUntil: NOW + 5000,
    cancelled: false,
    restored: false,
    clearAfter: null,
    cleared: false,
    remote: null,
  })
  const projection = {
    completionId: uid(102),
    revision: 1,
    cancelled: false,
    categoryId: 13,
    title: 'Sent task',
    completedAt: NOW,
  }
  return OfflineWorkspaceV1Schema.parse({
    version: 1,
    ownerId,
    deviceId: uid(1),
    revision: 9,
    preparedAt: 1_700_000_000_000,
    selectedCategoryId: 12,
    categories: [
      {
        id: 11,
        name: 'General',
        color: 'blue',
        isDefault: true,
        parentId: null,
      },
      { id: 12, name: 'Work', color: 'rose', isDefault: false, parentId: null },
      { id: 13, name: 'Email', color: 'green', isDefault: false, parentId: 12 },
      {
        id: 14,
        name: 'Old',
        color: 'amber',
        isDefault: false,
        parentId: null,
        removed: true,
      },
    ],
    preferences: {
      revision: 3,
      settings: UserSettingsStateSchema.parse({ showTodayEmber: true }),
      theme: 'system',
    },
    drafts: {
      '11': { revision: 2, rows: [{ id: uid(201), text: 'general draft' }] },
      '12': {
        revision: 4,
        rows: [
          { id: uid(202), text: 'work one' },
          { id: uid(203), text: 'work two' },
        ],
      },
      '14': { revision: 1, rows: [{ id: uid(204), text: 'old draft' }] },
    },
    completions: {
      [uid(101)]: completion(uid(101), 12, 'Pending task'),
      [uid(102)]: {
        ...completion(uid(102), 13, 'Sent task'),
        remote: projection,
      },
    },
    retiredCompletions: {
      [uid(103)]: {
        completedAt: NOW,
        originalCompletedAt: NOW,
        originalCategoryId: 99,
        timezone: 'Asia/Tokyo',
        cancelled: false,
        revision: 1,
        remoteRevision: 1,
      },
    },
    outbox: {
      [uid(601)]: {
        operation: operation(uid(101), 12, 'Pending task'),
        state: 'queued',
      },
      [uid(602)]: {
        operation: operation(uid(102), 13, 'Sent task'),
        state: 'sent',
        receipt: {
          operationId: uid(602),
          completionId: uid(102),
          revision: 1,
          status: 'applied',
          projection,
        },
      },
    },
    commandReceipts: { [uid(701)]: { digest: 'abc', revision: 5 } },
    categoryMoves: { '14': 11, '98': 12 },
    categoryDeletions: { '14': 11 },
    migration: { version: 1, sourceHashes: {}, unmappedCategoryIds: [] },
    checkpoint: {
      day: '2026-11-03',
      timezone: 'Asia/Tokyo',
      total: 2,
      fetchedAt: NOW - 1000,
      identities: { [uid(102)]: projection },
    },
    recoveryCopies: [
      {
        id: uid(301),
        categoryId: 12,
        text: 'saved copy',
        reason: 'earlier',
        createdAt: 5,
      },
    ],
    ...overrides,
  })
}

/** Writes the v1 registry file as the shipped `OfflineAccountRegistry` did (activate / lock). */
function createV1Registry(directory: string) {
  const file = new AtomicWorkspaceFile({
    directory: join(directory, 'registry'),
    ownerId: REGISTRY_OWNER_ID,
    parse: registrySchema.parse,
  })
  const deviceId = randomUUID()
  return {
    async activateVerified(accountId: string): Promise<void> {
      const next = (state: z.infer<typeof registrySchema>) => ({
        ...state,
        activeAccountId: accountId,
        lastAccountId: accountId,
        preparedAccounts: [...new Set([...state.preparedAccounts, accountId])],
      })
      try {
        await file.update(next)
      } catch {
        await file.initialize(
          next({
            version: 1,
            deviceId,
            activeAccountId: null,
            lastAccountId: null,
            preparedAccounts: [],
          }),
        )
      }
    },
    async lock(): Promise<void> {
      await file.update((state) => ({ ...state, activeAccountId: null }))
    },
  }
}

/** Writes a v1 install the way the shipped app laid it out. */
async function installV1(
  accounts: { id: string; workspace?: OfflineWorkspaceV1 }[],
  state: 'active' | 'locked' = 'active',
) {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-migrate-'))
  directories.push(directory)
  const registry = createV1Registry(directory)
  for (const account of accounts) {
    await new AtomicWorkspaceFile({
      directory: join(directory, 'workspaces'),
      ownerId: account.id,
      parse: OfflineWorkspaceV1Schema.parse,
    }).initialize(account.workspace ?? v1Workspace(account.id))
    await registry.activateVerified(account.id)
  }
  if (state === 'locked') await registry.lock()
  return directory
}

/** Reads the exact bytes of every file under offline/ except the v2 ones. */
async function v1Bytes(directory: string) {
  const out: Record<string, string> = {}
  for (const folder of ['workspaces', 'registry']) {
    for (const name of await readdir(join(directory, folder)).catch(() => []))
      if (!name.startsWith('device'))
        out[`${folder}/${name}`] = await readFile(
          join(directory, folder, name),
          'utf8',
        )
  }
  return out
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

describe('v1 to v2 workspace migration', () => {
  test('converts a full v1 workspace, keeping Undo deadlines, frozen payloads and every referenced category', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    const workspace = result.workspace
    const byName = (name: string) =>
      workspace.categories.find((c) => c.name === name)!
    const work = byName('Work')
    expect(result.status).toBe('migrated')
    expect(workspace.ownerId).toBe('device')
    expect(workspace.selectedCategoryId).toBe(work.id)
    expect(byName('Email').parentId).toBe(work.id)
    expect(byName('Old').removed).toBe(true)
    expect(workspace.drafts[work.id]?.rows.map((r) => r.text)).toEqual([
      'work one',
      'work two',
    ])
    expect(workspace.completions[uid(101)]?.undoUntil).toBe(NOW + 5000)
    expect(workspace.completions[uid(101)]?.categoryId).toBe(work.id)
    expect(workspace.outbox[uid(601)]?.wire).toBeUndefined()
    expect(workspace.outbox[uid(602)]?.wire?.categoryId).toBe(13)
    expect(workspace.outbox[uid(602)]?.receipt?.projection?.categoryId).toBe(
      byName('Email').id,
    )
    expect(workspace.binding?.serverCategoryIds[work.id]).toBe(12)
    expect(
      workspace.binding?.serverCategoryIds[byName('Old').id],
    ).toBeUndefined()
    expect(workspace.binding?.lastSyncedAt).toBe(NOW - 1000)
    expect(workspace.checkpoint?.identities[uid(102)]?.categoryId).toBe(
      byName('Email').id,
    )
    expect(workspace.preferences.settings.showTodayEmber).toBe(true)
    expect(result.registry.attachedAccountId).toBe('user_a')
    expect(result.registry.deviceId).toBe(uid(1))
    expect(workspace.commandReceipts[uid(701)]?.revision).toBe(5)
  })

  test('keeps references to categories that no longer exist as historical categories', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    const historical = result.workspace.categories.filter((c) => c.historical)
    const retired = result.workspace.retiredCompletions[uid(103)]!
    expect(historical).toHaveLength(2)
    expect(historical.map((c) => c.id)).toContain(retired.originalCategoryId)
    const moveTargets = Object.keys(result.workspace.categoryMoves)
    for (const id of moveTargets)
      expect(result.workspace.categories.some((c) => c.id === id)).toBe(true)
    expect(
      Object.keys(result.workspace.binding!.deletionReceipts),
    ).toHaveLength(1)
  })

  test('writes only the two new v2 files and leaves every v1 byte untouched (C32)', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }, { id: 'user_b' }])
    const before = await v1Bytes(directory)

    // Act
    await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    expect(await v1Bytes(directory)).toEqual(before)
    const workspaces = (await readdir(join(directory, 'workspaces'))).filter(
      (n) => n.startsWith('device'),
    )
    const registry = (await readdir(join(directory, 'registry'))).filter((n) =>
      n.startsWith('device'),
    )
    expect(workspaces).toEqual(['device.json'])
    expect(registry).toEqual(['device-registry.json'])
  })

  test('keeps every draft and pending completion title of another account as recovery copies and sends nothing to it (C7, C34)', async () => {
    // Arrange
    const logs: string[] = []
    const other = v1Workspace('user_b', {
      drafts: {
        '11': { revision: 1, rows: [{ id: uid(901), text: 'secret b draft' }] },
      },
    })
    const directory = await installV1([
      { id: 'user_b', workspace: other },
      { id: 'user_a' },
    ])

    // Act
    const result = await migrateWorkspaceV1({
      directory,
      now: () => NOW,
      log: (line) => logs.push(line),
    })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    const texts = result.workspace.recoveryCopies.map((c) => c.text)
    expect(texts).toContain('secret b draft')
    expect(texts).toContain('Pending task')
    expect(
      result.workspace.recoveryCopies.filter(
        (c) => c.origin?.accountId === 'user_b',
      ).length,
    ).toBe(2)
    // The queued v1 entry was never offered to the server and is re-derived; the sent one stays.
    expect(
      Object.values(result.workspace.outbox).map((entry) => entry.state),
    ).toEqual(['sent'])
    expect(result.summary).toEqual({
      sourceAccountId: 'user_a',
      importedDrafts: 3,
      importedCompletions: 3,
      recoveryCopies: 2,
      v1FilesKept: 3,
      preservedBackups: 0,
    })
    expect(logs).toEqual([
      'workspace migration: source=user_a drafts=3 completions=3 recoveryCopies=2 v1FilesKept=3 preservedBackups=0',
    ])
    expect(logs.join('')).not.toContain('secret b draft')
  })

  test('a locked v1 registry migrates detached but keeps the binding', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }], 'locked')

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    expect(result.registry.attachedAccountId).toBeNull()
    expect(result.workspace.binding?.accountId).toBe('user_a')
  })

  test('a corrupt source opens recovery instead of a fresh workspace and changes nothing (DX7)', async () => {
    // Arrange
    const logs: string[] = []
    const directory = await installV1([{ id: 'user_a' }])
    const fileName = `${createHash('sha256').update('user_a').digest('hex')}.json`
    const path = join(directory, 'workspaces', fileName)
    const original = await readFile(path, 'utf8')
    await writeFile(path, original.slice(0, original.length / 2))
    const before = await v1Bytes(directory)

    // Act
    const result = await migrateWorkspaceV1({
      directory,
      now: () => NOW,
      log: (line) => logs.push(line),
    })

    // Assert
    expect(result).toMatchObject({
      ok: false,
      code: 'WORKSPACE_MIGRATION_FAILED',
      fileName,
      errorClass: 'envelope',
    })
    expect(await v1Bytes(directory)).toEqual(before)
    expect(await readdir(join(directory, 'workspaces'))).not.toContain(
      'device.json',
    )
    expect(logs[0]).toMatch(
      /^WORKSPACE_MIGRATION_FAILED file=[a-f0-9]{64}\.json checksum=[a-f0-9]{8} error=envelope$/,
    )
  })

  test('a registry that names a missing workspace file is a failure, not a fresh start', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])
    const fileName = `${createHash('sha256').update('user_a').digest('hex')}.json`
    await rm(join(directory, 'workspaces', fileName))

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    expect(result).toMatchObject({ ok: false, errorClass: 'source-missing' })
  })

  test('an unreadable file of another account is listed as a preserved backup and blocks nothing', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])
    const garbage = 'f'.repeat(64)
    await writeFile(
      join(directory, 'workspaces', `${garbage}.json`),
      '{not json',
    )

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    expect(result.summary?.preservedBackups).toBe(1)
    expect(
      Object.values(result.workspace.migration.receipts)
        .map((r) => r.outcome)
        .sort(),
    ).toEqual(['backup-preserved', 'source-converted'])
  })

  test('a Mac that never ran v1 gets a fresh workspace with the General category', async () => {
    // Arrange
    const directory = await mkdtemp(join(tmpdir(), 'corelive-migrate-'))
    directories.push(directory)

    // Act
    const result = await migrateWorkspaceV1({ directory, now: () => NOW })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    expect(result.status).toBe('created-fresh')
    expect(
      result.workspace.categories.map((c) => [c.name, c.isDefault]),
    ).toEqual([['General', true]])
    expect(result.workspace.binding).toBeNull()
    expect(result.registry.attachedAccountId).toBeNull()
  })

  test('pre-offline notes that never reached a draft become recovery copies', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])

    // Act
    const result = await migrateWorkspaceV1({
      directory,
      now: () => NOW,
      legacyNotes: { '12': 'old note', '777': 'orphan note' },
    })

    // Assert
    if (!result.ok) throw new Error('migration failed')
    const copies = result.workspace.recoveryCopies.filter(
      (c) => c.origin?.kind === 'legacy-note',
    )
    expect(copies.map((c) => [c.text, c.reason])).toEqual([
      ['old note', 'legacy-changed'],
      ['orphan note', 'legacy-unmapped'],
    ])
  })
})

describe('v1 to v2 migration crash points', () => {
  test.each<MigrationStage>([
    'before-v2-write',
    'after-v2-write',
    'before-registry-write',
  ])(
    'a crash at %s converges to the same workspace and registry on relaunch',
    async (stage) => {
      // Arrange
      const reference = await migrateWorkspaceV1({
        directory: await installV1([{ id: 'user_a' }, { id: 'user_b' }]),
        now: () => NOW,
      })
      const directory = await installV1([{ id: 'user_a' }, { id: 'user_b' }])

      // Act
      await expect(
        migrateWorkspaceV1({
          directory,
          now: () => NOW,
          faultPoint: (point) => {
            if (point === stage) throw new Error('killed')
          },
        }),
      ).rejects.toThrow('killed')
      const relaunched = await migrateWorkspaceV1({ directory, now: () => NOW })

      // Assert
      if (!reference.ok || !relaunched.ok) throw new Error('migration failed')
      expect(relaunched.workspace.categories).toEqual(
        reference.workspace.categories,
      )
      expect(relaunched.workspace.drafts).toEqual(reference.workspace.drafts)
      expect(relaunched.workspace.recoveryCopies).toEqual(
        reference.workspace.recoveryCopies,
      )
      expect(relaunched.workspace.binding).toEqual(reference.workspace.binding)
      expect(relaunched.registry).toEqual(reference.registry)
      expect(relaunched.workspace.recoveryCopies).toHaveLength(5)
    },
  )
})

describe('downgrade round trip (DX8, EA13a)', () => {
  test('writing added by an older build becomes recovery copies once and queues nothing', async () => {
    // Arrange
    const directory = await installV1([{ id: 'user_a' }])
    const first = await migrateWorkspaceV1({ directory, now: () => NOW })
    if (!first.ok) throw new Error('migration failed')
    const v1File = new AtomicWorkspaceFile({
      directory: join(directory, 'workspaces'),
      ownerId: 'user_a',
      parse: OfflineWorkspaceV1Schema.parse,
    })
    await v1File.update((state) => {
      const next = structuredClone(state)
      next.drafts['12']!.rows.push({ id: uid(950), text: 'added by old build' })
      next.completions[uid(105)] = {
        ...next.completions[uid(101)]!,
        id: uid(105),
        title: 'Old build task',
        rawText: '- [x] Old build task',
      }
      next.retiredCompletions[uid(106)] = {
        ...next.retiredCompletions[uid(103)]!,
      }
      next.revision++
      return next
    })
    const outboxBefore = first.workspace.outbox

    // Act
    const second = await migrateWorkspaceV1({ directory, now: () => NOW + 1 })
    const third = await migrateWorkspaceV1({ directory, now: () => NOW + 2 })

    // Assert
    if (!second.ok || !third.ok) throw new Error('migration failed')
    const imported = second.workspace.recoveryCopies.filter(
      (c) => c.reason === 'From an older CoreLive version',
    )
    expect(imported.map((c) => c.text).sort()).toEqual([
      '- [x] Old build task',
      'added by old build',
    ])
    expect(second.importedFromOlderVersion).toBe(2)
    expect(Object.keys(second.workspace.migration.dashboardOnly)).toEqual([
      uid(106),
    ])
    expect(second.workspace.outbox).toEqual(outboxBefore)
    expect(third.importedFromOlderVersion).toBe(0)
    expect(third.workspace.recoveryCopies).toHaveLength(
      second.workspace.recoveryCopies.length,
    )
  })
})
