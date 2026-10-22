import { randomUUID } from 'node:crypto'
import { writeFileSync, renameSync } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { cpus, platform, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

import { OfflineWorkspaceSchema } from '@corelive/desktop-contract/offline-workspace'
import { UserSettingsStateSchema } from '@corelive/desktop-contract/settings'

import { AtomicWorkspaceFile } from '../electron/offline/AtomicWorkspaceFile'
import { WorkspaceService } from '../electron/offline/WorkspaceService'
import { WorkspaceWorkerClient } from '../electron/offline/WorkspaceWorkerClient'

/** Summarizes fixed repeated samples without treating fixture sizes as product limits.
 * @example summarize([1, 3, 2])
 */
function summarize(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  }
}

/** Measures real filesystem durability costs in an isolated synthetic workspace.
 * Run from the repository with the pinned runtime; no real profile or credentials are read.
 * @example pnpm --filter @corelive/desktop exec tsx scripts/benchmark-offline-workspace.ts
 */
async function main(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'corelive-storage-benchmark-'))
  const results = []
  try {
    for (const pendingIdentities of [0, 1, 100, 1000, 10000]) {
      const ownerId = `fixture-${pendingIdentities}`
      const notes = Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [
          String(index + 1),
          `Category ${index + 1}\n${'Synthetic writing only.\n'.repeat(100)}`,
        ]),
      )
      const file = new AtomicWorkspaceFile({
        directory,
        ownerId,
        parse: OfflineWorkspaceSchema.parse,
      })
      const service = new WorkspaceService(file)
      let workspace = await service.prepare({
        ownerId,
        deviceId: randomUUID(),
        categories: Array.from({ length: 20 }, (_, index) => ({
          id: index + 1,
          name: `Category ${index + 1}`,
          color: 'blue',
          isDefault: index === 0,
          parentId: null,
          removed: false,
        })),
        preferences: {
          revision: 0,
          theme: 'warm-cathedral-light',
          settings: UserSettingsStateSchema.parse({}),
        },
        legacyNotes: notes,
      })
      const seeded = structuredClone(workspace)
      for (let index = 0; index < pendingIdentities; index++) {
        const id = randomUUID()
        const operationId = randomUUID()
        const title = `Recorded synthetic work ${index}`
        const completedAt = Date.now()
        seeded.completions[id] = {
          id,
          categoryId: (index % 20) + 1,
          originalCategoryId: (index % 20) + 1,
          title,
          rawText: title,
          lineId: randomUUID(),
          lineIndex: 0,
          completedAt,
          originalCompletedAt: completedAt,
          timezone: 'Asia/Tokyo',
          revision: 1,
          undoUntil: completedAt + 5000,
          cancelled: false,
          restored: false,
          remote: null,
          clearAfter: null,
          cleared: false,
        }
        seeded.outbox[operationId] = {
          state: 'queued',
          operation: {
            operationId,
            completionId: id,
            deviceId: seeded.deviceId,
            revision: 1,
            expectedRemoteRevision: 0,
            kind: 'create',
            categoryId: (index % 20) + 1,
            title,
            completedAt,
            originalCompletedAt: completedAt,
            timezone: 'Asia/Tokyo',
          },
        }
        seeded.commandReceipts[randomUUID()] = {
          digest: 'f'.repeat(64),
          completionId: id,
          revision: index + 1,
        }
      }
      workspace = await file.update(() => seeded)
      const coldStart = performance.now()
      await new AtomicWorkspaceFile({
        directory,
        ownerId,
        parse: OfflineWorkspaceSchema.parse,
      }).read()
      const firstReopenMs = performance.now() - coldStart
      const acknowledgements: number[] = []
      const serialization: number[] = []
      const legacyPrimitive: number[] = []
      const loopDelay = monitorEventLoopDelay({ resolution: 1 })
      loopDelay.enable()
      const heapBefore = process.memoryUsage().heapUsed
      for (let sample = 0; sample < 23; sample++) {
        // Alternate the old note-only write/rename primitive and the new durable workspace.
        const oldStart = performance.now()
        writeFileSync(
          join(directory, 'legacy.tmp'),
          JSON.stringify({ liveEditor: { notes } }),
          'utf8',
        )
        renameSync(
          join(directory, 'legacy.tmp'),
          join(directory, 'legacy.json'),
        )
        const oldMs = performance.now() - oldStart
        const stringifyStart = performance.now()
        JSON.stringify(workspace)
        const stringifyMs = performance.now() - stringifyStart
        const start = performance.now()
        const currentDraft = workspace.drafts['1']!
        workspace = await service.execute({
          type: 'save',
          commandId: randomUUID(),
          categoryId: 1,
          baseRevision: currentDraft.revision,
          rows: currentDraft.rows.map((row, index) =>
            index === 0 ? { ...row, text: `Edit ${sample}` } : row,
          ),
        })
        const ackMs = performance.now() - start
        // Discard three warmup samples; all retained samples include both generation flushes.
        if (sample >= 3) {
          acknowledgements.push(ackMs)
          serialization.push(stringifyMs)
          legacyPrimitive.push(oldMs)
        }
      }
      loopDelay.disable()
      const worker = new WorkspaceWorkerClient({
        script: new URL(
          '../electron/offline/workspace-worker.ts',
          import.meta.url,
        ),
        directory,
        ownerId,
        execArgv: ['--import', 'tsx'],
      })
      const workerAcknowledgements: number[] = []
      const workerHostLoopDelay = monitorEventLoopDelay({ resolution: 1 })
      workerHostLoopDelay.enable()
      try {
        let view = await worker.call('open', null)
        for (let sample = 0; sample < 23; sample++) {
          const start = performance.now()
          view = await worker.call('command', {
            type: 'save',
            commandId: randomUUID(),
            categoryId: 1,
            baseRevision: view.draft.revision,
            rows: view.draft.rows.map((row, index) =>
              index === 0 ? { ...row, text: `Worker edit ${sample}` } : row,
            ),
          })
          if (sample >= 3)
            workerAcknowledgements.push(performance.now() - start)
        }
      } finally {
        workerHostLoopDelay.disable()
        await worker.close()
      }
      results.push({
        pendingIdentities,
        categories: 20,
        retainedUndoReferences: pendingIdentities,
        moveReferences: 0,
        payloadBytes: Buffer.byteLength(JSON.stringify(workspace)),
        draftBytes: Buffer.byteLength(JSON.stringify(workspace.drafts)),
        snapshotFileBytes: (await stat(file.path)).size,
        firstReopenMs,
        warmSamples: 20,
        acknowledgementMs: summarize(acknowledgements),
        workerAcknowledgementMs: summarize(workerAcknowledgements),
        workerHostEventLoopDelayMs: {
          p95: workerHostLoopDelay.percentile(95) / 1e6,
          max: workerHostLoopDelay.max / 1e6,
        },
        stringifyMs: summarize(serialization),
        legacyNoteWriteRenameMs: summarize(legacyPrimitive),
        mainEventLoopDelayMs: {
          p95: loopDelay.percentile(95) / 1e6,
          max: loopDelay.max / 1e6,
        },
        heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
      })
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          node: process.version,
          platform: platform(),
          osRelease: release(),
          cpu: cpus()[0]?.model,
          storage:
            'real temporary directory on the host filesystem; synthetic data only',
          caveats: [
            'first reopen is not an OS cache flush',
            'legacy baseline has no fsync and writes only notes; not equivalent durability',
            'actual domain schema and command path measured both inline and in the storage worker; renderer input latency still requires the bundled renderer integration benchmark',
            'Undo metadata remains retained throughout the benchmark; its deadline may expire during timing',
            'fixture sizes are measurements, not a data-loss cap or capacity SLA',
          ],
          results,
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    // Delete only this invocation's synthetic temporary directory.
    await rm(directory, { recursive: true })
  }
}

await main()
