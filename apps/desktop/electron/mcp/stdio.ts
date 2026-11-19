import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import { version } from '../../package.json'

import { createMcpClient } from './bridgeClient'
import { helperLaunch } from './launcher'
import { MAX_FRAME_BYTES, MAX_MCP_RESULT_BYTES } from './protocol'
import { McpActionError, mcpFailure, type McpResult } from './result'
import { coreLiveTools, parseMcpCall } from './tools'

/** Bounds local tool errors so an invalid request cannot disconnect a stdio client.
 * @example return stdioFailure(params.name, error)
 */
function stdioFailure(name: string, error: unknown): McpResult {
  const nextAction = 'Inspect the input schema and retry the request.'
  const problem =
    error instanceof McpActionError
      ? error
      : new McpActionError('invalid-arguments', nextAction)
  const compact = (): McpResult =>
    mcpFailure('tools/call', problem.code, problem.effect, nextAction)
  // The operation name appears in both the structured result and its text fallback.
  if (2 * Buffer.byteLength(name) > MAX_MCP_RESULT_BYTES) return compact()
  try {
    const result = mcpFailure(
      name,
      problem.code,
      problem.effect,
      problem.nextAction,
      problem.detail,
    )
    if (Buffer.byteLength(JSON.stringify(result)) <= MAX_MCP_RESULT_BYTES)
      return result
  } catch (failure) {
    if (!(failure instanceof RangeError)) throw failure
  }
  return compact()
}

/** Runs the bundled local MCP endpoint. Only data calls create an owner connection.
 * @example await serveStdio()
 */
async function serveStdio(): Promise<void> {
  const launch = helperLaunch(process.argv.slice(2))
  const owner = createMcpClient(launch.profile, launch.wake)
  const server = new Server(
    { name: 'CoreLive', version },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(coreLiveTools).map(([name, tool]) => ({
      name,
      description: tool.description,
      annotations: { readOnlyHint: tool.readOnly },
      inputSchema: {
        ...z.toJSONSchema(tool.inputSchema, { io: 'input', target: 'draft-7' }),
        type: 'object' as const,
      },
    })),
  }))
  server.setRequestHandler(
    CallToolRequestSchema,
    async ({ params }, { signal }) => {
      try {
        return await owner.call(
          parseMcpCall(params.name, params.arguments ?? {}),
          signal,
        )
      } catch (error) {
        return stdioFailure(params.name, error)
      }
    },
  )
  server.onclose = (): void => owner.close()
  const transport = new StdioServerTransport(undefined, undefined, {
    // Leave room for the JSON-RPC envelope and requests we can reject at the tool boundary.
    maxBufferSize: MAX_FRAME_BYTES + 1024 * 1024,
  })
  process.stdin.once('end', () => {
    owner.close()
    void server.close()
  })
  await server.connect(transport)
}

void serveStdio().catch(() => {
  // Protocol output belongs exclusively to the SDK; startup diagnostics omit local paths and data.
  process.stderr.write(
    'CoreLive MCP could not initialize its local stdio transport.\n',
  )
  process.exitCode = 1
})
