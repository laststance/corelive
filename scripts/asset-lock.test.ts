import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect, test } from 'vitest'

import { acquireAssetLock } from './asset-lock.mjs'

test('concurrent stale-lock recoverers never overlap asset writes or delete the replacement owner', async () => {
  // Arrange
  const root = await mkdtemp(path.join(tmpdir(), 'corelive-asset-lock-'))
  const lock = path.join(root, 'assets.lock')
  await mkdir(lock)
  await writeFile(path.join(lock, 'owner-2147483647-stale'), '2147483647')
  const past = new Date(Date.now() - 60_000)
  await utimes(lock, past, past)
  let active = 0
  let peak = 0
  let completed = 0
  try {
    // Act: every waiter initially competes for the same dead owner's lease.
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        const release = await acquireAssetLock(lock)
        active++
        peak = Math.max(peak, active)
        expect((await readdir(lock)).length).toBe(1)
        await delay(15)
        active--
        await release()
        completed++
      }),
    )
    // Assert
    expect(peak).toBe(1)
    expect(completed).toBe(8)
    expect(await readdir(root)).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
