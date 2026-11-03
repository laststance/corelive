import { createHash, randomUUID } from 'node:crypto'
import {
  link,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

const envelopeSchema = z.object({
  format: z.literal(1),
  ownerId: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.string(),
})

export type WorkspaceWriteStage =
  'before-write' | 'file-flushed' | 'replaced' | 'directory-flushed'

export class WorkspaceFileError extends Error {
  constructor(
    readonly reason: 'invalid' | 'missing' | 'exists' | 'recovery-missing',
  ) {
    super(`Workspace storage: ${reason}`)
    this.name = 'WorkspaceFileError'
  }
}

type WorkspaceFileOptions<T> = {
  directory: string
  ownerId: string
  parse: (value: unknown) => T
  /**
   * Optional cheaper validation of a reducer's output against the previously validated
   * state. Used only by {@link AtomicWorkspaceFile.update}; every read and recovery path
   * still runs the full {@link parse}. Must be equivalent to `parse` for any candidate.
   */
  validateChange?: (candidate: T, previous: T) => T
  /**
   * v2 file stem (`device` -> `device.json` + `device.recovery.json`). Omitted for the
   * v1 layout, which hashes the owner id into the path.
   */
  fileName?: string
  /** Fault injection and timing observations; never receives writing or credentials. */
  onStage?: (stage: WorkspaceWriteStage) => void | Promise<void>
}

/**
 * Stores one account's workspace as a checksummed, atomically replaced snapshot.
 * Main owns one instance per account; commands enter {@link update} in arrival order.
 * Acknowledgement follows file and directory flush. A failed/uncertain write forces
 * the next command to reread the committed file, so its durable command receipt can
 * resolve a lost reply. Recovery files are offered explicitly, never silently loaded.
 *
 * ```text
 * serialized command -> read/validate primary -> reduce/validate candidate
 *   -> preserve previous generation -> write temp -> file sync -> rename
 *   -> directory sync -> saved acknowledgement
 * failure -> no acknowledgement -> reread primary + command receipt on retry
 * invalid primary -> explicit recovery choice (never automatic promotion)
 * ```
 *
 * @example
 * const file = new AtomicWorkspaceFile({ directory, ownerId, parse: schema.parse })
 * await file.initialize(initialWorkspace)
 * await file.update((current) => applyCommand(current, command))
 */
export class AtomicWorkspaceFile<T> {
  readonly path: string
  readonly recoveryPath: string
  private readonly directory: string
  private readonly ownerId: string
  private readonly parse: (value: unknown) => T
  private readonly validateChange: WorkspaceFileOptions<T>['validateChange']
  private readonly onStage: WorkspaceFileOptions<T>['onStage']
  private tail: Promise<void> = Promise.resolve()
  private committedBytes: string | undefined
  /**
   * The validated state that {@link committedBytes} decodes to. Valid only while the primary's
   * bytes still equal `committedBytes`, so a command skips parsing and validating a file this
   * instance wrote itself (#216 perf gate). Never handed out: callers get clones.
   */
  private committedState: T | undefined
  private primaryDirectoryFlushed = false

  constructor(options: WorkspaceFileOptions<T>) {
    this.directory = options.directory
    this.ownerId = options.ownerId
    this.parse = options.parse
    this.validateChange = options.validateChange
    this.onStage = options.onStage
    if (
      options.fileName !== undefined &&
      !/^[a-z0-9-]+$/.test(options.fileName)
    )
      throw new WorkspaceFileError('invalid')
    // Account IDs are data, never filesystem paths; v2 passes a fixed, non-secret stem (E1).
    const partition =
      options.fileName ??
      createHash('sha256').update(options.ownerId).digest('hex')
    this.path = join(options.directory, `${partition}.json`)
    this.recoveryPath = join(options.directory, `${partition}.recovery.json`)
  }

  /**
   * Reads only committed primary bytes; called at local startup and by commands.
   * @throws {@link WorkspaceFileError} when the primary is absent or invalid.
   * @example const workspace = await file.read()
   */
  async read(): Promise<T> {
    // Clone: the cached generation must never be mutated by a caller.
    return this.serialize(async () => structuredClone(await this.readPrimary()))
  }

  /**
   * Creates a workspace only after verified online preparation; never overwrites it.
   * A recovery file without a primary is also an existing workspace needing recovery.
   * @throws {@link WorkspaceFileError} if either committed generation already exists.
   * @example await file.initialize(preparedWorkspace)
   */
  async initialize(value: T): Promise<T> {
    return this.serialize(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      for (const path of [this.path, this.recoveryPath]) {
        // Distinguish genuinely missing files from unreadable existing evidence.
        try {
          await readFile(path)
          throw new WorkspaceFileError('exists')
        } catch (error) {
          if (!isMissingFile(error)) throw error
        }
      }
      const validated = this.parse(value)
      await this.commit(validated)
      return structuredClone(validated)
    })
  }

  /**
   * Serializes a domain transaction, preserving the previous validated generation.
   * The callback must check its command receipt before mutating; returning the same
   * object is an idempotent replay and avoids another disk write.
   * @throws Storage/validation failures without reporting a saved acknowledgement.
   * @param change - Pure reducer; it must clone before mutating, because `current` is the cached committed state.
   * @param options - `shared: true` returns the committed state itself instead of a clone,
   *   for callers that only project it (the keep path saves a full clone). Never mutate it.
   * @example await file.update((state) => reduceWorkspace(state, command))
   */
  async update(
    change: (current: T) => T,
    options: { shared?: boolean } = {},
  ): Promise<T> {
    return this.serialize(async () => {
      const current = await this.readPrimary()
      const candidate = change(current)
      if (candidate === current) {
        // A receipt loaded after restart or an uncertain rename still needs its directory barrier.
        if (!this.primaryDirectoryFlushed) {
          await this.flushDirectory(true)
          this.primaryDirectoryFlushed = true
        }
        return options.shared ? current : structuredClone(current)
      }
      const validated = this.validateChange
        ? this.validateChange(candidate, current)
        : this.parse(candidate)
      await this.commit(validated)
      return options.shared ? validated : structuredClone(validated)
    })
  }

  /**
   * Like {@link update}, but starts from `empty` when neither generation exists yet. Used by
   * files that appear lazily (the archive); an existing recovery copy without a primary is
   * still evidence of a lost file, so it throws instead of starting fresh (EA14).
   * @throws {@link WorkspaceFileError} `exists` when only the recovery copy is present.
   * @example await archive.updateOrInitialize(emptyArchive, (current) => merge(current))
   */
  async updateOrInitialize(empty: T, change: (current: T) => T): Promise<T> {
    return this.serialize(async () => {
      let current: T
      try {
        current = await this.readPrimary()
      } catch (error) {
        if (
          !(error instanceof WorkspaceFileError) ||
          error.reason !== 'missing'
        )
          throw error
        await mkdir(this.directory, { recursive: true, mode: 0o700 })
        try {
          await readFile(this.recoveryPath)
          throw new WorkspaceFileError('exists')
        } catch (inner) {
          if (!isMissingFile(inner)) throw inner
        }
        current = this.parse(empty)
      }
      const candidate = change(current)
      if (candidate === current) return structuredClone(current)
      const validated = this.parse(candidate)
      await this.commit(validated)
      return structuredClone(validated)
    })
  }

  /** Reads validated recovery content and its file age under the same writer barrier for confirmation UI.
   * @example const preview = await file.previewRecoveryInfo()
   */
  async previewRecoveryInfo(): Promise<{ workspace: T; savedAt: number }> {
    return this.serialize(async () => ({
      workspace: await this.readRecovery(),
      savedAt: (await stat(this.recoveryPath)).mtimeMs,
    }))
  }

  /** Exports exact bytes from this account's partition when the primary cannot be opened.
   * The worker calls this only for recovery export; no file is rewritten or promoted.
   * Known foreign-owner envelopes are excluded, and invalid bytes are labelled as unvalidated.
   * @example const archive = await file.exportRecoveryFiles()
   */
  async exportRecoveryFiles(): Promise<string> {
    return this.serialize(async () => {
      const files: {
        name: string
        contentBase64: string
        integrity: 'valid' | 'invalid'
      }[] = []
      const excluded: string[] = []
      for (const [name, path] of [
        ['workspace.json', this.path],
        ['recovery.json', this.recoveryPath],
      ] as const) {
        let bytes: Buffer
        try {
          bytes = await readFile(path)
        } catch (error) {
          if (isMissingFile(error)) continue
          throw error
        }
        const text = bytes.toString('utf8')
        if (this.declaresForeignOwner(text)) {
          excluded.push(name)
          continue
        }
        let integrity: 'valid' | 'invalid' = 'valid'
        try {
          this.decode(text)
        } catch {
          integrity = 'invalid'
        }
        files.push({ name, contentBase64: bytes.toString('base64'), integrity })
      }
      if (!files.length) throw new WorkspaceFileError('recovery-missing')
      return JSON.stringify(
        {
          format: 'corelive-recovery-files',
          version: 1,
          ownerId: this.ownerId,
          exportedAt: new Date().toISOString(),
          files,
          excluded,
        },
        null,
        2,
      )
    })
  }

  /** Excludes explicitly foreign ownership while retaining uninterpretable bytes from the current partition.
   * @example if (this.declaresForeignOwner(text)) omitFile()
   */
  private declaresForeignOwner(text: string): boolean {
    let value: unknown
    try {
      value = JSON.parse(text) as unknown
    } catch {
      return false
    }
    if (typeof value !== 'object' || value === null) return false
    if ('ownerId' in value && value.ownerId !== this.ownerId) return true
    if ('payload' in value && typeof value.payload === 'string') {
      let payload: unknown
      try {
        payload = JSON.parse(value.payload) as unknown
      } catch {
        return false
      }
      return (
        typeof payload === 'object' &&
        payload !== null &&
        'ownerId' in payload &&
        payload.ownerId !== this.ownerId
      )
    }
    return false
  }

  /**
   * Restores a user-confirmed recovery copy, preserving invalid primary bytes first.
   * The domain callback advances its generation and records the recovery decision.
   * @example await file.restoreRecovery((state) => ({ ...state, revision: state.revision + 1 }))
   */
  async restoreRecovery(advance: (recovery: T) => T): Promise<T> {
    return this.serialize(async () => {
      const recovery = await this.readRecovery()
      const candidate = this.parse(advance(recovery))
      // Preserve the exact failed primary; it may contain newer recoverable writing.
      try {
        const original = await readFile(this.path)
        await this.replace(
          `${this.path}.preserved-${randomUUID()}`,
          original,
          false,
        )
      } catch (error) {
        if (!isMissingFile(error)) throw error
      }
      this.committedBytes = undefined
      this.committedState = undefined
      await this.commit(candidate)
      return structuredClone(candidate)
    })
  }

  /**
   * Keeps a rejected command from poisoning subsequent Retry commands.
   * @example return this.serialize(async () => this.readPrimary())
   */
  private async serialize<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.tail.then(operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /** Validates the account and checksum before domain parsing; never coerces corruption to empty data.
   * @example const state = this.decode(bytes)
   */
  private decode(bytes: string): T {
    try {
      const envelope = envelopeSchema.parse(JSON.parse(bytes) as unknown)
      const checksum = createHash('sha256')
        .update(envelope.payload)
        .digest('hex')
      if (envelope.ownerId !== this.ownerId || checksum !== envelope.checksum) {
        throw new WorkspaceFileError('invalid')
      }
      return this.parse(JSON.parse(envelope.payload) as unknown)
    } catch {
      // Parser diagnostics can include draft text; return only a safe storage reason.
      throw new WorkspaceFileError('invalid')
    }
  }

  /** Reloads the authoritative generation, including after an uncertain post-rename failure.
   * @example const state = await this.readPrimary()
   */
  private async readPrimary(): Promise<T> {
    let bytes: string
    try {
      bytes = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) throw new WorkspaceFileError('missing')
      throw error
    }
    // Unchanged bytes are the generation this instance already validated: skip parse + schema.
    if (bytes === this.committedBytes && this.committedState !== undefined)
      return this.committedState
    const state = this.decode(bytes)
    if (bytes !== this.committedBytes) this.primaryDirectoryFlushed = false
    this.committedBytes = bytes
    this.committedState = state
    return state
  }

  /** Reads the previous generation without promoting it automatically.
   * @example const state = await this.readRecovery()
   */
  private async readRecovery(): Promise<T> {
    try {
      return this.decode(await readFile(this.recoveryPath, 'utf8'))
    } catch (error) {
      if (isMissingFile(error)) throw new WorkspaceFileError('recovery-missing')
      throw error
    }
  }

  /** Saves the validated previous generation before replacing the primary.
   * @example await this.commit(next)
   */
  private async commit(value: T): Promise<void> {
    const payload = JSON.stringify(value)
    const bytes = JSON.stringify({
      format: 1,
      ownerId: this.ownerId,
      checksum: createHash('sha256').update(payload).digest('hex'),
      payload,
    })
    // The previous generation is preserved while the new bytes are written and flushed; the
    // primary is only renamed after both finished, so the order guarantee is unchanged:
    // a durable recovery copy exists before the primary is replaced.
    const preserved =
      this.committedBytes === undefined
        ? undefined
        : this.preservePreviousGeneration(this.committedBytes)
    // A rejection before `replace` awaits it must not become an unhandled rejection.
    preserved?.catch(() => undefined)
    try {
      this.primaryDirectoryFlushed = false
      await this.replace(this.path, bytes, true, preserved)
      this.committedBytes = bytes
      this.committedState = value
      this.primaryDirectoryFlushed = true
    } catch (error) {
      // A rename may already have committed; reread before accepting another command.
      this.committedBytes = undefined
      this.committedState = undefined
      throw error
    } finally {
      // Recovery work never keeps running behind a failed or finished commit.
      await preserved?.catch(() => undefined)
    }
  }

  /**
   * Makes the previous primary generation the recovery copy without rewriting its bytes.
   *
   * Atomicity argument: the primary inode was fully written and fsynced before the rename
   * that published it, and the primary is only ever replaced by renaming a new file over it,
   * never modified in place. So a hard link to it is a complete, immutable copy of the
   * previous generation. The link is created under a temporary name and renamed over the
   * recovery path (atomic), then the directory is flushed, all before the primary is
   * replaced, which keeps the old order: a valid previous generation exists at every
   * instant of the commit. Where hard links are unsupported it falls back to writing the
   * bytes (the original behaviour).
   * @param previousBytes - The bytes of the generation being demoted (fallback copy source).
   * @throws Filesystem failures other than "links unsupported".
   * @example await this.preservePreviousGeneration(this.committedBytes)
   */
  private async preservePreviousGeneration(
    previousBytes: string,
  ): Promise<void> {
    const temporary = `${this.recoveryPath}.${randomUUID()}.tmp`
    try {
      await link(this.path, temporary)
      await rename(temporary, this.recoveryPath)
      await this.flushDirectory(false)
    } catch (error) {
      if (!isLinkUnsupported(error)) throw error
      await this.replace(this.recoveryPath, previousBytes, false)
    } finally {
      // Only a failed rename leaves the temporary link behind; the data is never at risk.
      await unlink(temporary).catch((error: unknown) => {
        if (!isMissingFile(error)) throw error
      })
    }
  }

  /** Flushes bytes, replaces atomically, then flushes the containing directory.
   * @example await this.replace(this.path, bytes, true)
   */
  private async replace(
    path: string,
    bytes: string | Uint8Array,
    observe: boolean,
    before?: Promise<void>,
  ): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    try {
      if (observe) await this.onStage?.('before-write')
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(bytes, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      if (observe) await this.onStage?.('file-flushed')
      // Work that must be durable before this replacement becomes visible.
      await before
      await rename(temporary, path)
      if (observe) await this.onStage?.('replaced')
      await this.flushDirectory(observe)
    } finally {
      // Remove only this command's temporary file; never discard recovery generations.
      await unlink(temporary).catch((error: unknown) => {
        if (!isMissingFile(error)) throw error
      })
    }
  }

  /** Establishes the final durability barrier for replacements and uncertain idempotent retries.
   * @throws Filesystem or acknowledgement errors without marking the generation flushed.
   * @example await this.flushDirectory(true)
   */
  private async flushDirectory(observe: boolean): Promise<void> {
    const directoryHandle = await open(this.directory, 'r')
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
    if (observe) await this.onStage?.('directory-flushed')
  }
}

/** Recognizes filesystems or sandboxes that cannot hard-link, so the caller can copy instead.
 * @example if (isLinkUnsupported(error)) await copyInstead()
 */
function isLinkUnsupported(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EMLINK', 'ENOSYS'].includes(
      String(error.code),
    )
  )
}

/** Recognizes a missing path without swallowing permission or I/O failures.
 * @example if (isMissingFile(error)) return null
 */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
