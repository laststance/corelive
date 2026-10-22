import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

// Test-only entry, outside Next's app tree; no real auth, native windows or account API.
const directory = fileURLToPath(new URL('./qa-settings', import.meta.url))
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
})
await server.listen()
server.printUrls()
process.once('SIGINT', () => void server.close())
process.once('SIGTERM', () => void server.close())
