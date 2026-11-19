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
import { MAX_FRAME_BYTES } from './protocol'
import { McpActionError, mcpFailure } from './result'
import { coreLiveTools, parseMcpCall } from './tools'

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
        if (error instanceof McpActionError)
          return mcpFailure(
            params.name,
            error.code,
            error.effect,
            error.nextAction,
            error.detail,
          )
        return mcpFailure(
          params.name,
          'invalid-arguments',
          'none',
          'Inspect the input schema and retry the request.',
        )
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
