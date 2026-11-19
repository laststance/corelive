import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { app, BrowserWindow, nativeImage } from 'electron'

// Run only in an isolated guest. Electron resolves the production renderer from this entry's directory.
const profileDirectory = mkdtempSync(join(tmpdir(), 'corelive-activity-qa-'))
app.setPath('userData', profileDirectory)
app.on('window-all-closed', () => {})

/** Runs the built capture when the guest's Chromium compositor is ready.
 * @example await verifyActivityCapture()
 */
async function verifyActivityCapture() {
  const { exportActivityPng } = createRequire(import.meta.url)(
    join(app.getAppPath(), 'dist-electron/main/mcp/activityExport.cjs'),
  )
  const day = '2026-05-12'
  const request = { day, filename: 'activity.png' }
  const deps = {
    profileDirectory,
    readDay: async ({ date, timezone }) => {
      assert.equal(date, day)
      assert.ok(timezone)
      return {
        date,
        count: 1,
        tasks: [{ category: { id: 1, name: 'writing', color: 'blue' } }],
      }
    },
    assertAccountCurrent() {},
  }
  assert.equal(BrowserWindow.getAllWindows().length, 0)

  const results = await Promise.allSettled([
    exportActivityPng(request, deps),
    exportActivityPng(request, deps),
  ])
  const destination = join(profileDirectory, 'Exports', 'activity.png')
  const saved = results.filter((result) => result.status === 'fulfilled')
  const refused = results.filter((result) => result.status === 'rejected')
  assert.deepEqual(saved, [
    { status: 'fulfilled', value: { path: destination } },
  ])
  assert.deepEqual(
    refused.map(({ reason }) => reason.code),
    ['file-exists'],
  )
  assert.deepEqual(await readdir(join(profileDirectory, 'Exports')), [
    'activity.png',
  ])
  const bytes = await readFile(destination)
  const image = nativeImage.createFromBuffer(bytes)
  const size = image.getSize()
  assert.deepEqual(size, { width: 960, height: 1200 })
  // The total is printed below the date, inside the card's border.
  const numeral = image
    .crop({ x: 96, y: 170, width: 190, height: 122 })
    .toBitmap()
  const background = numeral.readUInt32LE(0)
  assert.ok(
    numeral.some(
      (_, offset) =>
        offset % 4 === 0 && numeral.readUInt32LE(offset) !== background,
    ),
    'The exported card must draw its completion count',
  )
  assert.equal(BrowserWindow.getAllWindows().length, 0)
  process.stdout.write(
    JSON.stringify({ day, ...size, bytes: bytes.length, windows: 0 }) + '\n',
  )
}

// Electron emits ready after evaluating the entry module.
void app
  .whenReady()
  .then(verifyActivityCapture)
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await rm(profileDirectory, { recursive: true, force: true })
    app.exit(process.exitCode ?? 0)
  })
