import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'

type Adopt = (fd: number) => Socket | undefined
interface PeerBinding {
  renameExclusive(stagingPath: string, destinationPath: string): void
  connect(path: string, adopt: Adopt): Socket
  listen(path: string, adopt: Adopt): object
  close(listener: object): void
}

/** Resolves profile aliases, including case on case-insensitive volumes, before hashing.
 * Missing profiles use their nearest existing parent until the app creates the directory.
 * @example canonicalProfile('/tmp/new-CoreLive-profile')
 */
function canonicalProfile(path: string): string {
  try {
    return realpathSync.native(path)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
    return join(canonicalProfile(dirname(path)), basename(path))
  }
}

/** Narrows a native or filesystem refusal without publishing paths or platform diagnostics.
 * @example hasCode(error, 'ECONNREFUSED')
 */
export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Maps both GUI and shell processes to one short Unix socket per macOS user and app profile.
 * @example const endpoint = peerEndpoint(app.getPath('userData'))
 */
export function peerEndpoint(profile: string) {
  const uid = process.geteuid?.()
  if (uid === undefined) throw new Error('A local Unix user is required')
  const identity = createHash('sha256')
    .update(canonicalProfile(resolve(profile)))
    .digest('hex')
  const directory = `/private/tmp/corelive-mcp-${uid}`
  return {
    identity,
    directory,
    path: join(directory, `${identity.slice(0, 32)}.sock`),
    uid,
  }
}

/** Only the singleton owner may create the directory. Both parties reject symlinks and unsafe modes.
 * @example checkPeerDirectory(peerEndpoint(profile), false)
 */
export function checkPeerDirectory(
  endpoint: ReturnType<typeof peerEndpoint>,
  create: boolean,
): void {
  if (create) {
    try {
      mkdirSync(endpoint.directory, { mode: 0o700 })
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
    }
  }
  const stat = lstatSync(endpoint.directory)
  if (
    !stat.isDirectory() ||
    stat.uid !== endpoint.uid ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error(
      'The local connection directory is not private to this Mac user',
    )
}

/** Loads the signed macOS binding on demand for a verified local connection or an exclusive file rename.
 * @example const peer = loadPeerBinding()
 */
export function loadPeerBinding(): PeerBinding {
  if (process.platform !== 'darwin')
    throw new Error('The local CoreLive connection requires macOS')
  // Installed helpers/main use Resources/mcp; development builds use the same freshly compiled addon.
  const installed =
    typeof process.resourcesPath === 'string' &&
    basename(process.execPath) === 'CoreLive'
  const developmentLocation = __dirname.endsWith('mcp-runtime')
    ? '.'
    : basename(dirname(__dirname)) === 'electron'
      ? '../../dist-electron/mcp-runtime'
      : '../../mcp-runtime'
  const nativePath = installed
    ? join(process.resourcesPath, 'mcp', 'peer.node')
    : resolve(__dirname, developmentLocation, 'peer.node')
  return createRequire(process.execPath)(nativePath) as PeerBinding
}

/** Adopts an already verified descriptor. Returning undefined leaves failure cleanup in native code.
 * @example native.connect(path, adoptPeer)
 */
export function adoptPeer(fd: number): Socket | undefined {
  try {
    const socket = new Socket({ fd, readable: true, writable: true })
    // The peer can quit between handoff and the first read. The read/write promises still reject.
    socket.on('error', () => socket.destroy())
    return socket
  } catch {
    return undefined
  }
}
