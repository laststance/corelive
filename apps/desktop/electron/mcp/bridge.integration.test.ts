import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { createMcpClient } from './bridgeClient'
import { startMcpOwner } from './bridgeOwner'
import { adoptPeer, loadPeerBinding, peerEndpoint } from './peer'
import { BRIDGE_VERSION, readFrames, writeFrame } from './protocol'
import { mcpSuccess } from './result'
import { parseMcpCall } from './tools'

const desktop = fileURLToPath(new URL('../../', import.meta.url))
const stdio = join(desktop, 'dist-electron/mcp-runtime/stdio.cjs')
const cleanup: Array<() => void | Promise<void>> = []

function isolatedProfile() {
  const directory = mkdtempSync(join(tmpdir(), 'corelive-mcp-integration-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

function stdioClient(profile: string) {
  const client = new Client({ name: 'CoreLive integration test', version: '1' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [stdio, '--user-data-dir=' + profile],
    stderr: 'pipe',
  })
  cleanup.push(async () => client.close())
  return { client, transport }
}

beforeAll(() => {
  execFileSync(process.execPath, ['scripts/build-mcp.mjs'], { cwd: desktop })
})

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

test('discovers distinct draft and completion tools over stdio while the isolated app is closed', async () => {
  // Arrange
  const { client, transport } = stdioClient(isolatedProfile())

  // Act
  await client.connect(transport)
  const list = await client.listTools()

  // Assert
  const names = list.tools.map((tool) => tool.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'read_draft',
      'append_unfinished_task',
      'record_completed_task',
      'list_completions',
    ]),
  )
  expect(
    list.tools.find((tool) => tool.name === 'append_unfinished_task')
      ?.inputSchema.required,
  ).toEqual(['title', 'operationId'])
})

describe.runIf(process.platform === 'darwin')('verified Mac socket', () => {
  test('the kernel peer check rejects a mismatched effective user and an invalid descriptor', () => {
    // Arrange
    const binary = join(isolatedProfile(), 'test-peer-identity')
    execFileSync(
      '/usr/bin/xcrun',
      ['clang', 'native/mcp/peer_identity_test.c', '-o', binary],
      { cwd: desktop },
    )
    // Act / Assert
    expect(() => execFileSync(binary)).not.toThrow()
  })

  test('two separate stdio clients reach one owner without sharing session cursors', async () => {
    // Arrange
    const profile = isolatedProfile()
    const sessions = new Set<string>()
    const closeSession = vi.fn()
    cleanup.push(
      await startMcpOwner(profile, {
        call: async (session, name) => {
          sessions.add(session)
          return mcpSuccess({ categoryPath: 'Work / CoreLive', name })
        },
        closeSession,
      }),
    )
    const first = stdioClient(profile)
    const second = stdioClient(profile)
    await Promise.all([
      first.client.connect(first.transport),
      second.client.connect(second.transport),
    ])

    // Act
    const results = await Promise.all(
      [first.client, second.client].map(async (client) =>
        client.callTool({ name: 'read_draft' }),
      ),
    )
    await first.client.close()

    // Assert
    expect(results.map((result) => result.structuredContent)).toEqual([
      { categoryPath: 'Work / CoreLive', name: 'read_draft' },
      { categoryPath: 'Work / CoreLive', name: 'read_draft' },
    ])
    expect(sessions.size).toBe(2)
    await vi.waitFor(() => expect(closeSession).toHaveBeenCalled())
  })

  test.each(['profile', 'version'])(
    'a mismatched %s is refused before a call can reach the workspace',
    async (mismatch) => {
      // Arrange
      const profile = isolatedProfile()
      const endpoint = peerEndpoint(profile)
      const call = vi.fn(async () => mcpSuccess({}))
      cleanup.push(
        await startMcpOwner(profile, { call, closeSession: vi.fn() }),
      )
      const socket = loadPeerBinding().connect(endpoint.path, adoptPeer)
      cleanup.push(() => {
        socket.destroy()
      })
      const frames = readFrames(socket)

      // Act
      await writeFrame(socket, {
        type: 'hello',
        profile:
          mismatch === 'profile' ? 'a-different-profile' : endpoint.identity,
        version: mismatch === 'version' ? BRIDGE_VERSION + 1 : BRIDGE_VERSION,
      })
      const reply = await frames.next()

      // Assert
      expect(reply.value).toEqual({ type: 'incompatible' })
      expect(call).not.toHaveBeenCalled()
    },
  )

  test('an interrupted write is reported as unknown and a lookup after owner restart uses the original UUID', async () => {
    // Arrange
    const profile = isolatedProfile()
    const operationId = randomUUID()
    const signals = new EventEmitter()
    const dispatched = once(signals, 'dispatched')
    const finish = once(signals, 'finish')
    const original = vi.fn(async () => {
      signals.emit('dispatched')
      await finish
      return mcpSuccess({ operationId })
    })
    const stop = await startMcpOwner(profile, {
      call: original,
      closeSession: vi.fn(),
    })
    cleanup.push(stop)
    const client = createMcpClient(profile, async () => {
      throw new Error('Unexpected wake')
    })
    cleanup.push(() => client.close())

    // Act
    const pending = client.call(
      parseMcpCall('append_unfinished_task', {
        title: 'Test the reconnect',
        operationId,
      }),
    )
    await dispatched
    stop()
    signals.emit('finish')
    const interrupted = await pending
    const lookup = vi.fn(
      async (_session: string, _name: string, args: unknown) =>
        mcpSuccess({ saved: true, args }),
    )
    cleanup.push(
      await startMcpOwner(profile, { call: lookup, closeSession: vi.fn() }),
    )
    const found = await client.call(
      parseMcpCall('get_task_addition_result', { operationId }),
    )

    // Assert
    expect(interrupted.structuredContent).toMatchObject({
      code: 'worker-unavailable',
      effect: 'unknown',
      operationId,
    })
    expect(found.structuredContent).toEqual({
      saved: true,
      args: { operationId },
    })
    expect(original).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls.map(([, name]) => name)).toEqual([
      'get_task_addition_result',
    ])
  })

  test('a saved addition is confirmed by its receipt when the owner drops the original reply', async () => {
    // Arrange
    const profile = isolatedProfile()
    const operationId = randomUUID()
    const saved = {
      status: 'saved',
      operationId,
      title: 'Verify this write',
      rowId: randomUUID(),
    }
    const lookup = vi.fn(async () => mcpSuccess(saved))
    const write = vi.fn(async () => {
      stop()
      cleanup.push(
        await startMcpOwner(profile, { call: lookup, closeSession: vi.fn() }),
      )
      return mcpSuccess(saved)
    })
    const stop = await startMcpOwner(profile, {
      call: write,
      closeSession: vi.fn(),
    })
    cleanup.push(stop)
    const client = createMcpClient(profile, async () => {
      throw new Error('Unexpected wake')
    })
    cleanup.push(() => client.close())

    // Act
    const result = await client.call(
      parseMcpCall('append_unfinished_task', {
        title: 'Verify this write',
        operationId,
      }),
    )

    // Assert
    expect(result.structuredContent).toEqual(saved)
    expect(write).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      'get_task_addition_result',
      { operationId, original: { title: 'Verify this write' } },
    )
  })
})
