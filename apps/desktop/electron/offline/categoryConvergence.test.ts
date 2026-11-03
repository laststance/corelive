import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
} from '@corelive/desktop-contract/offline-workspace-v2'
import { afterEach, expect, test } from 'vitest'

import { AtomicWorkspaceFile } from './AtomicWorkspaceFile'
import {
  dashboardPaths,
  localPaths,
  runPass,
  runUntilSettled,
} from './categorySyncTestkit'
import { buildDeviceWorkspace, categoryUuid } from './deviceWorkspaceFixture'
import { createFakeDashboard } from './fakeDashboard'
import { WorkspaceCommandError } from './WorkspaceCommandError'
import { WorkspaceService } from './WorkspaceService'

const directories: string[] = []
const accountId = 'account-a'
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F']
const COLORS = ['blue', 'green', 'amber', 'rose', 'violet', 'orange'] as const

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (path) => rm(path, { recursive: true })),
  )
})

/** Deterministic PRNG (mulberry32) so a failing seed reproduces exactly (EA13b). */
function createRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Interleaves local edits, dashboard edits, web deletes, lost responses, offline passes and
 * relaunches from a fixed seed, then lets the user resolve every remaining row and asserts that
 * both sides converge and no writing was lost.
 */
test.each(Array.from({ length: 14 }, (_, index) => index + 1))(
  'seeded random interleaving %i converges with no writing lost (EA13b)',
  async (seed) => {
    // Arrange
    const random = createRandom(seed)
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(random() * items.length)]!
    const directory = await mkdtemp(join(tmpdir(), 'corelive-convergence-'))
    directories.push(directory)
    const file = new AtomicWorkspaceFile({
      directory,
      ownerId: DEVICE_OWNER_ID,
      fileName: DEVICE_WORKSPACE_FILE_NAME,
      parse: OfflineWorkspaceSchema.parse,
    })
    await file.initialize(
      buildDeviceWorkspace({
        categoryNames: ['General', 'A', 'B'],
        notes: { 1: 'text-general', 2: 'text-a', 3: 'text-b' },
      }),
    )
    let counter = 1000
    const makeService = (): WorkspaceService =>
      new WorkspaceService(
        file,
        () => 1_800_000_000_000,
        () => categoryUuid(counter++),
      )
    let service = makeService()
    const dashboard = createFakeDashboard([
      {
        id: 1,
        name: 'General',
        color: 'blue',
        isDefault: true,
        parentId: null,
        removed: false,
      },
      {
        id: 2,
        name: 'A',
        color: 'blue',
        isDefault: false,
        parentId: null,
        removed: false,
      },
      {
        id: 3,
        name: 'B',
        color: 'blue',
        isDefault: false,
        parentId: null,
        removed: false,
      },
    ])
    await runUntilSettled(service, dashboard, accountId)

    const liveLocal = async () =>
      (await file.read()).categories.filter((c) => !c.removed && !c.historical)
    const attempt = async (promise: Promise<unknown>): Promise<void> => {
      try {
        await promise
      } catch (error) {
        if (!(error instanceof WorkspaceCommandError)) throw error
      }
    }

    // Act
    for (let step = 0; step < 70; step++) {
      const roll = random()
      const local = await liveLocal()
      const movable = local.filter((c) => !c.isDefault)
      const commandBase = { commandId: randomUUID() }
      if (roll < 0.1)
        await attempt(
          service.execute({
            ...commandBase,
            type: 'categoryCreate',
            categoryId: randomUUID(),
            name: pick(NAMES),
            color: pick(COLORS),
            parentId:
              random() < 0.3
                ? pick(local.filter((c) => c.parentId === null)).id
                : null,
          }),
        )
      else if (roll < 0.2 && movable.length)
        await attempt(
          service.execute({
            ...commandBase,
            type: 'categoryRename',
            categoryId: pick(movable).id,
            name: pick(NAMES),
          }),
        )
      else if (roll < 0.28 && local.length)
        await attempt(
          service.execute({
            ...commandBase,
            type: 'categoryRecolor',
            categoryId: pick(local).id,
            color: pick(COLORS),
          }),
        )
      else if (roll < 0.34 && movable.length)
        await attempt(
          service.execute({
            ...commandBase,
            type: 'categoryReparent',
            categoryId: pick(movable).id,
            parentId: random() < 0.5 ? null : pick(local).id,
          }),
        )
      else if (roll < 0.4 && movable.length)
        await attempt(
          service.execute({
            ...commandBase,
            type: 'categoryDelete',
            categoryId: pick(movable).id,
            destinationId: pick(local).id,
          }),
        )
      else if (roll < 0.5) {
        const rows = dashboard.categories().filter((c) => !c.isDefault)
        if (rows.length) dashboard.webRename(pick(rows).id, pick(NAMES))
      } else if (roll < 0.56) {
        const rows = dashboard.categories()
        dashboard.webRecolor(pick(rows).id, pick(COLORS))
      } else if (roll < 0.62) {
        const name = pick(NAMES)
        const roots = dashboard.categories().filter((c) => c.parentId === null)
        if (!roots.some((c) => c.name === name)) dashboard.webCreate(name)
      } else if (roll < 0.68) {
        const rows = dashboard.categories().filter((c) => !c.isDefault)
        if (rows.length) dashboard.webDelete(pick(rows).id, 1)
      } else if (roll < 0.72) dashboard.setOffline(true)
      else if (roll < 0.78) dashboard.setOffline(false)
      else if (roll < 0.82)
        service = makeService() // relaunch
      else {
        const work = await service.categoryPending(16)
        if (work.sendable[0] && random() < 0.4)
          dashboard.loseResponseFor.add(work.sendable[0].operation.operationId)
        await runPass(service, dashboard, accountId)
      }
    }
    dashboard.setOffline(false)
    await runUntilSettled(service, dashboard, accountId, 20)
    // The user resolves every remaining row by keeping the dashboard's value.
    for (let round = 0; round < 12; round++) {
      const { rows } = await service.syncDetails()
      const actionable = rows.filter((row) =>
        row.actions.includes('keep-dashboard-value'),
      )
      if (!actionable.length) break
      for (const row of actionable)
        await attempt(
          service.execute({
            commandId: randomUUID(),
            type: 'syncDetailAction',
            rowId: row.id,
            action: 'keep-dashboard-value',
          }),
        )
      await runUntilSettled(service, dashboard, accountId, 20)
    }

    // Assert
    const state = await file.read()
    expect(localPaths(state)).toEqual(dashboardPaths(dashboard))
    const allText = [
      ...Object.values(state.drafts).flatMap((draft) =>
        draft.rows.map((row) => row.text),
      ),
      ...state.recoveryCopies.map((copy) => copy.text),
    ].join('\n')
    for (const text of ['text-general', 'text-a', 'text-b'])
      expect(allText).toContain(text)
  },
  60000,
)
