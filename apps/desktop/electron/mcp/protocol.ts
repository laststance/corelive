import { type Socket } from 'node:net'

import { z } from 'zod'

import type { McpResult } from './result'

// Version changes deliberately reach the old endpoint so its owner can report incompatibility.
export const BRIDGE_VERSION = 2
export const OWNER_START_TIMEOUT_MS = 15_000
export const MCP_BACKGROUND_SWITCH = '--corelive-mcp-background'
const MAX_FRAME_BYTES = 32 * 1024 * 1024
// The SDK's default stdio client accepts a 10 MiB JSON-RPC message. Reserve room for its envelope.
export const MAX_MCP_RESULT_BYTES = 8 * 1024 * 1024

export const HelloFrame = z.strictObject({
  type: z.literal('hello'),
  version: z.number().int(),
  profile: z.string(),
})
export const RequestFrame = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(128),
  args: z.record(z.string(), z.unknown()),
})
export const ReadyFrame = z.strictObject({
  type: z.literal('ready'),
  version: z.literal(BRIDGE_VERSION),
  profile: z.string(),
})
const ResponseFrame = z.strictObject({
  id: z.uuid(),
  result: z.object({
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    structuredContent: z.record(z.string(), z.unknown()),
    isError: z.boolean(),
  }),
})

/** Accepts exactly the reply belonging to this call on a verified, handshaken connection.
 * @example const result = bridgeResult(frame, requestId)
 */
export function bridgeResult(frame: unknown, id: string): McpResult {
  const response = ResponseFrame.parse(frame)
  if (response.id !== id)
    throw new Error('Unexpected reply on local connection')
  return response.result
}

/** Sends one complete JSON line, observing Node's write completion before sending the next.
 * @example await writeFrame(socket, { type: 'hello', version: 1, profile })
 */
export async function writeFrame(
  socket: Socket,
  frame: unknown,
): Promise<void> {
  const body = Buffer.from(JSON.stringify(frame) + '\n')
  if (body.length - 1 > MAX_FRAME_BYTES)
    throw new Error('Local message exceeds the per-call size limit')
  await new Promise<void>((resolve, reject) => {
    socket.write(body, (error) => (error ? reject(error) : resolve()))
  })
}

/** Reads fragmented or coalesced JSON lines with bounded storage before parsing a complete frame.
 * @example for await (const frame of readFrames(socket)) accept(frame)
 */
export async function* readFrames(socket: Socket): AsyncGenerator<unknown> {
  let parts: Buffer[] = []
  let length = 0
  for await (const chunk of socket) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    let start = 0
    while (start < bytes.length) {
      const end = bytes.indexOf(10, start)
      const part = bytes.subarray(start, end < 0 ? undefined : end)
      length += part.length
      if (length > MAX_FRAME_BYTES)
        throw new Error('Local message exceeds the per-call size limit')
      parts.push(part)
      if (end < 0) break
      const body = Buffer.concat(parts, length).toString('utf8')
      parts = []
      length = 0
      yield JSON.parse(body) as unknown
      start = end + 1
    }
  }
  if (length) throw new Error('Incomplete reply from local connection')
}
