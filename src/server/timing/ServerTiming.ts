import {
  SERVER_TIMING_DECIMAL_PLACES,
  SERVER_TIMING_METRICS,
} from './constants'

export type ServerTimingMetric = (typeof SERVER_TIMING_METRICS)[number]

/** Collects one request's Home/API phases so the route handler can expose production latency without user data. @example `const timing = new ServerTiming()` */
export class ServerTiming {
  private readonly durations = new Map<ServerTimingMetric, number>()

  /** Accumulates a measured phase when nested middleware or procedures contribute to the same metric. @param metric - Stable response metric name. @param durationMs - Non-negative elapsed milliseconds. @returns Nothing after storing the duration. @example `timing.record('db', 12.5)` */
  record(metric: ServerTimingMetric, durationMs: number): void {
    const safeDurationMs = Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : 0
    this.durations.set(
      metric,
      (this.durations.get(metric) ?? 0) + safeDurationMs,
    )
  }

  /** Measures an operation even when it rejects so callers retain failure-path diagnostics. @param metric - Stable response metric name. @param operation - Synchronous or asynchronous work to measure. @returns The operation's original result. @example `await timing.measure('sql', () => prisma.todo.findMany())` */
  async measure<Result>(
    metric: ServerTimingMetric,
    operation: () => Result | Promise<Result>,
  ): Promise<Result> {
    const startedAt = performance.now()
    try {
      return await operation()
    } finally {
      this.record(metric, performance.now() - startedAt)
    }
  }

  /** Serializes recorded phases in a deterministic order whenever the API route builds its response. @returns A standards-compatible `Server-Timing` field value, or an empty string when nothing ran. @example `timing.toHeaderValue() // => "auth;dur=1.20, sql;dur=8.50"` */
  toHeaderValue(): string {
    return SERVER_TIMING_METRICS.flatMap((metric) => {
      const durationMs = this.durations.get(metric)
      return durationMs === undefined
        ? []
        : [`${metric};dur=${durationMs.toFixed(SERVER_TIMING_DECIMAL_PLACES)}`]
    }).join(', ')
  }
}
