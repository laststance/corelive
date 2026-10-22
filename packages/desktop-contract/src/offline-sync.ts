import { z } from 'zod'

import {
  CompletionSyncOperationSchema,
  CompletionSyncReceiptSchema,
  CountCheckpointSchema,
  EditorCategorySchema,
} from './offline-workspace'

export const SyncApplyInputSchema = z.object({
  operations: z.array(CompletionSyncOperationSchema).min(1).max(100),
})
export const SyncReceiptsInputSchema = z.object({
  operationIds: z.array(z.uuid()).min(1).max(100),
})
export const SyncReceiptsOutputSchema = z.object({
  receipts: z.array(CompletionSyncReceiptSchema),
})
export const SyncBootstrapOutputSchema = z.object({
  accountId: z.string().min(1),
  categories: z.array(EditorCategorySchema),
  deletions: z.array(
    z.object({
      sourceId: z.number().int().positive(),
      destinationId: z.number().int().positive(),
    }),
  ),
})
export const SyncCheckpointInputSchema = z.object({
  day: z.iso.date(),
  timezone: z.string().min(1).max(64),
  completionIds: z.array(z.uuid()).max(2000),
})
export { CountCheckpointSchema as SyncCheckpointOutputSchema }

export type SyncBootstrap = z.infer<typeof SyncBootstrapOutputSchema>
export type SyncCheckpointInput = z.infer<typeof SyncCheckpointInputSchema>
export type SyncReceiptsOutput = z.infer<typeof SyncReceiptsOutputSchema>

/** Credential-bound transport used by main's preparation and background sender. */
export interface CompletionSyncTransport {
  bootstrap: (signal?: AbortSignal) => Promise<SyncBootstrap>
  apply: (
    input: z.infer<typeof SyncApplyInputSchema>,
    signal?: AbortSignal,
  ) => Promise<SyncReceiptsOutput>
  receipts: (
    input: z.infer<typeof SyncReceiptsInputSchema>,
    signal?: AbortSignal,
  ) => Promise<SyncReceiptsOutput>
  checkpoint: (
    input: SyncCheckpointInput,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof CountCheckpointSchema>>
}
