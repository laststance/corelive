import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'

import { z } from 'zod'

import type { WorkspaceWorkerCalls } from './workspace-worker-protocol'

const replySchema = z.discriminatedUnion('ok', [
  z.object({ requestId: z.string(), ok: z.literal(true), result: z.unknown() }),
  z.object({ requestId: z.string(), ok: z.literal(false), reason: z.string() }),
])

export class WorkspaceWorkerError extends Error {
  constructor(readonly reason: string) {
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
  private readonly worker: Worker
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >()
  private closed = false

  constructor(options: {
    script: string | URL
    directory: string
    ownerId: string
    execArgv?: string[]
  }) {
    this.worker = new Worker(options.script, {
      workerData: { directory: options.directory, ownerId: options.ownerId },
      ...(options.execArgv ? { execArgv: options.execArgv } : {}),
    })
    this.worker.on('message', (input: unknown) => {
      const parsed = replySchema.safeParse(input)
      if (!parsed.success) {
        this.failAll('invalid-reply')
        return
      }
      const reply = parsed.data
      const pending = this.pending.get(reply.requestId)
      if (!pending) return
      this.pending.delete(reply.requestId)
      if (reply.ok) pending.resolve(reply.result)
      else pending.reject(new WorkspaceWorkerError(reply.reason))
    })
    this.worker.on('error', () => this.failAll('worker-unavailable'))
    this.worker.on('exit', () => {
      this.closed = true
      this.failAll('worker-unavailable')
    })
  }

  /** Dispatches a typed request without exposing worker paths or filesystem methods to a renderer.
   * @example const view = await client.call('open', null)
   */
  async call<K extends keyof WorkspaceWorkerCalls>(
    type: K,
    input: WorkspaceWorkerCalls[K]['input'],
  ): Promise<WorkspaceWorkerCalls[K]['output']> {
    if (this.closed) throw new WorkspaceWorkerError('worker-unavailable')
    const requestId = randomUUID()
    return new Promise<WorkspaceWorkerCalls[K]['output']>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as WorkspaceWorkerCalls[K]['output']),
        reject,
      })
      this.worker.postMessage({ requestId, type, input })
    })
  }

  /** Stops a fully flushed account worker during application shutdown or account eviction.
   * The controller must finish pending renderer flushes before calling this.
   * @example await client.close()
   */
  async close(): Promise<void> {
    this.closed = true
    await this.worker.terminate()
    this.failAll('worker-unavailable')
  }

  /** Rejects in-flight calls without logging private writing or worker exception details.
   * @example this.failAll('worker-unavailable')
   */
  private failAll(reason: string): void {
    for (const pending of this.pending.values())
      pending.reject(new WorkspaceWorkerError(reason))
    this.pending.clear()
  }
}
