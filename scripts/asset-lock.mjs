import { randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/** Serializes asset writers and recovers dead owners without deleting a replacement lease.
 * {@link buildAssets} calls this before generating shared app resources.
 * @param {string} lock - Checkout-local lease directory.
 * @returns {Promise<() => Promise<void>>} Releases only this caller's unique owner marker.
 * @example const release = await acquireAssetLock('/repo/.gstack/assets.lock')
 */
export async function acquireAssetLock(lock) {
  const owner = `owner-${process.pid}-${randomUUID()}`
  const candidate = `${lock}.${owner}`
  await mkdir(candidate)
  await writeFile(path.join(candidate, owner), String(process.pid))
  const deadline = Date.now() + 150_000
  try {
    while (true) {
      try {
        // Publish a populated directory atomically: no waiter can mistake it for an empty stale lease.
        await rename(candidate, lock)
        return async () => {
          await unlink(path.join(lock, owner))
          await rmdir(lock).catch((error) => {
            if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code))
              throw error
          })
        }
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error
      }
      const entries = await readdir(lock).catch(() => null)
      const lockStat = await stat(lock).catch(() => null)
      if (!entries || !lockStat) continue
      const marker = entries.length === 1 ? entries[0] : null
      const pid = marker
        ? Number(
            await readFile(path.join(lock, marker), 'utf8').catch(() => '0'),
          )
        : 0
      let alive = false
      if (pid > 0) {
        try {
          process.kill(pid, 0)
          alive = true
        } catch (error) {
          alive = error.code === 'EPERM'
        }
      }
      if (
        !alive &&
        entries.length <= 1 &&
        Date.now() - lockStat.mtimeMs > 10_000
      ) {
        // A replacement owner has a different filename; rmdir refuses its populated directory.
        if (marker)
          await unlink(path.join(lock, marker)).catch((error) => {
            if (error.code !== 'ENOENT') throw error
          })
        await rmdir(lock).catch((error) => {
          if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code))
            throw error
        })
        continue
      }
      if (Date.now() > deadline)
        throw new Error('Timed out waiting for asset generation')
      await delay(100)
    }
  } catch (error) {
    await unlink(path.join(candidate, owner))
    await rmdir(candidate)
    throw error
  }
}
