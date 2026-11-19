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
  MAX_FRAME_BYTES,
  MCP_CALL_TIMEOUT_MS,
  OWNER_START_TIMEOUT_MS,
  ReadyFrame,
  bridgeResult,
  encodeFrame,
  readFrames,
  writeFrame,
} from './protocol'
import {
  mcpFailure,
  taskAdditionLookupAction,
  type McpResult,
  type SaveEffect,
} from './result'
import { coreLiveTools, type McpCall } from './tools'

interface Connection {
  socket: Socket
  frames: AsyncGenerator<unknown>
}

interface QueuedCall {
  deadline: number
  timeout: AbortSignal
  signal?: AbortSignal
  dispatched: boolean
  timeoutResult: () => McpResult
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
      ? taskAdditionLookupAction
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

/** A caller can stop waiting before a dispatched write's save effect is known.
 * @example const cancelled = cancelledResult(call, dispatched)
 */
function cancelledResult(call: McpCall, dispatched: boolean): McpResult {
  const uncertainWrite = dispatched && !coreLiveTools[call.name].readOnly
  return mcpFailure(
    call.name,
    'cancelled',
    uncertainWrite ? 'unknown' : 'none',
    uncertainWrite
      ? 'Inspect the saved state before repeating this operation.'
      : dispatched
        ? 'Repeat the read if needed.'
        : 'The request was cancelled before it reached CoreLive.',
    'operationId' in call.args
      ? { operationId: call.args.operationId }
      : undefined,
  )
}

/** Reports whether a timed-out call may have reached the owner during its budget.
 * @example const result = expiredCall(call, dispatched)
 */
function expiredCall(call: McpCall, dispatched: boolean): McpResult {
  if (dispatched) return interruptedResponse(call)
  return mcpFailure(
    call.name,
    'request-timeout',
    'none',
    'Retry when CoreLive is ready. This request was not dispatched.',
  )
}

/** Opens this helper's private session on its first data call. Discovery never opens the workspace.
 * @example const owner = createMcpClient(profile, wakeOrdinaryApp)
 */
export function createMcpClient(
  profile: string,
  wake: () => Promise<void>,
  startTimeoutMs = OWNER_START_TIMEOUT_MS,
  callTimeoutMs = MCP_CALL_TIMEOUT_MS,
) {
  let connection: Connection | undefined
  let opening: Socket | undefined
  let ended = false
  let previous: Promise<unknown> = Promise.resolve()

  async function connect(callDeadline: number): Promise<Connection> {
    const binding = loadPeerBinding()
    const deadline = Math.min(callDeadline, Date.now() + startTimeoutMs)
    let requestedLaunch = false
    while (!ended && Date.now() < deadline) {
      // The app can create the profile with canonical spelling during a cold launch.
      const endpoint = peerEndpoint(profile)
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
          await Promise.race([
            wake(),
            delay(Math.max(0, deadline - Date.now()), undefined, {
              ref: false,
            }).then(() => {
              throw new Error('owner-unavailable')
            }),
          ])
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
        await writeFrame(
          socket,
          encodeFrame({
            type: 'hello',
            profile: endpoint.identity,
            version: BRIDGE_VERSION,
          }),
        )
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

  /** Sends one prepared frame and holds the serial slot until its reply or a safe socket close.
   * @example const result = await exchange(connection, state, { id, frame })
   */
  async function exchange(
    active: Connection,
    state: QueuedCall,
    request: { id: string; frame: Buffer },
  ): Promise<McpResult | undefined> {
    const { signal, timeout } = state
    const closeExpired = (): void => {
      active.socket.destroy()
    }
    timeout.addEventListener('abort', closeExpired, { once: true })
    let drainTimeout: ReturnType<typeof setTimeout> | undefined
    // After cancellation, drain the pending reply or close the stalled connection.
    const boundDrain = (): void => {
      drainTimeout = setTimeout(() => active.socket.destroy(), startTimeoutMs)
    }
    signal?.addEventListener('abort', boundDrain, { once: true })
    try {
      state.dispatched = true
      await writeFrame(active.socket, request.frame)
      return bridgeResult((await active.frames.next()).value, request.id)
    } catch {
      active.socket.destroy()
      return undefined
    } finally {
      signal?.removeEventListener('abort', boundDrain)
      clearTimeout(drainTimeout)
      timeout.removeEventListener('abort', closeExpired)
    }
  }

  async function execute(call: McpCall, state: QueuedCall): Promise<McpResult> {
    const { deadline, signal } = state
    const expired = (): boolean =>
      state.timeout.aborted || Date.now() >= deadline
    const stopped = (): McpResult | undefined => {
      if (expired()) return state.timeoutResult()
      if (signal?.aborted || ended)
        return cancelledResult(call, state.dispatched)
    }
    const beforeConnect = stopped()
    if (beforeConnect) return beforeConnect
    const id = randomUUID()
    const frame = encodeFrame({ id, name: call.name, args: call.args })
    if (!frame) {
      return mcpFailure(
        call.name,
        'request-too-large',
        'none',
        'Reduce the size of the tool arguments and retry.',
        { limitBytes: MAX_FRAME_BYTES },
      )
    }
    let active: Connection
    try {
      active =
        connection && !connection.socket.destroyed
          ? connection
          : await connect(deadline)
    } catch (error) {
      if (expired()) return state.timeoutResult()
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
    const beforeDispatch = stopped()
    if (beforeDispatch) return beforeDispatch
    const result = await exchange(active, state, { id, frame })
    if (result) return result
    if (expired()) return state.timeoutResult()
    // A read-only receipt lookup shares the original deadline and never repeats the write.
    if (call.name === 'append_unfinished_task' && !ended && !signal?.aborted) {
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
        state,
      )
      if (expired()) return state.timeoutResult()
      if (matchesAddition(call.args, lookup)) return lookup
    }
    return interruptedResponse(call)
  }

  return {
    async call(call: McpCall, signal?: AbortSignal): Promise<McpResult> {
      // One outstanding frame per connection. Each request receives its own ID and response.
      if (signal?.aborted || ended) return cancelledResult(call, false)
      // Spend one budget on queueing, startup, dispatch and any receipt lookup.
      const timeout = new AbortController()
      let failure: McpResult | undefined
      const state: QueuedCall = {
        deadline: Date.now() + callTimeoutMs,
        timeout: timeout.signal,
        signal,
        dispatched: false,
        timeoutResult: () => (failure ??= expiredCall(call, state.dispatched)),
      }
      const timer = setTimeout(() => timeout.abort(), callTimeoutMs)
      const result = previous.then(async () => execute(call, state))
      previous = result.catch(() => undefined)
      const stop = signal
        ? AbortSignal.any([signal, timeout.signal])
        : timeout.signal
      return new Promise<McpResult>((resolve, reject) => {
        const stopWaiting = (): void => {
          resolve(
            timeout.signal.aborted
              ? state.timeoutResult()
              : cancelledResult(call, state.dispatched),
          )
        }
        stop.addEventListener('abort', stopWaiting, { once: true })
        void result.then(resolve, reject).finally(() => {
          clearTimeout(timer)
          stop.removeEventListener('abort', stopWaiting)
        })
      })
    },
    close(): void {
      ended = true
      opening?.destroy()
      connection?.socket.destroy()
    },
  }
}
