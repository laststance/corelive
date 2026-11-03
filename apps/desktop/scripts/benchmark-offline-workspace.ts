import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  DEVICE_OWNER_ID,
  DEVICE_WORKSPACE_FILE_NAME,
  OfflineWorkspaceSchema,
  type OfflineWorkspace,
} from '@corelive/desktop-contract/offline-workspace-v2'

import { AtomicWorkspaceFile } from '../electron/offline/AtomicWorkspaceFile'
import {
  buildDeviceWorkspace,
  categoryUuid,
} from '../electron/offline/deviceWorkspaceFixture'
import { WorkspaceWorkerClient } from '../electron/offline/WorkspaceWorkerClient'
import { COMPLETED_TITLE_MAX_LENGTH } from '../renderer/editor/liveEditorUtils'

const COMMAND = 'benchmark:offline'
/** The size the merge gate (D1: p95 <= 100 ms) is measured at. */
const GATE_COMPLETIONS = 36_500
const DEFAULT_SIZES = [3_650, GATE_COMPLETIONS]
const WARMUP_SAMPLES = 3
const MEASURED_SAMPLES = 20
const COLD_PARSE_SAMPLES = 5
const CATEGORY_COUNT = 20
const DRAFT_ROWS = 100
const BYTES_PER_GIGABYTE = 1024 ** 3

type Operation = 'keep' | 'autosave' | 'cold-parse'

interface Run {
  completions: number
  operation: Operation
  p50Ms: number
  p95Ms: number
  samples: number
}

const HELP = `pnpm ${COMMAND} - measures the offline workspace's durable write paths in a temp directory (never userData).

Usage: pnpm ${COMMAND} [--json] [--max-p95-ms <n>] [--completions <n,n,...>] [--help]

Measures, at ${DEFAULT_SIZES.map((size) => size.toLocaleString('en-US')).join(' and ')} completions (an outbox, command receipts,
one recovery generation, 10% of lines at the title length limit):
  keep        worker round trip of a completion, request to durable acknowledgement
  autosave    worker round trip of a draft save
  cold-parse  reading and validating the whole file from disk

Options:
  --json               Print one JSON object {machine, runs, peakRssMb, gate} instead of the table.
  --max-p95-ms <n>     Exit 1 (BENCH_GATE_FAILED) when the keep p95 at the largest size exceeds n.
                       Without it the exit status is always 0 (report only).
  --completions <list> Comma-separated fixture sizes; the gate uses the largest. For quick runs.
  --help               Print this text and exit 0.

The merge gate is: keep p95 <= 100 ms at ${GATE_COMPLETIONS.toLocaleString('en-US')} completions on the owner's Mac.
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
 * Builds the realistic benchmark workspace: completions with receipts, a partial outbox,
 * a 100-line draft whose every tenth line is at the title length limit.
 *
 * @param completions - Number of kept completions to hold.
 * @returns A schema-valid v2 workspace bound to a synthetic account.
 * @example const workspace = buildBenchmarkWorkspace(100)
 */
function buildBenchmarkWorkspace(completions: number): OfflineWorkspace {
  const seeded = buildDeviceWorkspace({
    categoryCount: CATEGORY_COUNT,
    boundAccountId: 'synthetic-benchmark',
  })
  const firstCategory = categoryUuid(1)
  seeded.drafts[firstCategory] = {
    revision: 0,
    rows: Array.from({ length: DRAFT_ROWS }, (_, index) => ({
      id: randomUUID(),
      text:
        index % 10 === 9
          ? 'x'.repeat(COMPLETED_TITLE_MAX_LENGTH)
          : `Synthetic line ${index}`,
    })),
  }
  for (let index = 0; index < completions; index++) {
    const id = randomUUID()
    const categoryId = categoryUuid((index % CATEGORY_COUNT) + 1)
    const title = `Recorded synthetic work ${index}`
    const completedAt = Date.now() - index * 1000
    seeded.completions[id] = {
      id,
      categoryId,
      originalCategoryId: categoryId,
      title,
      rawText: title,
      lineId: randomUUID(),
      lineIndex: 0,
      completedAt,
      originalCompletedAt: completedAt,
      timezone: 'Asia/Tokyo',
      revision: 1,
      undoUntil: completedAt,
      cancelled: false,
      restored: false,
      remote: null,
      clearAfter: null,
      cleared: false,
    }
    seeded.commandReceipts[randomUUID()] = {
      digest: 'f'.repeat(64),
      completionId: id,
      revision: index + 1,
    }
    // One completion in ten is still waiting to send.
    if (index % 10 === 0) {
      const operationId = randomUUID()
      seeded.outbox[operationId] = {
        state: 'queued',
        operation: {
          operationId,
          completionId: id,
          deviceId: seeded.deviceId,
          revision: 1,
          expectedRemoteRevision: 0,
          kind: 'create',
          categoryId,
          title,
          completedAt,
          originalCompletedAt: completedAt,
          timezone: 'Asia/Tokyo',
        },
      }
    }
  }
  return seeded
}

/**
 * Measures the three operations for one fixture size in its own temp directory.
 *
 * @param root - Temp directory owned by this invocation.
 * @param completions - Fixture size.
 * @returns One {@link Run} per operation.
 * @example const runs = await measureSize(directory, 1000)
 */
async function measureSize(root: string, completions: number): Promise<Run[]> {
  const directory = join(root, `fixture-${completions}`)
  const fileOptions = {
    directory,
    ownerId: DEVICE_OWNER_ID,
    fileName: DEVICE_WORKSPACE_FILE_NAME,
    parse: OfflineWorkspaceSchema.parse,
  }
  const file = new AtomicWorkspaceFile(fileOptions)
  const seeded = buildBenchmarkWorkspace(completions)
  await file.initialize(seeded)
  // A second full generation makes the recovery copy as large as the primary.
  await file.update((current) => ({
    ...current,
    revision: current.revision + 1,
  }))

  const coldParse: number[] = []
  for (let sample = 0; sample < COLD_PARSE_SAMPLES; sample++) {
    const start = performance.now()
    await new AtomicWorkspaceFile(fileOptions).read()
    coldParse.push(performance.now() - start)
  }

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
  const run = (operation: Operation, samples: number[]): Run => ({
    completions,
    operation,
    ...percentiles(samples),
    samples: samples.length,
  })
  return [
    run('keep', keep),
    run('autosave', autosave),
    run('cold-parse', coldParse),
  ]
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
}): string {
  const machine = result.machine
  const lines = [
    `${machine.cpu} (${machine.cores} cores, ${machine.memoryGb} GB) · ${machine.os} · node ${machine.node}`,
    '',
    'completions  operation   p50 ms    p95 ms    samples',
    ...result.runs.map(
      (run) =>
        `${String(run.completions).padStart(11)}  ${run.operation.padEnd(10)}  ${run.p50Ms.toFixed(2).padStart(8)}  ${run.p95Ms.toFixed(2).padStart(8)}  ${String(run.samples).padStart(7)}`,
    ),
    '',
    `peak RSS: ${result.peakRssMb} MB`,
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
  try {
    for (const size of sizes) runs.push(...(await measureSize(root, size)))
  } finally {
    // Delete only this invocation's synthetic temporary directory.
    await rm(root, { recursive: true, force: true })
  }

  const gateSize = Math.max(...sizes)
  const gateRun = runs.find(
    (run) => run.completions === gateSize && run.operation === 'keep',
  )
  const gate =
    maxP95Ms === null || !gateRun
      ? null
      : { maxP95Ms, passed: gateRun.p95Ms <= maxP95Ms }
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
  }
  process.stdout.write(
    json ? `${JSON.stringify(result, null, 2)}\n` : formatTable(result),
  )
  if (gate && !gate.passed && gateRun) {
    process.stderr.write(
      `${COMMAND}: keep-commit p95 ${gateRun.p95Ms} ms > ${gate.maxP95Ms} ms at ${gateSize.toLocaleString('en-US')} completions (BENCH_GATE_FAILED). Fix: rerun once on an idle Mac; if it still fails, the single-snapshot decision (D1) needs review.\n`,
    )
    process.exit(1)
  }
}

await main()
