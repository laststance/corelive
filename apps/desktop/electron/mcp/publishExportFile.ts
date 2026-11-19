import { randomUUID } from 'node:crypto'
import { link, mkdir, open, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'

import { McpAccountError } from './historyAuthority'
import { McpActionError } from './result'

/** Resolves a supplied name in the current app profile or honors an exact absolute location.
 * @example resolveDestination('activity.png', profile)
 */
function resolveDestination(filename: string, profileDirectory: string) {
  if (
    !filename ||
    filename.includes('\0') ||
    filename.endsWith(sep) ||
    ['.', '..'].includes(basename(filename))
  ) {
    throw new McpActionError(
      'invalid-path',
      'Supply a filename or an absolute destination including the filename.',
    )
  }
  const isProfileExport = basename(filename) === filename
  if (isProfileExport)
    return {
      path: join(profileDirectory, 'Exports', filename),
      isProfileExport,
    }
  const full = filename.startsWith('~/')
    ? join(homedir(), filename.slice(2))
    : filename
  if (!isAbsolute(full)) {
    throw new McpActionError(
      'invalid-path',
      'Use an absolute directory or ~/ for a location outside the profile Exports folder.',
    )
  }
  return { path: resolve(full), isProfileExport }
}

/** Maps only filesystem errors; authentication and binding failures keep their original meaning.
 * @example await link(temp, path).catch(refuseFileWrite)
 */
function refuseFileWrite(error: unknown): never {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined
  switch (code) {
    case 'EEXIST':
      throw new McpActionError(
        'file-exists',
        'The named file already exists. Choose another name or explicitly request replacement.',
      )
    case 'EACCES':
    case 'EPERM':
      throw new McpActionError(
        'file-access-denied',
        'Writing to the requested directory was refused. Choose a writable directory.',
      )
    case 'ENOENT':
    case 'ENOTDIR':
      throw new McpActionError(
        'directory-unavailable',
        'Check the directory exists and supply its absolute path.',
      )
    default:
      throw new McpActionError(
        'file-write-failed',
        'No file was published. Check available disk space and choose a writable destination.',
      )
  }
}

/**
 * Removes private staging bytes and reports exactly what reached the requested path.
 * Cleanup can fail if the directory's ownership or permissions change after staging.
 * @example await removeStagingFile(temp, destination, false)
 */
async function removeStagingFile(
  temp: string,
  destination: string,
  published: boolean,
  publicationError?: unknown,
): Promise<void> {
  try {
    await unlink(temp)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return
    const publicationCode =
      publicationError instanceof McpActionError ||
      publicationError instanceof McpAccountError
        ? publicationError.code
        : undefined
    throw new McpActionError(
      'file-cleanup-incomplete',
      publicationCode === 'account-changed'
        ? 'Check the active account and remove the private staging file before retrying.'
        : 'A private staging file could not be removed. Check the destination directory before retrying.',
      'partial',
      {
        destinationSaved: published,
        ...(published && { path: destination }),
        ...(publicationCode && { publicationError: publicationCode }),
      },
    )
  }
}

/**
 * Publishes complete PNG or backup bytes into the profile's Exports or an explicit directory.
 * Both native exporters use the same atomic no-clobber operation. Explicit replacement uses
 * a rename in the destination directory so interruption cannot expose a partial file.
 * @example await publishExportFile({filename: 'workspace.json', bytes, profileDirectory})
 */
export async function publishExportFile(request: {
  filename: string
  bytes: Buffer
  profileDirectory: string
  overwrite?: boolean
  beforePublish?: () => void
}): Promise<{ path: string }> {
  const destination = resolveDestination(
    request.filename,
    request.profileDirectory,
  )
  const directory = dirname(destination.path)
  if (destination.isProfileExport)
    await mkdir(directory, { recursive: true, mode: 0o700 }).catch(
      refuseFileWrite,
    )
  const temp = join(directory, `.corelive-${randomUUID()}.tmp`)
  const handle = await open(temp, 'wx', 0o600).catch(refuseFileWrite)
  try {
    try {
      await handle.writeFile(request.bytes).catch(refuseFileWrite)
      await handle.sync().catch(refuseFileWrite)
    } finally {
      await handle.close().catch(refuseFileWrite)
    }
    // Account access can change during capture or disk I/O.
    request.beforePublish?.()
    if (request.overwrite)
      await rename(temp, destination.path).catch(refuseFileWrite)
    else await link(temp, destination.path).catch(refuseFileWrite)
  } catch (error) {
    await removeStagingFile(temp, destination.path, false, error)
    throw error
  }
  // A successful rename consumes the staging path; an exclusive link leaves it to remove.
  if (!request.overwrite) await removeStagingFile(temp, destination.path, true)
  return { path: destination.path }
}
