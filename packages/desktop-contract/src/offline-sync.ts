import { z } from 'zod'

import type { CategorySyncApplyInputSchema } from './category-sync'
import { CategorySyncApplyOutputSchema } from './category-sync'
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

/** EA2: the token's verified account, returned by the authenticated `account.whoami` procedure. */
export const AccountWhoamiOutputSchema = z.object({
  clerkId: z.string().min(1),
  /** The account's primary email as the server knows it; null when it has none yet. */
  email: z.string().nullable(),
})
export type AccountWhoami = z.infer<typeof AccountWhoamiOutputSchema>

export type SyncCategoryApplyInput = z.infer<
  typeof CategorySyncApplyInputSchema
>
export type SyncCategoryApplyOutput = z.infer<
  typeof CategorySyncApplyOutputSchema
>
export { CategorySyncApplyOutputSchema as SyncCategoryOutputSchema }

export type SyncBootstrap = z.infer<typeof SyncBootstrapOutputSchema>
export type SyncCheckpointInput = z.infer<typeof SyncCheckpointInputSchema>
export type SyncReceiptsOutput = z.infer<typeof SyncReceiptsOutputSchema>

/** Credential-bound transport used by main's identity check and background sender. */
export interface CompletionSyncTransport {
  whoami: (signal?: AbortSignal) => Promise<AccountWhoami>
  bootstrap: (signal?: AbortSignal) => Promise<SyncBootstrap>
  apply: (
    input: z.infer<typeof SyncApplyInputSchema>,
    signal?: AbortSignal,
  ) => Promise<SyncReceiptsOutput>
  receipts: (
    input: z.infer<typeof SyncReceiptsInputSchema>,
    signal?: AbortSignal,
  ) => Promise<SyncReceiptsOutput>
  /** `category.syncApply`: category batches go before completion batches (D4). */
  categoryApply: (
    input: SyncCategoryApplyInput,
    signal?: AbortSignal,
  ) => Promise<SyncCategoryApplyOutput>
  /** `category.syncReceipts`: recovers uncertain category operations (EA4). */
  categoryReceipts: (
    input: z.infer<typeof SyncReceiptsInputSchema>,
    signal?: AbortSignal,
  ) => Promise<SyncCategoryApplyOutput>
  checkpoint: (
    input: SyncCheckpointInput,
    signal?: AbortSignal,
  ) => Promise<z.infer<typeof CountCheckpointSchema>>
}
