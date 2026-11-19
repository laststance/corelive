import { randomUUID } from 'node:crypto'
import type { Socket } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

import { version } from '../../package.json'

import {
  adoptPeer,
  checkPeerDirectory,
  hasCode,
  loadPeerBinding,
  peerEndpoint,
} from './peer'
import {
  BRIDGE_VERSION,
  OWNER_START_TIMEOUT_MS,
  ReadyFrame,
  bridgeResult,
  readFrames,
  writeFrame,
} from './protocol'
import { mcpFailure, type McpResult, type SaveEffect } from './result'
import { coreLiveTools, type McpCall } from './tools'

interface Connection {
  socket: Socket
  frames: AsyncGenerator<unknown>
}

/** Associates a transport failure with safe diagnostics in hosts that hide helper stderr.
 * @example localFailure(call, 'owner-unavailable', 'none', 'Open CoreLive and retry.')
 */
function localFailure(
  call: McpCall,
  code: string,
  effect: SaveEffect,
  next: string,
): McpResult {
  const reference = randomUUID()
  process.stderr.write(`CoreLive MCP ${version} ${code} (${reference})\n`)
  return mcpFailure(call.name, code, effect, next, {
    version,
    reference,
    ...('operationId' in call.args
      ? { operationId: call.args.operationId }
      : {}),
  })
}

/** Accepts a durable receipt only when it belongs to the exact addition that lost its response.
 * @example matchesAddition(original.args, receipt)
 */
function matchesAddition(
  original: Extract<McpCall, { name: 'append_unfinished_task' }>['args'],
  receipt: McpResult,
): boolean {
  const saved = receipt.structuredContent
  return (
    !receipt.isError &&
    saved.status === 'saved' &&
    saved.operationId === original.operationId &&
    saved.title === original.title &&
    (!original.categoryId || saved.categoryId === original.categoryId)
  )
}

/** Reports the possible effect when a dispatched request lost its reply.
 * @example interruptedResponse(call)
 */
function interruptedResponse(call: McpCall): McpResult {
  const readOnly = coreLiveTools[call.name].readOnly
  const nextAction =
    call.name === 'append_unfinished_task'
      ? 'Look up the original operationId with get_task_addition_result before considering another write.'
      : readOnly
        ? 'Reconnect to CoreLive and repeat the read.'
        : 'Reconnect and inspect the saved state before repeating this operation.'
  return localFailure(
    call,
    'worker-unavailable',
    readOnly ? 'none' : 'unknown',
    nextAction,
  )
}

/** Opens this helper's private session on its first data call. Discovery never opens the workspace.
 * @example const owner = createMcpClient(profile, wakeOrdinaryApp)
 */
export function createMcpClient(
  profile: string,
  wake: () => Promise<void>,
  timeoutMs = OWNER_START_TIMEOUT_MS,
) {
  let connection: Connection | undefined
  let opening: Socket | undefined
  let ended = false
  let previous: Promise<unknown> = Promise.resolve()

  async function connect(): Promise<Connection> {
    const endpoint = peerEndpoint(profile)
    const binding = loadPeerBinding()
    const deadline = Date.now() + timeoutMs
    let requestedLaunch = false
    while (!ended && Date.now() < deadline) {
      let socket: Socket
      try {
        checkPeerDirectory(endpoint, false)
        socket = binding.connect(endpoint.path, adoptPeer)
      } catch (error) {
        if (
          !hasCode(error, 'ENOENT') &&
          !hasCode(error, 'ECONNREFUSED') &&
          !hasCode(error, 'EAGAIN')
        )
          throw error
        if (!requestedLaunch) {
          requestedLaunch = true
          await wake()
        }
        await delay(Math.min(100, Math.max(0, deadline - Date.now())))
        continue
      }
      opening = socket
      const frames = readFrames(socket)
      // Absolute deadline also bounds a live but hung owner that trickles incomplete bytes.
      const timer = setTimeout(
        () => socket.destroy(),
        Math.max(1, deadline - Date.now()),
      )
      try {
        await writeFrame(socket, {
          type: 'hello',
          profile: endpoint.identity,
          version: BRIDGE_VERSION,
        })
        const ready = ReadyFrame.safeParse((await frames.next()).value)
        if (!ready.success || ready.data.profile !== endpoint.identity)
          throw new Error('incompatible-owner')
        if (ended || socket.destroyed) throw new Error('owner-unavailable')
        const fresh = { socket, frames }
        connection = fresh
        return fresh
      } catch (error) {
        socket.destroy()
        throw error
      } finally {
        opening = undefined
        clearTimeout(timer)
      }
    }
    throw new Error('owner-unavailable')
  }

  async function execute(
    call: McpCall,
    signal?: AbortSignal,
  ): Promise<McpResult> {
    const cancelled = () =>
      mcpFailure(
        call.name,
        'cancelled',
        'none',
        'The request was cancelled before it reached CoreLive.',
      )
    if (signal?.aborted || ended) return cancelled()
    let active: Connection
    try {
      active =
        connection && !connection.socket.destroyed
          ? connection
          : await connect()
    } catch (error) {
      const reason =
        error instanceof Error && error.message === 'incompatible-owner'
          ? 'incompatible-owner'
          : 'owner-unavailable'
      return localFailure(
        call,
        reason,
        'none',
        'Open the matching CoreLive app and retry. No operation was dispatched.',
      )
    }
    if (signal?.aborted || ended) return cancelled()
    const id = randomUUID()
    const stopWaiting = (): void => {
      active.socket.destroy()
    }
    signal?.addEventListener('abort', stopWaiting, { once: true })
    try {
      await writeFrame(active.socket, { id, name: call.name, args: call.args })
      return bridgeResult((await active.frames.next()).value, id)
    } catch {
      active.socket.destroy()
      // Only a read-only receipt lookup can confirm a write once the response was lost.
      if (
        call.name === 'append_unfinished_task' &&
        !ended &&
        !signal?.aborted
      ) {
        const lookup = await execute(
          {
            name: 'get_task_addition_result',
            args: {
              operationId: call.args.operationId,
              original: {
                title: call.args.title,
                categoryId: call.args.categoryId,
              },
            },
          },
          signal,
        )
        if (matchesAddition(call.args, lookup)) return lookup
      }
      return interruptedResponse(call)
    } finally {
      signal?.removeEventListener('abort', stopWaiting)
    }
  }

  return {
    async call(call: McpCall, signal?: AbortSignal): Promise<McpResult> {
      // One outstanding frame per connection. Each request receives its own ID and response.
      const result = previous.then(async () => execute(call, signal))
      previous = result.catch(() => undefined)
      return result
    },
    close(): void {
      ended = true
      opening?.destroy()
      connection?.socket.destroy()
    },
  }
}
