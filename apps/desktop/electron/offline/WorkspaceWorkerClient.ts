import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'

import { z } from 'zod'

import type { WorkspaceWorkerCalls } from './workspace-worker-protocol'

const WORKSPACE_IDLE_TIMEOUT_MS = 30_000

const replySchema = z.discriminatedUnion('ok', [
  z.object({ requestId: z.string(), ok: z.literal(true), result: z.unknown() }),
  z.object({
    requestId: z.string(),
    ok: z.literal(false),
    reason: z.string(),
    detail: z.string().optional(),
  }),
])

const workerMessageSchema = z.union([
  replySchema,
  z.object({ activity: z.literal('storage-progress') }),
  z.object({
    activity: z.literal('request-settled'),
    requestId: z.string(),
  }),
])

export class WorkspaceWorkerError extends Error {
  constructor(
    readonly reason: string,
    /** Extra copy input from a definite refusal (EA8 child name). */
    readonly detail?: string,
  ) {
    super(`Workspace: ${reason}`)
    this.name = 'WorkspaceWorkerError'
  }
}

/**
 * Keeps snapshot validation/serialization off Electron main's event loop.
 * The controller owns one client per account; this is a worker thread inside the
 * main process, not a second filesystem writer or a renderer capability.
 * @example const client = new WorkspaceWorkerClient({ script, directory, ownerId })
 */
export class WorkspaceWorkerClient {
  private worker: Worker | null = null
  private retiring: Promise<number> | null = null
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void
      reject: (reason: unknown) => void
    }
  >()
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(
    private readonly options: {
      script: string | URL
      directory: string
      ownerId: string
      execArgv?: string[]
      idleTimeoutMs?: number
    },
  ) {
    this.worker = this.startWorker()
  }

  /** Creates the account writer at construction or on a call following abnormal exit.
   * {@link WorkspaceWorkerClient.call} replaces only a stopped worker; lost requests stay rejected for retry.
   * @example this.worker = this.startWorker()
   */
  private startWorker(): Worker {
    const options = this.options
    const worker = new Worker(options.script, {
      workerData: { directory: options.directory, ownerId: options.ownerId },
      ...(options.execArgv ? { execArgv: options.execArgv } : {}),
    })
    worker.on('message', (input: unknown) => {
      if (this.worker !== worker || this.retiring) return
      const parsed = workerMessageSchema.safeParse(input)
      if (!parsed.success) {
        this.failAll('invalid-reply')
        return
      }
      const reply = parsed.data
      if ('activity' in reply && reply.activity === 'storage-progress') {
        this.watch(worker, true)
        return
      }
      const pending = this.pending.get(reply.requestId)
      if (!pending) return
      this.pending.delete(reply.requestId)
      this.watch(worker, true)
      if ('activity' in reply)
        pending.reject(new WorkspaceWorkerError('worker-unavailable'))
      else if (reply.ok) pending.resolve(reply.result)
      else pending.reject(new WorkspaceWorkerError(reply.reason, reply.detail))
    })
    worker.on('error', () => this.failAll('worker-unavailable'))
    worker.on('exit', () => {
      // Exit is the final event: a later caller may replace this writer without overlapping it.
      if (this.worker !== worker) return
      this.worker = null
      this.retiring = null
      this.failAll('worker-unavailable')
    })
    return worker
  }

  /** Dispatches a typed request without exposing worker paths or filesystem methods to a renderer.
   * @example const view = await client.call('open', null)
   */
  async call<K extends keyof WorkspaceWorkerCalls>(
    type: K,
    input: WorkspaceWorkerCalls[K]['input'],
  ): Promise<WorkspaceWorkerCalls[K]['output']> {
    if (this.closed || this.retiring)
      throw new WorkspaceWorkerError('worker-unavailable')
    // Replacement is demand-driven; never replay an unknown command inside the transport.
    const worker = (this.worker ??= this.startWorker())
    const requestId = randomUUID()
    return new Promise<WorkspaceWorkerCalls[K]['output']>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as WorkspaceWorkerCalls[K]['output']),
        reject,
      })
      this.watch(worker)
      try {
        worker.postMessage({ requestId, type, input })
      } catch (error) {
        this.pending.delete(requestId)
        this.watch(worker)
        reject(error)
      }
    })
  }

  /** Bounds gaps in storage progress for the worker, including its first pending request.
   * Enqueuing another call never postpones an already running watchdog.
   * @example this.watch(worker, true)
   */
  private watch(worker: Worker, progressed = false): void {
    if (this.pending.size === 0) {
      clearTimeout(this.watchdog)
      this.watchdog = undefined
    } else if (!this.watchdog) {
      this.watchdog = setTimeout(
        () => this.retire(worker),
        this.options.idleTimeoutMs ?? WORKSPACE_IDLE_TIMEOUT_MS,
      ).unref()
    } else if (progressed) {
      this.watchdog.refresh()
    }
  }

  /** Stops a fully flushed account worker during application shutdown or account eviction.
   * The controller must finish pending renderer flushes before calling this.
   * @example await client.close()
   */
  async close(): Promise<void> {
    this.closed = true
    if (this.worker) this.retire(this.worker)
    await this.retiring
  }

  /** Ends a stalled writer without replaying uncertain writes or starting a competing worker.
   * The reply timer calls this; a subsequent request can reopen the workspace after exit.
   * @example this.retire(worker)
   */
  private retire(worker: Worker): void {
    if (this.worker !== worker || this.retiring) return
    this.retiring = worker.terminate()
    void this.retiring.catch(() => undefined)
    this.failAll('worker-unavailable')
  }

  /** Rejects in-flight calls without logging private writing or worker exception details.
   * @example this.failAll('worker-unavailable')
   */
  private failAll(reason: string): void {
    clearTimeout(this.watchdog)
    this.watchdog = undefined
    for (const pending of this.pending.values())
      pending.reject(new WorkspaceWorkerError(reason))
    this.pending.clear()
  }
}
