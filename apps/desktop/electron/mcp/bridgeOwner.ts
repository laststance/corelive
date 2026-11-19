import { randomUUID } from 'node:crypto'
import { chmodSync, lstatSync, unlinkSync, type Stats } from 'node:fs'
import type { Socket } from 'node:net'

import {
  adoptPeer,
  checkPeerDirectory,
  hasCode,
  loadPeerBinding,
  peerEndpoint,
} from './peer'
import {
  BRIDGE_VERSION,
  HelloFrame,
  MAX_MCP_RESULT_BYTES,
  OWNER_START_TIMEOUT_MS,
  readFrames,
  RequestFrame,
  writeFrame,
} from './protocol'
import { mcpFailure, type McpResult } from './result'
import { coreLiveTools } from './tools'

export interface McpOwnerActions {
  call(sessionId: string, name: string, args: unknown): Promise<McpResult>
  closeSession(sessionId: string): void
}

/** Keeps complete tool replies readable by a default stdio client, including its text fallback.
 * A large read can be recovered without changing the workspace or disconnecting the helper.
 * @example const reply = stdioResult('export_workspace', result)
 */
function stdioResult(name: string, result: McpResult): McpResult {
  let resultBytes: number | undefined
  try {
    resultBytes = Buffer.byteLength(JSON.stringify(result))
  } catch (error) {
    // A serializable structured result plus its duplicate text can exceed V8's single-string limit.
    if (!(error instanceof RangeError)) throw error
  }
  if (resultBytes !== undefined && resultBytes <= MAX_MCP_RESULT_BYTES)
    return result
  const readOnly =
    Object.hasOwn(coreLiveTools, name) &&
    coreLiveTools[name as keyof typeof coreLiveTools].readOnly
  const writing = result.structuredContent.writing
  const next =
    name === 'export_workspace'
      ? 'Request save_workspace_backup with a JSON filename to save the complete workspace on this Mac.'
      : readOnly
        ? 'Narrow the range or request a smaller page.'
        : 'Inspect the saved state before repeating this operation.'
  return mcpFailure(
    name,
    'result-too-large',
    readOnly ? 'none' : 'unknown',
    next,
    {
      limitBytes: MAX_MCP_RESULT_BYTES,
      ...(resultBytes === undefined ? {} : { resultBytes }),
      ...(name === 'export_workspace' && typeof writing === 'string'
        ? { backupBytes: Buffer.byteLength(writing) }
        : {}),
    },
  )
}

/** Removes only the socket inode the lock-holding owner checked. Never remove a replacement.
 * @example unlinkOwnedSocket(endpoint.path, published)
 */
function unlinkOwnedSocket(path: string, expected: Stats): void {
  const current = lstatSync(path, { throwIfNoEntry: false })
  if (
    current?.isSocket() &&
    current.ino === expected.ino &&
    current.dev === expected.dev
  )
    unlinkSync(path)
}

/** Serves one helper session over a credential-verified socket, checking its profile before dispatch.
 * @example await servePeer(socket, endpoint.identity, actions)
 */
async function servePeer(
  socket: Socket,
  profile: string,
  actions: McpOwnerActions,
): Promise<void> {
  const sessionId = randomUUID()
  const frames = readFrames(socket)
  let closed = false
  socket.once('close', () => {
    closed = true
    actions.closeSession(sessionId)
  })
  socket.setTimeout(OWNER_START_TIMEOUT_MS, () => socket.destroy())
  try {
    const hello = HelloFrame.safeParse((await frames.next()).value)
    if (
      !hello.success ||
      hello.data.profile !== profile ||
      hello.data.version !== BRIDGE_VERSION
    ) {
      await writeFrame(socket, { type: 'incompatible' })
      return
    }
    socket.setTimeout(0)
    await writeFrame(socket, {
      type: 'ready',
      version: BRIDGE_VERSION,
      profile,
    })
    for await (const frame of frames) {
      const request = RequestFrame.parse(frame)
      // Serial dispatch preserves action order and provides write backpressure on this session.
      const result = await actions
        .call(sessionId, request.name, request.args)
        .catch(() =>
          mcpFailure(
            request.name,
            'worker-unavailable',
            'unknown',
            'Reconnect and inspect the original operation before attempting it again.',
          ),
        )
      if (closed || socket.destroyed) break
      await writeFrame(socket, {
        id: request.id,
        result: stdioResult(request.name, result),
      })
    }
  } finally {
    socket.destroy()
    // A history read that completed after the helper disconnected can still own a newly created cursor.
    if (closed) actions.closeSession(sessionId)
  }
}

/** Publishes the private per-profile endpoint after CoreLive acquires its singleton lock.
 * The returned cleanup closes active helper sessions and removes this owner's socket.
 * @example const stop = await startMcpOwner(app.getPath('userData'), actions)
 */
export async function startMcpOwner(
  profile: string,
  actions: McpOwnerActions,
): Promise<() => void> {
  const endpoint = peerEndpoint(profile)
  checkPeerDirectory(endpoint, true)
  const peer = loadPeerBinding()
  const old = lstatSync(endpoint.path, { throwIfNoEntry: false })
  if (old) {
    if (!old.isSocket() || old.uid !== endpoint.uid)
      throw new Error('Unexpected local connection endpoint')
    // Only a definite refusal permits removing a stale endpoint left by an interrupted owner.
    try {
      const existing = peer.connect(endpoint.path, adoptPeer)
      existing.destroy()
      throw new Error('A CoreLive owner already serves this profile')
    } catch (error) {
      if (!hasCode(error, 'ECONNREFUSED')) throw error
      unlinkOwnedSocket(endpoint.path, old)
    }
  }
  const sockets = new Set<Socket>()
  const listener = peer.listen(endpoint.path, (fd) => {
    const socket = adoptPeer(fd)
    if (socket) {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
      void servePeer(socket, endpoint.identity, actions).catch(() =>
        socket.destroy(),
      )
    }
    return socket
  })
  const published = lstatSync(endpoint.path)
  const close = (): void => {
    peer.close(listener)
    for (const socket of sockets) socket.destroy()
    unlinkOwnedSocket(endpoint.path, published)
  }
  try {
    chmodSync(endpoint.path, 0o600)
    return close
  } catch (error) {
    close()
    throw error
  }
}
