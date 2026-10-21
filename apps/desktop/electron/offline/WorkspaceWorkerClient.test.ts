import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'
import { expect, test } from 'vitest'

import { WorkspaceWorkerClient } from './WorkspaceWorkerClient'

test('the actual storage worker persists commands and returns a bounded projection across restart', async () => {
  // Arrange
  const directory = await mkdtemp(join(tmpdir(), 'corelive-worker-'))
  const options = {
    directory,
    ownerId: 'account-a',
    script: new URL('./workspace-worker.ts', import.meta.url),
    execArgv: ['--import', 'tsx'],
  }
  let client = new WorkspaceWorkerClient(options)
  try {
    const ready = await client.call('prepare', {
      ownerId: 'account-a',
      deviceId: randomUUID(),
      legacyNotes: { '1': 'Original' },
      categories: [
        {
          id: 1,
          name: 'General',
          color: 'blue',
          isDefault: true,
          parentId: null,
          removed: false,
        },
      ],
      preferences: {
        revision: 0,
        theme: 'warm-cathedral-light',
        settings: UserSettingsStateSchema.parse({}),
      },
    })
    const commandId = randomUUID()
    const completionId = randomUUID()

    // Act
    const saved = await client.call('command', {
      type: 'complete',
      commandId,
      completionId,
      categoryId: 1,
      baseRevision: 0,
      rowId: ready.draft.rows[0]!.id,
      completedAt: Date.now(),
      timezone: 'Asia/Tokyo',
    })
    await client.close()
    client = new WorkspaceWorkerClient(options)
    const reopened = await client.call('open', null)

    // Assert
    expect(saved.pendingCount).toBe(1)
    expect(reopened.draft.rows.map((row) => row.text)).toEqual([
      '- [x] Original',
    ])
    expect(reopened.pendingCount).toBe(1)
    expect(reopened).not.toHaveProperty('commandReceipts')
    expect(reopened).not.toHaveProperty('completions')
    expect(
      (await client.call('pending', { limit: 16 }))[0]?.operation.completionId,
    ).toBe(completionId)
    await expect(
      client.call('prepare', {
        ownerId: 'account-b',
        deviceId: randomUUID(),
        legacyNotes: {},
        categories: [],
        preferences: ready.preferences,
      }),
    ).rejects.toMatchObject({ reason: 'invalid' })
  } finally {
    await client.close()
    await rm(directory, { recursive: true })
  }
})
