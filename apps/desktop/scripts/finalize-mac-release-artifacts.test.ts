import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, onTestFinished, test } from 'vitest'

import afterBuild from './after-build.js'

const finalizer = fileURLToPath(
  new URL('./finalize-mac-release-artifacts.js', import.meta.url),
)
const armZip = 'CoreLive-1.2.3-arm64-mac.zip'
const armDmg = 'CoreLive-1.2.3-arm64.dmg'
const intelZip = 'CoreLive-1.2.3-mac.zip'
const intelDmg = 'CoreLive-1.2.3.dmg'

/** Creates synthetic release files in a new directory for the real metadata scripts.
 * @example const { dist } = await releaseFixture()
 */
async function releaseFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-release-'))
  onTestFinished(async () => rm(directory, { recursive: true }))
  const dist = join(directory, 'dist')
  await mkdir(dist)
  const files = {
    [armZip]: 'arm64 update',
    [armDmg]: 'arm64 installer',
    [intelZip]: 'stale Intel update',
    [intelDmg]: 'stale Intel installer',
    [armZip + '.blockmap']: 'valid ZIP blockmap',
    [armDmg + '.blockmap']: 'pre-staple DMG blockmap',
    [intelDmg + '.blockmap']: 'stale Intel blockmap',
    'CoreLive-1.2.2-arm64.dmg': 'previous ARM64 release',
    'latest-mac.yml': 'path: CoreLive-1.2.3-mac.zip\n',
  }
  await Promise.all([
    writeFile(join(directory, 'package.json'), '{"version":"1.2.3"}'),
    ...Object.entries(files).map(async ([name, bytes]) =>
      writeFile(join(dist, name), bytes),
    ),
  ])
  return { directory, dist }
}

test('provisional checksums cover only ARM64 files from the current build', async () => {
  // Arrange
  const { dist } = await releaseFixture()

  // Act
  await afterBuild({
    outDir: dist,
    artifactPaths: [armZip, armDmg, intelZip].map((name) => join(dist, name)),
  })

  // Assert
  expect(
    JSON.parse(await readFile(join(dist, 'checksums.json'), 'utf8')),
  ).toEqual({
    'CoreLive-1.2.3-arm64-mac.zip': {
      sha256:
        '9e89efcd94ef4d3701dffab6e11394b826f365710a861059d8060d0f9f43c3d3',
      size: 12,
    },
    'CoreLive-1.2.3-arm64.dmg': {
      sha256:
        '0b517438354ec5ae284f947648dfb1a7a66434ce7b72c0fb222d7acfb12d2f70',
      size: 15,
    },
  })
})

test('a directory-only build writes an empty checksum manifest with older installers on disk', async () => {
  // Arrange
  const { dist } = await releaseFixture()

  // Act
  await afterBuild({ outDir: dist, artifactPaths: [] })

  // Assert
  expect(await readFile(join(dist, 'checksums.json'), 'utf8')).toBe('{}')
})

test.runIf(process.platform === 'darwin')(
  'the finalizer staples only the ARM64 DMG and advertises the ARM64 ZIP with finalized hashes',
  async () => {
    // Arrange
    const { directory, dist } = await releaseFixture()
    const bin = join(directory, 'bin')
    await mkdir(bin)
    await writeFile(
      join(bin, 'xcrun'),
      [
        '#!/usr/bin/env node',
        'const { appendFileSync, readFileSync } = require("node:fs");',
        'const { basename } = require("node:path");',
        'const [tool, action, artifact] = process.argv.slice(2);',
        'appendFileSync("xcrun.log", [tool, action, basename(artifact)].join(" ") + "\\n");',
        'if (tool === "stapler" && action === "staple") appendFileSync(artifact, "+ticket");',
        'if (tool === "stapler" && action === "validate" && !readFileSync(artifact, "utf8").endsWith("+ticket")) process.exitCode = 1;',
        '',
      ].join('\n'),
      { mode: 0o700 },
    )

    // Act
    execFileSync(process.execPath, [finalizer], {
      cwd: directory,
      env: {
        PATH: [bin, dirname(process.execPath)].join(delimiter),
        APPLE_KEYCHAIN_PROFILE: 'synthetic-fixture',
      },
    })

    // Assert
    expect(await readFile(join(directory, 'xcrun.log'), 'utf8')).toBe(
      [
        'stapler validate CoreLive-1.2.3-arm64.dmg',
        'notarytool submit CoreLive-1.2.3-arm64.dmg',
        'stapler staple CoreLive-1.2.3-arm64.dmg',
        'stapler validate CoreLive-1.2.3-arm64.dmg',
        '',
      ].join('\n'),
    )
    expect(await readFile(join(dist, armDmg), 'utf8')).toBe(
      'arm64 installer+ticket',
    )
    expect(await readFile(join(dist, intelDmg), 'utf8')).toBe(
      'stale Intel installer',
    )
    await expect(
      readFile(join(dist, armDmg + '.blockmap')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(await readFile(join(dist, armZip + '.blockmap'), 'utf8')).toBe(
      'valid ZIP blockmap',
    )
    expect(await readFile(join(dist, intelDmg + '.blockmap'), 'utf8')).toBe(
      'stale Intel blockmap',
    )
    expect(
      JSON.parse(await readFile(join(dist, 'checksums.json'), 'utf8')),
    ).toEqual({
      'CoreLive-1.2.3-arm64-mac.zip': {
        sha256:
          '9e89efcd94ef4d3701dffab6e11394b826f365710a861059d8060d0f9f43c3d3',
        size: 12,
      },
      'CoreLive-1.2.3-arm64.dmg': {
        sha256:
          '21e5dc7829cb4400b7059355dd53c309d5b411ed6c971620db1936fa33e7baea',
        size: 22,
      },
    })
    const yaml = await readFile(join(dist, 'latest-mac.yml'), 'utf8')
    expect(yaml.replace(/^releaseDate: '[^']+'\n/m, '')).toBe(
      [
        'version: 1.2.3',
        'files:',
        '  - url: CoreLive-1.2.3-arm64-mac.zip',
        '    sha512: R+061zYwsJmqK+pto/ULpXLvNh+vgaHZz/jRcT1ScA4X+ZznH8IteGpexhztk/uzbClTzuvh3z4v+wO4t+Kdhg==',
        '    size: 12',
        '  - url: CoreLive-1.2.3-arm64.dmg',
        '    sha512: bIEv+9+5kQIXZDcJaKXtEv+I1HRhnuMqQTdOH3af5rzMUb7CfJya2kPCswseK75GfO5AoLH67Q7NbyPpeCnjJQ==',
        '    size: 22',
        'path: CoreLive-1.2.3-arm64-mac.zip',
        'sha512: R+061zYwsJmqK+pto/ULpXLvNh+vgaHZz/jRcT1ScA4X+ZznH8IteGpexhztk/uzbClTzuvh3z4v+wO4t+Kdhg==',
        '',
      ].join('\n'),
    )
  },
)
