import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  historyMember,
  type AccountHistoryRow,
  type CompletionRange,
  type HistoryFrame,
} from '@corelive/desktop-contract/completion-history'
import {
  DEVICE_ARCHIVE_FILE_NAME,
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  WorkspaceArchiveSchema,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { expect, test, vi } from 'vitest'

import { AtomicWorkspaceFile } from '../offline/AtomicWorkspaceFile'
import {
  createMcpAccountClient,
  type McpAccountClient,
} from '../offline/createSyncTransport'
import {
  buildDeviceWorkspace,
  categoryUuid,
} from '../offline/deviceWorkspaceFixture'
import { WorkspaceWorkerClient } from '../offline/WorkspaceWorkerClient'

import { createCompletionHistory } from './history'
import type { McpAccountWork } from './historyAuthority'
import { deviceCompletionHistory, type DeviceHistory } from './historyDevice'
import { readAccountFrames } from './historyStream'

const day = '2026-05-12'
const at = new Date(day + 'T12:00:00').getTime()
const categoryId = categoryUuid(1)
const uuid = (n: number) =>
  `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const range = { from: at - 36e5, before: at + 36e5 }
const accountId = 'qa-account'

function remoteRow(
  id: number,
  linked: string | null,
  title: string,
): AccountHistoryRow {
  return {
    source: 'completed',
    id,
    title,
    completedAt: at + id,
    completionId: linked,
    categoryId: 1,
    parentCategoryId: null,
    categoryPath: 'Work',
  }
}

function framesFor(rows: AccountHistoryRow[]): HistoryFrame[] {
  const memberHash = createHash('sha256')
  for (const row of rows) memberHash.update(historyMember(row))
  return [
    ...(rows.length
      ? [{ type: 'rows' as const, offset: 0, entries: rows }]
      : []),
    {
      type: 'end',
      total: rows.length,
      accountId,
      membership: memberHash.digest('hex'),
    },
  ]
}

function historyFixture(
  device: (range: CompletionRange) => Promise<DeviceHistory>,
  frames: () => HistoryFrame[],
) {
  const abort = new AbortController()
  const binding = { accountId, epoch: 1, generation: 1, signal: abort.signal }
  const getBinding = vi.fn(() => binding as typeof binding | null)
  const extra = createMcpAccountClient('http://127.0.0.1', 'unused')
  const historyRange = vi.fn(async () =>
    (async function* () {
      yield* frames()
    })(),
  )
  const client: McpAccountClient = {
    dashboardAppearance: extra.dashboardAppearance,
    home: extra.home,
    skillTree: extra.skillTree,
    completed: {
      dayDetail: extra.completed.dayDetail,
      heatmap: extra.completed.heatmap,
      historyRange,
    },
  }
  const history = createCompletionHistory({
    controller: {
      mcpAccountBinding: getBinding,
      mcpDeviceHistory: device,
      withMcpAccount: async <T>(work: McpAccountWork<T>) =>
        work(client, abort.signal),
    },
  })
  return { history, abort, getBinding, historyRange }
}

const emptyDevice: DeviceHistory = {
  boundAccountId: accountId,
  categories: [{ id: categoryId, parentId: null, path: 'Work', serverId: 1 }],
  rows: [],
  suppressedIds: [],
}

test('archived titleless completions retain their place, equal titles remain separate and only verified account identities merge', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-mcp-history-'))
  const state = buildDeviceWorkspace({
    boundAccountId: accountId,
    categoryNames: ['Work'],
  })
  const retired = {
    completedAt: at,
    originalCompletedAt: at,
    originalCategoryId: categoryId,
    timezone: 'UTC',
    cancelled: false,
    revision: 1,
    remoteRevision: 1,
  }
  state.retiredCompletions[uuid(1)] = {
    ...retired,
    completedAt: at + 1,
    title: '100%_done',
  }
  state.retiredCompletions[uuid(2)] = {
    ...retired,
    completedAt: at + 2,
    title: '100%_done',
  }
  const file = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  const archive = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_ARCHIVE_FILE_NAME,
    parse: WorkspaceArchiveSchema.parse,
  })
  await file.initialize(state)
  await archive.initialize({
    version: 1,
    ownerId: 'device',
    completions: {},
    retiredCompletions: {
      [uuid(2)]: { ...retired, title: 'stale duplicate' },
      [uuid(3)]: { ...retired, completedAt: at + 3 },
      [uuid(4)]: { ...retired, cancelled: true },
    },
  })
  const worker = new WorkspaceWorkerClient({
    directory,
    ownerId: DEVICE_OWNER_ID,
    script: new URL('../offline/workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  })
  const device = async () =>
    worker.call('mcpCompletionHistory', { from: at - 36e5, before: at + 36e5 })
  const { history, getBinding } = historyFixture(device, () =>
    framesFor([
      remoteRow(13, uuid(3), 'Recovered name'),
      remoteRow(11, uuid(1), '100%_done'),
      remoteRow(18, null, '100%_done'),
    ]),
  )
  try {
    // Act
    getBinding.mockReturnValueOnce(null)
    const offline = await history.list('first', {
      startDate: day,
      endDate: day,
      pageSize: 2,
    })
    const finalPage = await history.list('first', {
      cursor: offline.nextCursor!,
    })
    getBinding.mockReturnValueOnce(null)
    const literal = await history.list('first', {
      startDate: day,
      endDate: day,
      search: '%_',
    })
    const connected = await history.list('first', {
      startDate: day,
      endDate: day,
    })

    // Assert
    expect(offline).toMatchObject({
      scope: 'device',
      scopeReason: 'not-connected',
      total: 3,
    })
    expect(offline.entries.map((row) => row.completionId)).toEqual([
      uuid(3),
      uuid(2),
    ])
    expect(offline.entries[0]).toMatchObject({
      title: null,
      titleStatus: 'unavailable-on-this-mac',
      completedAt: new Date(at + 3).toISOString(),
    })
    expect(finalPage.entries.map((row) => row.completionId)).toEqual([uuid(1)])
    expect(literal).toMatchObject({ total: 2, unverifiedFilterCount: 1 })
    expect(connected).toMatchObject({ scope: 'device-and-account', total: 4 })
    expect(
      connected.entries.filter((row) => row.title === '100%_done'),
    ).toHaveLength(3)
    expect(
      connected.entries.filter((row) => row.completionId === uuid(3)),
    ).toMatchObject([{ title: 'Recovered name', source: 'device-and-account' }])
    // A surviving recovery copy proves this archive existed. Reporting only hot history would undercount.
    await copyFile(archive.path, archive.recoveryPath)
    await rm(archive.path)
    await expect(
      history.list('first', { startDate: day, endDate: day }),
    ).rejects.toMatchObject({ code: 'device-history-unavailable' })
  } finally {
    await worker.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('each helper finishes its original snapshot, a fresh read sees later rows, and revoked or disconnected cursors never disclose retained work', async () => {
  // Arrange
  const rows = [
    remoteRow(1, null, 'one'),
    remoteRow(2, null, 'two'),
    remoteRow(3, null, 'three'),
  ]
  const { history, abort, historyRange } = historyFixture(
    async () => emptyDevice,
    () => framesFor(rows.map((row) => ({ ...row }))),
  )
  const input = { startDate: day, endDate: day, pageSize: 2 }
  const first = await history.list('a', input)
  const another = await history.list('b', input)

  // Act
  rows.push(remoteRow(4, null, 'four'))
  rows[0]!.title = 'renamed'
  await expect(
    history.list('b', { cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
  const continued = await history.list('a', { cursor: first.nextCursor! })
  expect(historyRange).toHaveBeenCalledTimes(2)
  const fresh = await history.list('a', input)
  history.closeSession('a')
  await expect(
    history.list('a', { cursor: fresh.nextCursor! }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
  abort.abort()

  // Assert
  expect(continued).toMatchObject({
    total: 3,
    entries: [{ title: 'one' }],
    nextCursor: null,
  })
  expect(fresh).toMatchObject({
    total: 4,
    entries: [{ title: 'four' }, { title: 'three' }],
  })
  await expect(
    history.list('b', { cursor: another.nextCursor! }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
})

test('an IDE can finish a long frozen read while newer first pages evict its least recently read history', async () => {
  // Arrange
  const rows = Array.from({ length: 100 }, (_, index) =>
    remoteRow(index + 1, null, 'Completed work'),
  )
  const { history, historyRange } = historyFixture(
    async () => emptyDevice,
    () => framesFor(rows),
  )
  const firstPage = { startDate: day, endDate: day, pageSize: 1 }
  const longRead = await history.list('ide', firstPage)
  const abandoned = await history.list('ide', firstPage)

  // Act
  const secondPage = await history.list('ide', { cursor: longRead.nextCursor! })
  await history.list('ide', firstPage)
  await expect(
    history.list('ide', { cursor: abandoned.nextCursor! }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
  const received = [...longRead.entries, ...secondPage.entries]
  let cursor = secondPage.nextCursor
  while (cursor) {
    const next = await history.list('ide', { cursor, pageSize: 7 })
    received.push(...next.entries)
    cursor = next.nextCursor
  }

  // Assert
  expect(received.map((row) => row.accountRow?.id)).toEqual(
    Array.from({ length: 100 }, (_, index) => 100 - index),
  )
  expect(historyRange).toHaveBeenCalledTimes(3)
})

test('the app evicts the least recently used history across helpers only when a new continuation needs a slot', async () => {
  // Arrange
  const rows = [
    remoteRow(1, null, 'one'),
    remoteRow(2, null, 'two'),
    remoteRow(3, null, 'three'),
  ]
  const { history } = historyFixture(
    async () => emptyDevice,
    () => framesFor(rows),
  )
  const firstPage = { startDate: day, endDate: day, pageSize: 1 }
  const cursors: string[] = []
  for (let index = 0; index < 8; index++) {
    const read = await history.list(`helper-${index}`, firstPage)
    cursors.push(read.nextCursor!)
  }

  // Act
  const singlePage = await history.list('one-page', {
    ...firstPage,
    pageSize: 3,
  })
  const recentlyRead = await history.list('helper-0', { cursor: cursors[0] })
  await history.list('new-helper', firstPage)
  history.closeSession('helper-7')
  await history.list('replacement', firstPage)

  // Assert
  expect(singlePage.nextCursor).toBeNull()
  await expect(
    history.list('helper-1', { cursor: cursors[1] }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
  await expect(
    history.list('helper-7', { cursor: cursors[7] }),
  ).rejects.toMatchObject({ code: 'history-cursor-unavailable' })
  expect(
    await history.list('helper-0', { cursor: recentlyRead.nextCursor! }),
  ).toMatchObject({ entries: [{ title: 'one' }], nextCursor: null })
  expect(await history.list('helper-2', { cursor: cursors[2] })).toMatchObject({
    entries: [{ title: 'two' }],
  })
})

test('a missing terminal record or mismatched membership discards every remote row and reports the verified device scope', async () => {
  // Arrange
  const row = remoteRow(1, null, 'remote only')
  const device: DeviceHistory = {
    ...emptyDevice,
    rows: [
      {
        id: uuid(1),
        title: 'saved here',
        completedAt: at,
        categoryId,
        boundIdentity: true,
        pending: true,
      },
    ],
  }
  const truncated = historyFixture(
    async () => device,
    () => [{ type: 'rows', offset: 0, entries: [row] }],
  )
  const wrong = historyFixture(
    async () => device,
    () => [
      ...framesFor([row]).slice(0, 1),
      { type: 'end', accountId, total: 1, membership: '0'.repeat(64) },
    ],
  )
  const broken = historyFixture(
    async () => {
      throw Error('unreadable archive')
    },
    () => framesFor([row]),
  )

  // Act
  const result = await truncated.history.list('a', {
    startDate: day,
    endDate: day,
  })
  const mismatch = await wrong.history.list('a', {
    startDate: day,
    endDate: day,
  })

  // Assert
  expect(result).toMatchObject({
    scope: 'device',
    scopeReason: 'account-unavailable',
    total: 1,
    entries: [{ title: 'saved here' }],
  })
  expect(mismatch).toEqual(result)
  await expect(broken.history.list('a', {})).rejects.toMatchObject({
    code: 'device-history-unavailable',
  })
  expect(broken.historyRange).not.toHaveBeenCalled()
})

test('out-of-range rows and two visible rows claiming the same synced completion cannot produce a verified account page', async () => {
  // Arrange
  const first = remoteRow(1, uuid(1), 'one')
  const repeat = remoteRow(2, uuid(1), 'another')
  const outside = { ...first, completedAt: range.before }
  async function* frames(rows: AccountHistoryRow[]) {
    yield* framesFor(rows)
  }

  // Act and Assert
  await expect(
    readAccountFrames(frames([first, repeat]), accountId, range),
  ).rejects.toThrow('invalid-history-member')
  await expect(
    readAccountFrames(frames([outside]), accountId, range),
  ).rejects.toThrow('invalid-history-member')
})

test('a Mac day spans its local midnights when the clock advances during the requested day', async () => {
  // Arrange
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  const device = vi.fn(async (_range: CompletionRange) => emptyDevice)
  const { history, getBinding } = historyFixture(device, () => framesFor([]))
  getBinding.mockReturnValue(null)
  try {
    // Act
    const result = await history.list('local', {
      startDate: '2026-03-08',
      endDate: '2026-03-08',
    })

    // Assert
    expect(result.timezone).toBe('America/New_York')
    expect(device).toHaveBeenCalledWith({
      from: Date.parse('2026-03-08T05:00:00Z'),
      before: Date.parse('2026-03-09T04:00:00Z'),
    })
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('category filters include child categories and distinguish unknowable legacy matches from known misses', async () => {
  // Arrange
  const child = categoryUuid(2)
  const childCategory = {
    id: child,
    parentId: categoryId,
    path: 'Work / Notes',
    serverId: 2,
  }
  const device: DeviceHistory = {
    ...emptyDevice,
    categories: [...emptyDevice.categories, childCategory],
    rows: [
      {
        id: uuid(20),
        title: null,
        completedAt: at,
        categoryId: null,
        boundIdentity: false,
        pending: false,
      },
      {
        id: uuid(21),
        title: 'Unrelated',
        completedAt: at,
        categoryId: null,
        boundIdentity: false,
        pending: false,
      },
    ],
  }
  const rows = [
    {
      ...remoteRow(15, null, 'Σ at 50%_'),
      categoryId: 2,
      parentCategoryId: 1,
      categoryPath: 'Work / Notes',
    },
  ]
  const { history } = historyFixture(
    async () => device,
    () => framesFor(rows),
  )

  // Act
  const parent = await history.list('a', {
    startDate: day,
    endDate: day,
    categoryId,
    search: 'ς AT 50%_',
  })
  const direct = await history.list('a', {
    startDate: day,
    endDate: day,
    categoryId,
    includeSubcategories: false,
  })

  // Assert
  expect(parent).toMatchObject({
    total: 1,
    unverifiedFilterCount: 1,
    entries: [{ categoryId: child, categoryPath: 'Work / Notes' }],
  })
  expect(direct).toMatchObject({
    total: 0,
    unverifiedFilterCount: 2,
    entries: [],
  })
  await expect(
    history.list('a', { startDate: day, endDate: day, categoryId: uuid(90) }),
  ).rejects.toMatchObject({ code: 'category-unavailable' })
})

test('disconnecting during a device read prevents any account transfer or retained continuation', async () => {
  // Arrange
  let finish!: (value: DeviceHistory) => void
  const waiting = new Promise<DeviceHistory>((resolve) => {
    finish = resolve
  })
  const { history, historyRange } = historyFixture(
    async () => waiting,
    () => framesFor([remoteRow(1, null, 'Account row')]),
  )

  // Act
  const request = history.list('helper', {
    startDate: day,
    endDate: day,
    pageSize: 1,
  })
  history.closeSession('helper')
  finish(emptyDevice)

  // Assert
  await expect(request).rejects.toMatchObject({ code: 'session-closed' })
  expect(historyRange).not.toHaveBeenCalled()
})

test('only downgrade markers with recorded ownership can recover a missing title from the connected account', async () => {
  // Arrange
  const workspace = buildDeviceWorkspace({
    boundAccountId: accountId,
    categoryNames: ['Work'],
  })
  const marker = {
    completedAt: at,
    cancelled: false,
    originalCategoryId: categoryId,
  }
  workspace.migration.dashboardOnly = {
    [uuid(40)]: marker,
    [uuid(41)]: {
      ...marker,
      sourceAccountId: 'previous-owner',
      categoryVerified: false,
    },
    [uuid(42)]: {
      ...marker,
      sourceAccountId: accountId,
      categoryVerified: true,
    },
  }
  const { history } = historyFixture(
    async (period) => deviceCompletionHistory(workspace, null, period),
    () =>
      framesFor([
        remoteRow(40, uuid(40), 'First account row'),
        remoteRow(41, uuid(41), 'Other account row'),
        remoteRow(42, uuid(42), 'Recovered title'),
      ]),
  )

  // Act
  const result = await history.list('helper', { startDate: day, endDate: day })

  // Assert
  expect(result.total).toBe(5)
  expect(
    result.entries.filter((entry) => entry.source === 'device'),
  ).toMatchObject([
    { completionId: uuid(40), title: null, categoryId: null },
    { completionId: uuid(41), title: null, categoryId: null },
  ])
  expect(
    result.entries.filter((entry) => entry.source === 'device-and-account'),
  ).toMatchObject([
    { completionId: uuid(42), title: 'Recovered title', categoryId },
  ])
})
