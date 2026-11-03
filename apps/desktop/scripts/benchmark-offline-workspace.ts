import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import type { CompletionSyncTransport } from '@corelive/desktop-contract/offline-sync'
import type { CompletionSyncReceipt } from '@corelive/desktop-contract/offline-workspace'
import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { AtomicWorkspaceFile } from '../electron/offline/AtomicWorkspaceFile'
import { categoryUuid } from '../electron/offline/deviceWorkspaceFixture'
import { SyncLoop } from '../electron/offline/SyncLoop'
import { WorkspaceWorkerClient } from '../electron/offline/WorkspaceWorkerClient'

import {
  BENCHMARK_ACCOUNT_ID,
  buildBenchmarkWorkspace,
  type BenchmarkProfile,
} from './benchmark-offline-fixture'

const COMMAND = 'benchmark:offline'
/** The size the merge gate (D1: p95 <= 100 ms) is measured at. */
const GATE_COMPLETIONS = 36_500
const DEFAULT_SIZES = [3_650, 10_000, GATE_COMPLETIONS]
const PROFILES: BenchmarkProfile[] = ['attached', 'local-only']
const WARMUP_SAMPLES = 3
/** 40 samples keep one or two disk stalls from deciding the p95 (nearest rank: the 38th). */
const MEASURED_SAMPLES = 40
const COLD_PARSE_SAMPLES = 5
const BYTES_PER_GIGABYTE = 1024 ** 3
const BYTES_PER_MEGABYTE = 1024 ** 2
/** Placeholder bearer the fake broker hands out; the benchmark transport never sends it anywhere. */
const BENCHMARK_FAKE_TOKEN = 'benchmark-token'

type Operation = 'keep' | 'autosave' | 'cold-parse'

interface Drain {
  completions: number
  seconds: number
  perSecond: number
}

interface Run {
  profile: BenchmarkProfile
  completions: number
  operation: Operation
  p50Ms: number
  p95Ms: number
  samples: number
  /** Process RSS (MB) right after the run's samples; the worker thread shares the process. */
  rssMb: number
}

const HELP = `pnpm ${COMMAND} - measures the offline workspace's durable write paths in a temp directory (never userData).

Usage: pnpm ${COMMAND} [--json] [--max-p95-ms <n>] [--completions <n,n,...>] [--drain] [--help]

Measures, at ${DEFAULT_SIZES.map((size) => size.toLocaleString('en-US')).join(', ')} completions, two profiles (command receipts, one recovery
generation, 20 completions a day over the real span, 10% of titles and draft lines at the title
length limit):
  attached    a signed-in Mac: sent history, 10% in flight with an outbox entry
  local-only  a Mac that was never attached: 100% of completions unsent, no binding, no outbox
  keep        worker round trip of a completion, request to durable acknowledgement
  autosave    worker round trip of a draft save
  cold-parse  reading and validating the keep-path file from disk, after the archive roll
              (settled history older than two days lives in device-archive.json)

Options:
  --json               Print one JSON object {machine, runs, peakRssMb, gate} instead of the table.
  --max-p95-ms <n>     Exit 1 (BENCH_GATE_FAILED) when the keep p95 at the largest size exceeds n
                       in EITHER profile. Without it the exit status is always 0 (report only).
  --drain              Also time the first upload of the largest local-only workspace through the
                       real sync loop against an in-process fake dashboard.
  --completions <list> Comma-separated fixture sizes; the gate uses the largest. For quick runs.
  --help               Print this text and exit 0.

The merge gate is: keep p95 <= 100 ms at ${GATE_COMPLETIONS.toLocaleString('en-US')} completions, in both profiles, on the owner's Mac.
Example: pnpm ${COMMAND} --json --max-p95-ms 100
`

/**
 * Summarizes samples as p50 and p95 in milliseconds.
 *
 * @param samples - Measured durations.
 * @returns Nearest-rank percentiles, rounded to 0.01 ms.
 * @example percentiles([1, 3, 2]) // { p50Ms: 2, p95Ms: 3 }
 */
function percentiles(samples: number[]): { p50Ms: number; p95Ms: number } {
  const sorted = [...samples].sort((left, right) => left - right)
  const at = (fraction: number): number =>
    Math.round(
      (sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0) * 100,
    ) / 100
  return { p50Ms: at(0.5), p95Ms: at(0.95) }
}

/**
 * Measures the three operations for one fixture size in its own temp directory.
 *
 * @param root - Temp directory owned by this invocation.
 * @param completions - Fixture size.
 * @param profile - The Mac being modelled.
 * @returns One {@link Run} per operation.
 * @example const runs = await measureSize(directory, 1000, 'local-only')
 */
async function measureSize(
  root: string,
  completions: number,
  profile: BenchmarkProfile,
): Promise<Run[]> {
  const directory = join(root, `fixture-${profile}-${completions}`)
  const fileOptions = {
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  }
  const file = new AtomicWorkspaceFile(fileOptions)
  const seeded = buildBenchmarkWorkspace(completions, profile)
  await file.initialize(seeded)
  // A second full generation makes the recovery copy as large as the primary.
  await file.update((current) => ({
    ...current,
    revision: current.revision + 1,
  }))

  const worker = new WorkspaceWorkerClient({
    script: new URL('../electron/offline/workspace-worker.ts', import.meta.url),
    directory,
    ownerId: DEVICE_OWNER_ID,
    execArgv: ['--import', 'tsx'],
  })
  const keep: number[] = []
  const autosave: number[] = []
  try {
    let view = await worker.call('open', null)
    // The idle roll that keeps the keep-path snapshot bounded (D1 size budget); not timed.
    await worker.call('archive', null)
    for (let sample = 0; sample < WARMUP_SAMPLES + MEASURED_SAMPLES; sample++) {
      // Autosave: edit one short line of the draft.
      const saveStart = performance.now()
      view = await worker.call('command', {
        type: 'save',
        commandId: randomUUID(),
        categoryId: categoryUuid(1),
        baseRevision: view.draft.revision,
        rows: view.draft.rows.map((row, index) =>
          index === 0 ? { ...row, text: `Edit ${sample}` } : row,
        ),
      })
      const saveMs = performance.now() - saveStart
      // Keep: complete the next short unfinished line.
      const row = view.draft.rows.find(
        (candidate, index) => !candidate.completionId && index % 10 !== 9,
      )
      if (!row) throw new Error('The benchmark draft ran out of lines')
      const keepStart = performance.now()
      view = await worker.call('command', {
        type: 'complete',
        commandId: randomUUID(),
        categoryId: categoryUuid(1),
        baseRevision: view.draft.revision,
        rowId: row.id,
        completionId: randomUUID(),
        completedAt: Date.now(),
        timezone: 'Asia/Tokyo',
      })
      const keepMs = performance.now() - keepStart
      if (sample >= WARMUP_SAMPLES) {
        autosave.push(saveMs)
        keep.push(keepMs)
      }
    }
  } finally {
    await worker.close()
  }
  const rssMb = Math.round(process.memoryUsage().rss / BYTES_PER_MEGABYTE)
  // Steady state: the file a restart parses after the idle archive roll has run.
  const coldParse: number[] = []
  for (let sample = 0; sample < COLD_PARSE_SAMPLES; sample++) {
    const start = performance.now()
    await new AtomicWorkspaceFile(fileOptions).read()
    coldParse.push(performance.now() - start)
  }

  const run = (operation: Operation, samples: number[]): Run => ({
    profile,
    completions,
    operation,
    ...percentiles(samples),
    samples: samples.length,
    rssMb,
  })
  return [
    run('keep', keep),
    run('autosave', autosave),
    run('cold-parse', coldParse),
  ]
}

/**
 * Times the first upload of a never-attached workspace through the real sync loop.
 *
 * The workspace is the local-only fixture with the account just bound, rolled into the archive
 * the way the idle roll does, then drained by {@link SyncLoop} against an in-process fake
 * dashboard that applies every operation. Measures the "minutes, not hours" claim of #216 D1.
 *
 * @param root - Temp directory owned by this invocation.
 * @param completions - Fixture size.
 * @returns Wall time and throughput of the drain.
 * @throws When the loop stops making progress for 120 s.
 * @example const drain = await measureDrain(directory, 36_500)
 */
async function measureDrain(root: string, completions: number): Promise<Drain> {
  const directory = join(root, `drain-${completions}`)
  const file = new AtomicWorkspaceFile({
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  })
  await file.initialize(
    buildBenchmarkWorkspace(completions, 'local-only', { bound: true }),
  )
  const worker = new WorkspaceWorkerClient({
    script: new URL('../electron/offline/workspace-worker.ts', import.meta.url),
    directory,
    ownerId: DEVICE_OWNER_ID,
    execArgv: ['--import', 'tsx'],
  })
  const receipts = new Map<string, CompletionSyncReceipt>()
  const transport = {
    bootstrap: async () => ({
      accountId: BENCHMARK_ACCOUNT_ID,
      categories: Array.from({ length: 20 }, (_, index) => ({
        id: index + 1,
        name: index === 0 ? 'General' : `Category ${index + 1}`,
        color: 'blue' as const,
        isDefault: index === 0,
        parentId: null,
        removed: false,
      })),
      deletions: [],
    }),
    apply: async ({
      operations,
    }: Parameters<CompletionSyncTransport['apply']>[0]) => ({
      receipts: operations.map((operation): CompletionSyncReceipt => {
        const receipt: CompletionSyncReceipt = {
          operationId: operation.operationId,
          completionId: operation.completionId,
          revision: operation.revision,
          status: 'applied',
          projection: {
            completionId: operation.completionId,
            revision: operation.revision,
            cancelled: operation.kind === 'cancel',
            categoryId: operation.categoryId,
            title: operation.title,
            completedAt: operation.completedAt,
          },
        }
        receipts.set(operation.operationId, receipt)
        return receipt
      }),
    }),
    receipts: async ({ operationIds }: { operationIds: string[] }) => ({
      receipts: operationIds.flatMap((id) => receipts.get(id) ?? []),
    }),
    categoryApply: async () => ({ receipts: [] }),
    categoryReceipts: async () => ({ receipts: [] }),
    checkpoint: async ({
      day,
      timezone,
      completionIds,
    }: Parameters<CompletionSyncTransport['checkpoint']>[0]) => ({
      day,
      timezone,
      total: 0,
      fetchedAt: Date.now(),
      identities: Object.fromEntries(completionIds.map((id) => [id, null])),
    }),
  } as unknown as CompletionSyncTransport
  const loop = new SyncLoop({
    context: () => ({
      ownerId: BENCHMARK_ACCOUNT_ID,
      generation: 1,
      worker,
    }),
    broker: {
      acquire: async (expectedAccountId, generation) => ({
        status: 'ready',
        credential: {
          status: 'ready',
          requestId: randomUUID(),
          expectedAccountId,
          generation,
          accountId: BENCHMARK_ACCOUNT_ID,
          token: BENCHMARK_FAKE_TOKEN,
        },
      }),
    },
    transport: () => transport,
    onView: () => undefined,
    onStatus: () => undefined,
    random: () => 0,
  })
  try {
    await worker.call('open', null)
    // The idle roll puts the never-sent history into the archive, as it would before attach.
    await worker.call('archive', null)
    const start = performance.now()
    loop.wake()
    let lastLeft = Infinity
    let lastProgress = performance.now()
    for (;;) {
      const left = await worker.call('pendingTotal', null)
      const { uncertain } = await worker.call('pending', { limit: 1 })
      if (left === 0 && uncertain.length === 0) break
      if (left < lastLeft) {
        lastLeft = left
        lastProgress = performance.now()
      } else if (performance.now() - lastProgress > 120_000) {
        throw new Error(`The drain stalled with ${left} keeps left`)
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const seconds = (performance.now() - start) / 1000
    return {
      completions,
      seconds,
      perSecond: Math.round(completions / seconds),
    }
  } finally {
    await loop.stop()
    await worker.close()
  }
}

/**
 * Formats the table printed by default: machine line, one row per run, the peak RSS.
 *
 * @param result - The full measurement.
 * @returns The table text.
 * @example process.stdout.write(formatTable(result))
 */
function formatTable(result: {
  machine: Record<string, string | number>
  runs: Run[]
  peakRssMb: number
  drain: Drain | null
}): string {
  const machine = result.machine
  const lines = [
    `${machine.cpu} (${machine.cores} cores, ${machine.memoryGb} GB) · ${machine.os} · node ${machine.node}`,
    '',
    'profile      completions  operation   p50 ms    p95 ms    samples  RSS MB',
    ...result.runs.map(
      (run) =>
        `${run.profile.padEnd(10)}  ${String(run.completions).padStart(11)}  ${run.operation.padEnd(10)}  ${run.p50Ms.toFixed(2).padStart(8)}  ${run.p95Ms.toFixed(2).padStart(8)}  ${String(run.samples).padStart(7)}  ${String(run.rssMb).padStart(6)}`,
    ),
    '',
    `peak RSS: ${result.peakRssMb} MB`,
    ...(result.drain
      ? [
          `first upload (local-only, ${result.drain.completions} completions, in-process fake): ${result.drain.seconds.toFixed(1)} s, ${result.drain.perSecond} keeps/s`,
        ]
      : []),
  ]
  return `${lines.join('\n')}\n`
}

/**
 * Entry point: parse, measure in a temp directory, print, apply the optional gate.
 *
 * @example await main()
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  let json = false
  let drain = false
  let maxP95Ms: number | null = null
  let sizes = DEFAULT_SIZES
  // Parse everything before creating the temp directory.
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!
    if (argument === '--help' || argument === '-h') {
      process.stdout.write(HELP)
      return
    }
    if (argument === '--json') json = true
    else if (argument === '--drain') drain = true
    else if (argument === '--max-p95-ms') {
      maxP95Ms = Number(argv[++index])
      if (!Number.isFinite(maxP95Ms) || maxP95Ms < 0) {
        process.stderr.write(
          `${COMMAND}: --max-p95-ms needs a number of milliseconds (ARGUMENT_UNKNOWN). Fix: pnpm ${COMMAND} --help\n`,
        )
        process.exit(2)
      }
    } else if (argument === '--completions') {
      sizes = String(argv[++index])
        .split(',')
        .map(Number)
        .filter((size) => Number.isInteger(size) && size >= 0)
      if (sizes.length === 0) {
        process.stderr.write(
          `${COMMAND}: --completions needs a comma-separated list of counts (ARGUMENT_UNKNOWN). Fix: pnpm ${COMMAND} --help\n`,
        )
        process.exit(2)
      }
    } else {
      process.stderr.write(
        `${COMMAND}: unknown argument "${argument}" (ARGUMENT_UNKNOWN). Fix: pnpm ${COMMAND} --help\n`,
      )
      process.exit(2)
    }
  }

  const root = await mkdtemp(join(tmpdir(), 'corelive-storage-benchmark-'))
  const runs: Run[] = []
  let drainResult: Drain | null = null
  try {
    for (const profile of PROFILES)
      for (const size of sizes)
        runs.push(...(await measureSize(root, size, profile)))
    if (drain) drainResult = await measureDrain(root, Math.max(...sizes))
  } finally {
    // Delete only this invocation's synthetic temporary directory.
    await rm(root, { recursive: true, force: true })
  }

  const gateSize = Math.max(...sizes)
  // The gate passes only if every profile passes at the largest size.
  const gateRuns = runs.filter(
    (run) => run.completions === gateSize && run.operation === 'keep',
  )
  const gate =
    maxP95Ms === null || gateRuns.length === 0
      ? null
      : {
          maxP95Ms,
          passed: gateRuns.every((run) => run.p95Ms <= maxP95Ms),
          profiles: Object.fromEntries(
            gateRuns.map((run) => [
              run.profile,
              { p95Ms: run.p95Ms, passed: run.p95Ms <= maxP95Ms },
            ]),
          ),
        }
  const result = {
    machine: {
      cpu: cpus()[0]?.model ?? 'unknown',
      cores: cpus().length,
      memoryGb: Math.round(totalmem() / BYTES_PER_GIGABYTE),
      os: `${platform()} ${release()}`,
      node: process.version,
    },
    runs,
    // maxRSS is reported in kilobytes; the worker thread shares this process.
    peakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
    gate,
    drain: drainResult,
  }
  process.stdout.write(
    json ? `${JSON.stringify(result, null, 2)}\n` : formatTable(result),
  )
  if (gate && !gate.passed) {
    const failing = gateRuns
      .filter((run) => run.p95Ms > gate.maxP95Ms)
      .map((run) => `${run.profile} ${run.p95Ms} ms`)
      .join(', ')
    process.stderr.write(
      `${COMMAND}: keep-commit p95 ${failing} > ${gate.maxP95Ms} ms at ${gateSize.toLocaleString('en-US')} completions (BENCH_GATE_FAILED). Fix: rerun once on an idle Mac; if it still fails, the single-snapshot decision (D1) needs review.\n`,
    )
    process.exit(1)
  }
}

await main()
