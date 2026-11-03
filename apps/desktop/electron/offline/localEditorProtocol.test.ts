import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import {
  isLocalBundledDocument,
  isLocalEditorDocument,
  isLocalSettingsDocument,
  LOCAL_EDITOR_URL,
  LOCAL_SETTINGS_URL,
} from './localEditorOrigin'
import { LOCAL_EDITOR_CSP, serveLocalEditor } from './localEditorProtocol'

test('bundled editor assets load without a network transport and retain a restrictive CSP', async () => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), 'corelive-protocol-'))
  const renderer = join(root, 'renderer')
  await mkdir(renderer)
  await writeFile(join(renderer, 'index.html'), '<main>Bundled editor</main>')
  await writeFile(join(root, 'private.json'), '{"private":true}')
  await symlink(join(root, 'private.json'), join(renderer, 'leak.json'))
  try {
    // Act
    const response = await serveLocalEditor(
      new Request(LOCAL_EDITOR_URL),
      renderer,
    )

    // Assert
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<main>Bundled editor</main>')
    expect(response.headers.get('content-security-policy')).toBe(
      LOCAL_EDITOR_CSP,
    )
    expect(LOCAL_EDITOR_CSP).toContain("connect-src 'none'")
    for (const url of [
      'corelive-editor://other/index.html',
      'corelive-editor://app/%2e%2e%2fprivate.json',
      'corelive-editor://app/leak.json',
    ]) {
      expect((await serveLocalEditor(new Request(url), renderer)).status).toBe(
        404,
      )
    }
    expect(
      (
        await serveLocalEditor(
          new Request(LOCAL_EDITOR_URL, { method: 'POST' }),
          renderer,
        )
      ).status,
    ).toBe(405)
  } finally {
    await rm(root, { recursive: true })
  }
})

test.each([
  'https://corelive.app/home',
  'corelive-editor://app/frame.html',
  'corelive-editor://app/index.html?account=other',
  'corelive-editor://app/index.html#other',
  'corelive-editor://user@app/index.html',
])('the local preload rejects a different document %s', (url) => {
  // Arrange / Act / Assert
  expect(isLocalEditorDocument(url)).toBe(false)
})

test('both bundled documents load with no network and keep connect-src none (SC3)', async () => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), 'corelive-protocol-'))
  const renderer = join(root, 'renderer')
  await mkdir(join(renderer, 'assets'), { recursive: true })
  await writeFile(join(renderer, 'index.html'), '<main>Editor</main>')
  await writeFile(join(renderer, 'settings.html'), '<main>Settings</main>')
  await writeFile(join(renderer, 'other.html'), '<main>Other</main>')
  await writeFile(join(renderer, 'assets', 'settings.js'), 'export {}')
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  try {
    // Act
    const editor = await serveLocalEditor(
      new Request(LOCAL_EDITOR_URL),
      renderer,
    )
    const settings = await serveLocalEditor(
      new Request(LOCAL_SETTINGS_URL),
      renderer,
    )
    const asset = await serveLocalEditor(
      new Request('corelive-editor://app/assets/settings.js'),
      renderer,
    )

    // Assert
    expect(await editor.text()).toBe('<main>Editor</main>')
    expect(await settings.text()).toBe('<main>Settings</main>')
    expect(asset.status).toBe(200)
    expect(settings.headers.get('content-security-policy')).toContain(
      "connect-src 'none'",
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
    await rm(root, { recursive: true })
  }
})

test.each([
  'corelive-editor://app/other.html',
  'corelive-editor://app/%2e%2e/private.json',
  'corelive-editor://app/assets%5C..%5Cprivate.json',
  'corelive-editor://app/settings.html%00.js',
])('the protocol serves only the two documents and refuses %s', async (url) => {
  // Arrange
  const root = await mkdtemp(join(tmpdir(), 'corelive-protocol-'))
  const renderer = join(root, 'renderer')
  await mkdir(renderer)
  await writeFile(join(renderer, 'index.html'), '<main>Editor</main>')
  await writeFile(join(renderer, 'settings.html'), '<main>Settings</main>')
  await writeFile(join(renderer, 'other.html'), '<main>Other</main>')
  await writeFile(join(root, 'private.json'), '{}')
  try {
    // Act
    const response = await serveLocalEditor(new Request(url), renderer)

    // Assert
    expect(response.status).toBe(404)
  } finally {
    await rm(root, { recursive: true })
  }
})

test('each window is trusted with exactly its own document, and no other path or decoration', () => {
  // Arrange / Act / Assert
  expect(isLocalEditorDocument(LOCAL_EDITOR_URL)).toBe(true)
  expect(isLocalEditorDocument(LOCAL_SETTINGS_URL)).toBe(false)
  expect(isLocalSettingsDocument(LOCAL_SETTINGS_URL)).toBe(true)
  expect(isLocalSettingsDocument(LOCAL_EDITOR_URL)).toBe(false)
  expect(isLocalBundledDocument(LOCAL_SETTINGS_URL)).toBe(true)
  expect(isLocalBundledDocument('corelive-editor://app/other.html')).toBe(false)
  expect(
    isLocalSettingsDocument('corelive-editor://app/settings.html?a=1'),
  ).toBe(false)
  expect(isLocalSettingsDocument('corelive-editor://app/settings.html#a')).toBe(
    false,
  )
})
