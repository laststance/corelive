import { chmodSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { exportActivityPng } from './activityExport'
import { McpAccountError } from './historyAuthority'
import { publishExportFile } from './publishExportFile'

let profile: string
beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), 'corelive-png-'))
})
afterEach(async () => {
  await rm(profile, { recursive: true, force: true })
})

test('competing exports publish one complete readable PNG under the exact profile filename', async () => {
  // Arrange
  const bytes = await sharp({
    create: { width: 960, height: 1200, channels: 4, background: '#17362b' },
  })
    .png()
    .toBuffer()
  const request = { filename: 'activity.png', bytes, profileDirectory: profile }

  // Act
  const results = await Promise.allSettled([
    publishExportFile(request),
    publishExportFile(request),
  ])

  // Assert
  const directory = join(profile, 'Exports')
  expect(results.filter((r) => r.status === 'fulfilled')).toEqual([
    { status: 'fulfilled', value: { path: join(directory, 'activity.png') } },
  ])
  expect(results.filter((r) => r.status === 'rejected')).toEqual([
    {
      status: 'rejected',
      reason: expect.objectContaining({ code: 'file-exists', effect: 'none' }),
    },
  ])
  expect(await readdir(directory)).toEqual(['activity.png'])
  const saved = await readFile(join(directory, 'activity.png'))
  expect(saved.equals(bytes)).toBe(true)
  expect(await sharp(saved).metadata()).toMatchObject({
    format: 'png',
    width: 960,
    height: 1200,
  })
})

test('an occupied explicit filename keeps its original bytes until replacement is requested', async () => {
  // Arrange
  const directory = join(profile, 'explicit')
  await mkdir(directory)
  const path = join(directory, 'activity.png')
  await writeFile(path, 'original')
  const request = {
    filename: path,
    bytes: Buffer.from('complete replacement'),
    profileDirectory: profile,
  }

  // Act
  await expect(publishExportFile(request)).rejects.toMatchObject({
    code: 'file-exists',
    effect: 'none',
  })

  // Assert
  expect(await readFile(path, 'utf8')).toBe('original')
  expect(await readdir(directory)).toEqual(['activity.png'])
  await expect(
    publishExportFile({ ...request, overwrite: true }),
  ).resolves.toEqual({ path })
  expect(await readFile(path, 'utf8')).toBe('complete replacement')
  expect(await readdir(profile)).toEqual(['explicit'])
})

test('a parent step after a symlink saves in the physical parent and preserves the other directory', async () => {
  // Arrange
  const view = join(profile, 'view')
  const actual = join(profile, 'actual')
  await mkdir(view)
  await mkdir(join(actual, 'child'), { recursive: true })
  await symlink(join(actual, 'child'), join(view, 'jump'), 'dir')
  await writeFile(join(actual, 'activity.png'), 'original')
  await writeFile(join(view, 'activity.png'), 'unrelated')
  const request = {
    filename: view + '/jump/../activity.png',
    profileDirectory: profile,
    bytes: Buffer.from('complete replacement'),
  }

  // Act
  await expect(publishExportFile(request)).rejects.toMatchObject({
    code: 'file-exists',
  })
  const saved = await publishExportFile({ ...request, overwrite: true })

  // Assert
  expect(saved.path).toBe(join(await realpath(actual), 'activity.png'))
  expect(await readFile(join(actual, 'activity.png'), 'utf8')).toBe(
    'complete replacement',
  )
  expect(await readFile(join(view, 'activity.png'), 'utf8')).toBe('unrelated')
})

test('an account change after staging preserves the destination and removes private temporary bytes', async () => {
  // Arrange
  const path = join(profile, 'activity.png')
  await writeFile(path, 'original')
  const changed = new Error('Account changed')

  // Act
  const result = publishExportFile({
    filename: path,
    bytes: Buffer.from('private'),
    profileDirectory: profile,
    overwrite: true,
    beforePublish: () => {
      throw changed
    },
  })

  // Assert
  await expect(result).rejects.toBe(changed)
  expect(await readFile(path, 'utf8')).toBe('original')
  expect(await readdir(profile)).toEqual(['activity.png'])
})

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'a read-only directory returns a no-save access error and leaves existing files intact',
  async () => {
    // Arrange
    const directory = join(profile, 'read-only')
    await mkdir(directory)
    const path = join(directory, 'activity.png')
    await writeFile(path, 'original')
    await chmod(directory, 0o500)
    try {
      // Act
      const result = publishExportFile({
        filename: path,
        bytes: Buffer.from('new'),
        profileDirectory: profile,
        overwrite: true,
      })

      // Assert
      await expect(result).rejects.toMatchObject({
        code: 'file-access-denied',
        effect: 'none',
      })
      expect(await readFile(path, 'utf8')).toBe('original')
      expect(await readdir(directory)).toEqual(['activity.png'])
    } finally {
      await chmod(directory, 0o700)
    }
  },
)

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'reports the account change and retained staging file when cleanup is also refused',
  async () => {
    // Arrange
    const target = join(profile, 'activity.png')
    try {
      // Act
      const result = publishExportFile({
        filename: target,
        bytes: Buffer.from('private capture'),
        profileDirectory: profile,
        beforePublish: () => {
          chmodSync(profile, 0o500)
          throw new McpAccountError('account-changed', false)
        },
      })

      // Assert
      await expect(result).rejects.toMatchObject({
        code: 'file-cleanup-incomplete',
        effect: 'partial',
        detail: {
          destinationSaved: false,
          publicationError: 'account-changed',
        },
      })
      await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await chmod(profile, 0o700)
    }
  },
)

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'lost write access after capture reports the remaining staging file and exact destination status',
  async () => {
    // Arrange
    const directory = join(profile, 'shared')
    await mkdir(directory)
    const target = join(directory, 'activity.png')
    const request = {
      filename: target,
      bytes: Buffer.from('private capture'),
      profileDirectory: profile,
      beforePublish: (): void => chmodSync(directory, 0o500),
    }
    try {
      // Act
      const result = publishExportFile(request)

      // Assert
      await expect(result).rejects.toMatchObject({
        code: 'file-cleanup-incomplete',
        effect: 'partial',
        detail: { destinationSaved: false },
      })
      const remaining = await readdir(directory)
      expect(remaining).toEqual([expect.stringMatching(/^\.corelive-.*\.tmp$/)])
      await expect(result).rejects.toMatchObject({
        detail: { stagingPath: join(directory, remaining[0]!) },
      })
      await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await chmod(directory, 0o700)
    }
  },
)

test.each([
  ['a loading response', undefined],
  ['an empty day', { date: '2026-05-12', count: 0, tasks: [] }],
  [
    'the previous day',
    { date: '2026-05-11', count: 1, tasks: [{ category: null }] },
  ],
  [
    'an incomplete day',
    { date: '2026-05-12', count: 2, tasks: [{ category: null }] },
  ],
])('%s never renders or publishes an activity card', async (_, detail) => {
  // Arrange
  const render = vi.fn()
  const readDay = vi.fn().mockResolvedValue(detail)

  // Act
  const result = exportActivityPng(
    { day: '2026-05-12', filename: 'activity.png' },
    {
      profileDirectory: profile,
      readDay,
      assertAccountCurrent: vi.fn(),
      render,
    },
  )

  // Assert
  await expect(result).rejects.toMatchObject({
    code: 'day-unavailable',
    effect: 'none',
  })
  expect(render).not.toHaveBeenCalled()
  expect(await readdir(profile)).toEqual([])
})

test('a broken capture preserves the existing file and reports no saved image', async () => {
  // Arrange
  const path = join(profile, 'activity.png')
  await writeFile(path, 'original')
  const readDay = vi.fn().mockResolvedValue({
    date: '2026-05-12',
    count: 1,
    tasks: [{ category: null }],
  })

  // Act
  const result = exportActivityPng(
    { day: '2026-05-12', filename: path, overwrite: true },
    {
      profileDirectory: profile,
      readDay,
      assertAccountCurrent: vi.fn(),
      render: async () => 'data:image/png;base64,iVBORw0KGgo=',
    },
  )

  // Assert
  await expect(result).rejects.toMatchObject({
    code: 'capture-invalid',
    effect: 'none',
  })
  expect(await readFile(path, 'utf8')).toBe('original')
  expect(await readdir(profile)).toEqual(['activity.png'])
})
