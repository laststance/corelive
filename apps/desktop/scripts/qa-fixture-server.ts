/**
 * Loopback serving helpers shared by the desktop QA fixtures (#216 DX1, DX2).
 *
 * @module qa-fixture-server
 */
import { readFile } from 'node:fs/promises'
import type { Server, ServerResponse } from 'node:http'
import { extname, resolve } from 'node:path'

/** Content types of the few built file kinds the fixtures serve. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
}

/**
 * Serves one built renderer file with the bridge script injected into HTML.
 *
 * Called by each fixture's request handler for `/`, the document and `/assets/*`. The CSP
 * mirrors the packaged app; `connectSrc` is `'none'` for Settings, which must make no request.
 *
 * @param response - The HTTP response to answer.
 * @param assets - Absolute directory of the built renderer.
 * @param relativePath - Path inside `assets`, e.g. `index.html` or `assets/app.js`.
 * @param connectSrc - The CSP `connect-src` value.
 * @throws When the path escapes `assets` or the file is missing.
 * @example await serveBuiltFile(response, assets, 'index.html', "'self'")
 */
export async function serveBuiltFile(
  response: ServerResponse,
  assets: string,
  relativePath: string,
  connectSrc: "'self'" | "'none'",
): Promise<void> {
  const file = resolve(assets, relativePath)
  // Reject traversal out of the built directory.
  if (!file.startsWith(`${assets}/`)) throw new Error('Invalid path')
  let content: Buffer | string = await readFile(file)
  if (file.endsWith('.html'))
    content = content
      .toString()
      .replace('<head>', '<head><script src="/qa-bridge.js"></script>')
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'content-security-policy': `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ${connectSrc}; img-src 'self' data:; font-src 'self' data:; frame-src 'none'; object-src 'none'`,
  })
  response.end(content)
}

/**
 * Listens on a free loopback port and returns the origin.
 *
 * @param server - An unstarted HTTP server.
 * @returns `http://127.0.0.1:<port>`.
 * @throws When the server reports no TCP address.
 * @example const origin = await listenOnLoopback(server)
 */
export async function listenOnLoopback(server: Server): Promise<string> {
  await new Promise<void>((resolveListen) =>
    server.listen(0, '127.0.0.1', resolveListen),
  )
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address')
  return `http://127.0.0.1:${address.port}`
}
