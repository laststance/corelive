import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

/** Views served by `qa-web/main.tsx`; keep in sync with its `VIEWS`. */
const VIEWS = ['home', 'appearance'] as const

const HELP = `pnpm qa:web — isolated headless web fixture (no Clerk, no account API, no native window).

Usage: pnpm qa:web [--help]

Views (select with ?view=<name> on the printed URL):
  home        Home sidebar and Completed card against an in-page fake oRPC router (default)
  appearance  The web /settings Appearance section (dashboard theme picker)

Stdout: one JSON line {"url","pid","views"} once the server listens. Diagnostics go to stderr.
Desktop Settings has its own fixture: pnpm qa:settings.
Example: pnpm qa:web, then pnpm qa:browser open "<url>?view=appearance"
`

const args = process.argv.slice(2)
// Arguments are parsed before any side effect (no server, no listener).
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP)
  process.exit(0)
}
if (args.length > 0) {
  process.stderr.write(
    `qa:web: unknown argument "${args[0]}" (ARGUMENT_UNKNOWN). Fix: pnpm qa:web --help\n`,
  )
  process.exit(2)
}

// Test-only entry, outside Next's app tree; no real auth, native windows or account API.
const directory = fileURLToPath(new URL('./qa-web', import.meta.url))
const server = await createServer({
  configFile: false,
  envDir: false,
  root: directory,
  resolve: {
    alias: {
      '@': resolve(directory, '../../src'),
      '@clerk/nextjs': resolve(directory, 'clerk.ts'),
      'next/navigation': resolve(directory, 'navigation.ts'),
      'next/link': resolve(directory, 'link.tsx'),
    },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  css: { postcss: resolve(directory, '../..') },
  server: {
    host: '127.0.0.1',
    port: 0,
    open: false,
    fs: { allow: [resolve(directory, '../../../..')] },
  },
  logLevel: 'error',
})
await server.listen()
const address = server.httpServer?.address()
const port = typeof address === 'object' && address ? address.port : 0
process.stdout.write(
  `${JSON.stringify({ url: `http://127.0.0.1:${port}/`, pid: process.pid, views: VIEWS })}\n`,
)
process.once('SIGINT', () => void server.close())
process.once('SIGTERM', () => void server.close())
