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
  OWNER_START_TIMEOUT_MS,
  readFrames,
  RequestFrame,
  writeFrame,
} from './protocol'
import { mcpFailure, type McpResult } from './result'

export interface McpOwnerActions {
  call(sessionId: string, name: string, args: unknown): Promise<McpResult>
  closeSession(sessionId: string): void
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
      await writeFrame(socket, { id: request.id, result })
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
