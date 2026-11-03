import { createHash } from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { syncReceiptTable } from '@/db/schema'
import type { runTransaction } from '@/db/transaction'

type Transaction = Parameters<Parameters<typeof runTransaction>[0]>[0]

/**
 * Digest of the exact wire operation; a retry that re-sends identical bytes matches (EA3).
 *
 * Shared by the completion and category sync procedures so both stamp receipts the same way.
 *
 * @param operation - Zod-parsed wire operation (key order follows the schema, so it is stable).
 * @returns Hex SHA-256 stored in the receipt row.
 * @example digestOperation(operation) // => 'a3f1…'
 */
export function digestOperation(operation: unknown): string {
  return createHash('sha256').update(JSON.stringify(operation)).digest('hex')
}

/**
 * Reads the stored receipt for one operation inside the owner-locked transaction.
 *
 * @param tx - Transaction that owns the account lock.
 * @param userId - Owner account.
 * @param operationId - The operation identity chosen by the desktop.
 * @returns The receipt row, or undefined when the operation was never applied.
 * @example const receipt = await findStoredReceipt(tx, user.id, operation.operationId)
 */
export async function findStoredReceipt(
  tx: Transaction,
  userId: number,
  operationId: string,
) {
  const [receipt] = await tx
    .select()
    .from(syncReceiptTable)
    .where(
      and(
        eq(syncReceiptTable.userId, userId),
        eq(syncReceiptTable.operationId, operationId),
      ),
    )
    .limit(1)
  return receipt
}

/**
 * Resolves uncertain deliveries from stored receipts without mutating anything (EA4).
 *
 * @param userId - Owner account.
 * @param operationIds - Operation identities to look up.
 * @param read - Parses one stored outcome; return null to drop receipts of another kind.
 * @returns The receipts found, in storage order, as parsed by `read`.
 * @example const receipts = await readStoredReceipts(user.id, ids, readCompletionOutcome)
 */
export async function readStoredReceipts<Receipt>(
  userId: number,
  operationIds: string[],
  read: (storedOutcome: unknown) => Receipt | null,
): Promise<Receipt[]> {
  const rows = await db
    .select({ outcome: syncReceiptTable.outcome })
    .from(syncReceiptTable)
    .where(
      and(
        eq(syncReceiptTable.userId, userId),
        inArray(syncReceiptTable.operationId, operationIds),
      ),
    )
  return rows.flatMap((row) => {
    const receipt = read(row.outcome)
    return receipt ? [receipt] : []
  })
}
