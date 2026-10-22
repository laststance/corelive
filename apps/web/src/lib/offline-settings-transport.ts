import type { OfflineSettingsAPI } from '@corelive/desktop-contract/offline-editor-api'

type Method = 'read' | 'prepare' | 'patch'
type Result<K extends Method> = Awaited<ReturnType<OfflineSettingsAPI[K]>>
type Request = { key: string; promise: Promise<unknown>; settled: boolean }

/** Observes IPC with a deadline while retaining its underlying request after timeout.
 * {@link OfflinePreferenceSync} consumes results only while its account/route is active.
 * A timeout never cancels a native write or authorizes another concurrent transport.
 * @example const transport = new PreferenceTransport(() => sync.refresh())
 */
export class PreferenceTransport {
  private requests = new Map<Method, Request>()
  private timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  private stopped = false

  constructor(private readonly onSettled: () => void) {}

  /** Reuses a pending call, including its late reply, until the owner consumes it.
   * @example await transport.observe('read', 'owner', () => bridge.read(owner))
   */
  async observe<K extends Method>(
    method: K,
    key: string,
    call: () => Promise<Result<K>>,
  ): Promise<Result<K>> {
    let request = this.requests.get(method)
    // A previous generation must settle before another transport of this method starts.
    if (request && request.key !== key) {
      if (!request.settled) throw new Error('transport-pending')
      this.requests.delete(method)
      request = undefined
    }
    if (!request) {
      const current: Request = {
        key,
        settled: false,
        promise: call(),
      }
      current.promise = current.promise.then(
        (value) => {
          current.settled = true
          if (!this.stopped) this.onSettled()
          return value
        },
        (error: unknown) => {
          current.settled = true
          if (!this.stopped) this.onSettled()
          throw error
        },
      )
      // The timeout observer may depart before a late rejection arrives.
      void current.promise.catch(() => undefined)
      this.requests.set(method, current)
      request = current
    }
    const promise = request.promise as Promise<Result<K>>
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          const cancel = (): void => reject(new Error('observation-timeout'))
          timer = setTimeout(cancel, 10_000)
          this.timers.set(timer, cancel)
        }),
      ])
    } finally {
      if (timer) {
        clearTimeout(timer)
        this.timers.delete(timer)
      }
    }
  }

  /** Releases only a settled result; unresolved calls retain their identity.
   * @example transport.consume('patch')
   */
  consume(method: Method): void {
    if (this.requests.get(method)?.settled) this.requests.delete(method)
  }

  /** Stops observation timers without pretending to cancel native writes.
   * @example transport.stop()
   */
  stop(): void {
    this.stopped = true
    for (const [timer, cancel] of this.timers) {
      clearTimeout(timer)
      cancel()
    }
    this.timers.clear()
    this.requests.clear()
  }
}
