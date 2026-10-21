import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { isLocalEditorDocument, LOCAL_EDITOR_URL } from './localEditorOrigin'
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
  'https://corelive.app/live-editor',
  'corelive-editor://app/frame.html',
  'corelive-editor://app/index.html?account=other',
  'corelive-editor://app/index.html#other',
  'corelive-editor://user@app/index.html',
])('the local preload rejects a different document %s', (url) => {
  // Arrange / Act / Assert
  expect(isLocalEditorDocument(url)).toBe(false)
})
