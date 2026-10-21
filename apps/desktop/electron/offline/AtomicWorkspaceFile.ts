import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
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
  private readonly onStage: WorkspaceFileOptions<T>['onStage']
  private tail: Promise<void> = Promise.resolve()
  private committedBytes: string | undefined
  private primaryDirectoryFlushed = false

  constructor(options: WorkspaceFileOptions<T>) {
    this.directory = options.directory
    this.ownerId = options.ownerId
    this.parse = options.parse
    this.onStage = options.onStage
    // Account IDs are data, never filesystem paths.
    const partition = createHash('sha256').update(options.ownerId).digest('hex')
    this.path = join(options.directory, `${partition}.json`)
    this.recoveryPath = join(options.directory, `${partition}.recovery.json`)
  }

  /**
   * Reads only committed primary bytes; called at local startup and by commands.
   * @throws {@link WorkspaceFileError} when the primary is absent or invalid.
   * @example const workspace = await file.read()
   */
  async read(): Promise<T> {
    return this.serialize(async () => this.readPrimary())
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
   * @example await file.update((state) => reduceWorkspace(state, command))
   */
  async update(change: (current: T) => T): Promise<T> {
    return this.serialize(async () => {
      const current = await this.readPrimary()
      const candidate = change(current)
      if (candidate === current) {
        // A receipt loaded after restart or an uncertain rename still needs its directory barrier.
        if (!this.primaryDirectoryFlushed) {
          await this.flushDirectory(true)
          this.primaryDirectoryFlushed = true
        }
        return structuredClone(current)
      }
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
      await this.commit(candidate)
      return structuredClone(candidate)
    })
  }

  /**
   * Rebuilds invalid registry metadata only after the caller verifies an online account.
   * Existing valid metadata must use normal update; invalid bytes remain preserved.
   * This is not automatic workspace recovery and is never exposed to renderers.
   * @example await registry.recoverVerified(verifiedRegistry)
   */
  async recoverVerified(value: T): Promise<T> {
    return this.serialize(async () => {
      try {
        await this.readPrimary()
        throw new WorkspaceFileError('exists')
      } catch (error) {
        if (
          !(error instanceof WorkspaceFileError) ||
          !['missing', 'invalid'].includes(error.reason)
        )
          throw error
      }
      const candidate = this.parse(value)
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      try {
        await this.replace(
          `${this.path}.preserved-${randomUUID()}`,
          await readFile(this.path),
          false,
        )
      } catch (error) {
        if (!isMissingFile(error)) throw error
      }
      this.committedBytes = undefined
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
    const state = this.decode(bytes)
    if (bytes !== this.committedBytes) this.primaryDirectoryFlushed = false
    this.committedBytes = bytes
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
    if (this.committedBytes !== undefined) {
      await this.replace(this.recoveryPath, this.committedBytes, false)
    }
    try {
      this.primaryDirectoryFlushed = false
      await this.replace(this.path, bytes, true)
      this.committedBytes = bytes
      this.primaryDirectoryFlushed = true
    } catch (error) {
      // A rename may already have committed; reread before accepting another command.
      this.committedBytes = undefined
      throw error
    }
  }

  /** Flushes bytes, replaces atomically, then flushes the containing directory.
   * @example await this.replace(this.path, bytes, true)
   */
  private async replace(
    path: string,
    bytes: string | Uint8Array,
    observe: boolean,
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

/** Recognizes a missing path without swallowing permission or I/O failures.
 * @example if (isMissingFile(error)) return null
 */
function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
