import { readFile, realpath } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

import { isLocalEditorURL } from './localEditorOrigin'
export const LOCAL_EDITOR_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
}

/**
 * Serves only packaged renderer assets under a dedicated origin; never proxies requests.
 * Main registers this handler after app readiness. Path and symlink checks prevent
 * encoded traversal into user data or the rest of the installed application.
 * @example const response = await serveLocalEditor(request, rendererDirectory)
 */
export async function serveLocalEditor(
  request: Request,
  directory: string,
): Promise<Response> {
  if (!isLocalEditorURL(request.url)) return new Response(null, { status: 404 })
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405 })
  try {
    const root = await realpath(directory)
    const pathname = decodeURIComponent(new URL(request.url).pathname)
    const target = resolve(
      root,
      pathname === '/' ? 'index.html' : pathname.slice(1),
    )
    if (!target.startsWith(`${root}${sep}`))
      return new Response(null, { status: 404 })
    const actual = await realpath(target)
    if (!actual.startsWith(`${root}${sep}`))
      return new Response(null, { status: 404 })
    const type = contentTypes[extname(actual)]
    if (!type) return new Response(null, { status: 404 })
    const body =
      request.method === 'HEAD' ? null : new Uint8Array(await readFile(actual))
    return new Response(body, {
      headers: {
        'content-type': type,
        'content-security-policy': LOCAL_EDITOR_CSP,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-cache',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
