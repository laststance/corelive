import {
  LOCAL_PENDING_MERGE_SCHEMA_VERSION,
  LOCAL_PENDING_MERGE_STORAGE_KEY,
} from './constants'
import { createLocalStorageSlot } from './localStorageSlot'
import { type PendingMerge, pendingMergeSchema } from './schemas'

const slot = createLocalStorageSlot(LOCAL_PENDING_MERGE_STORAGE_KEY)

/**
 * The in-flight merge attempt, if one was started and never confirmed.
 * @returns The persisted `{ batchId, ids }`, or null when nothing is pending.
 * @example
 * readPendingMerge() // => { batchId: '7d0c…', ids: ['5b1c…'] }
 */
export function readPendingMerge(): PendingMerge | null {
  const raw = slot.read()
  if (raw === null || raw === '') return null
  try {
    const parsed = pendingMergeSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The outstanding claim when it belongs to somebody else — a browser where one
 * account started a merge, lost the tab mid-flight, then a DIFFERENT account
 * signed in. Those keeps may already sit in the first account, so the second one
 * must never send them; the caller retires them locally instead.
 * @param clerkId - The account asking, i.e. whoever is signed in now.
 * @returns The foreign claim, or null when the record is ours or absent.
 * @example
 * readForeignPendingMerge('user_b') // => { clerkId: 'user_a', batchId: '7d0c…', … }
 */
export function readForeignPendingMerge(clerkId: string): PendingMerge | null {
  const pending = readPendingMerge()
  if (pending === null || pending.clerkId === clerkId) return null
  return pending
}

/**
 * Claims the batch a merge is about to send, writing it before the request so a
 * tab closed mid-flight can resume with the SAME idempotency key. An existing
 * record of OURS wins over the ids passed in: those are the items the server may
 * already hold, and re-deriving the batch from whatever the store holds now is
 * exactly the bug this record prevents (keeps added between attempts would ride
 * along under a fresh key and double count the originals). A record belonging to
 * another account is never resumed — see {@link readForeignPendingMerge}.
 * @param clerkId - The account the claim is filed under.
 * @param candidateIds - Ids to claim when no attempt of ours is outstanding.
 * @returns The batch to send, or null when there is nothing pending and nothing to claim.
 * @example
 * readOrCreatePendingMerge('user_a', ['5b1c…']) // => { batchId: '7d0c…', ids: ['5b1c…'] }
 */
export function readOrCreatePendingMerge(
  clerkId: string,
  candidateIds: string[],
): PendingMerge | null {
  const pending = readPendingMerge()
  if (pending !== null && pending.clerkId === clerkId) return pending
  if (candidateIds.length === 0) return null

  const claimed: PendingMerge = {
    version: LOCAL_PENDING_MERGE_SCHEMA_VERSION,
    clerkId,
    batchId: createBatchId(),
    ids: candidateIds,
  }
  slot.write(JSON.stringify(claimed))
  return claimed
}

/**
 * Releases the claim once its items are tagged, so the next batch can be built.
 * Writes an empty string rather than removing the key — the slot exposes no
 * delete, and {@link readPendingMerge} reads `''` as "nothing pending".
 * @returns Nothing.
 * @example
 * clearPendingMerge()
 */
export function clearPendingMerge(): void {
  slot.write('')
}

/**
 * Generates the client batch id — a uuid where the platform offers one, else a
 * time + random string (insecure LAN origins have no `crypto.randomUUID`).
 * @returns A non-empty id; the server namespaces it per user before storing.
 * @example
 * createBatchId() // => '7d0c1a2e-…'
 */
function createBatchId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
