import type { Prisma } from '@prisma/client'

/**
 * Archives a user's completed Todo rows into the Completed table, then deletes
 * the Todo rows — the heatmap-safe replacement for hard-deleting a completed
 * todo. Why: the heatmap counts completed Todo rows directly, so a bare delete
 * silently erases their heatmap days; copying the completion into Completed
 * (which the heatmap also reads) before removal keeps the day. Called by
 * clearCompleted (archive ALL completed) and deleteTodo (archive a single
 * completed todo). Runs inside a caller-supplied transaction so copy+delete is
 * atomic.
 *
 * LOAD-BEARING: every Completed row is written archived:false (field omitted →
 * schema `@default(false)`). fetchCompletedEntries filters `archived:false`, so
 * an `archived:true` row would silently drop from the heatmap and reintroduce
 * the exact erasure bug this helper exists to kill — never write `true`.
 * NodeAssignment is intentionally left to the schema's `onDelete:SetNull` (XP
 * persists via the `todoText` snapshot); do NOT `deleteMany` it (that is
 * toggleTodo's un-complete exploit guard, not a teardown step — copying it here
 * would destroy XP). `importBatchId` stays null so archive rows are unreachable
 * by the paste-import bulk-undo (the only undo-safety layer under Approach B).
 *
 * @param tx - An active Prisma transaction client (from `prisma.$transaction`).
 * @param userId - Internal `User.id` whose completed todos to archive.
 * @param todoIds - Optional id subset to archive; omit to archive ALL completed.
 * @returns The number of todos archived-and-removed (0 when none matched).
 * @example
 * // Clear all completed (Part 0):
 * await prisma.$transaction((tx) => archiveCompletedTodos({ tx, userId: 7 }))
 * @example
 * // Archive one completed todo (per-item delete):
 * await prisma.$transaction((tx) =>
 *   archiveCompletedTodos({ tx, userId: 7, todoIds: [42] }),
 * )
 */
export async function archiveCompletedTodos({
  tx,
  userId,
  todoIds,
}: {
  tx: Prisma.TransactionClient
  userId: number
  todoIds?: number[]
}): Promise<number> {
  // Read the completed todos in scope (always bounded by userId; optionally
  // narrowed to an explicit id subset for the per-item delete path).
  const completedTodos = await tx.todo.findMany({
    where: {
      userId,
      completed: true,
      ...(todoIds !== undefined && { id: { in: todoIds } }),
    },
    select: {
      id: true,
      text: true,
      categoryId: true,
      completedAt: true,
      updatedAt: true,
    },
  })

  // Nothing to archive — skip the writes so callers can report a 0 count.
  if (completedTodos.length === 0) {
    return 0
  }

  // Copy each completion into Completed BEFORE deleting the Todo so the heatmap
  // day survives. completedAt = the stable completion day (`completedAt ??
  // updatedAt` — NOT bare updatedAt, which would drift to the edit date for a
  // completed-then-edited todo). createdAt defaults to now() (honest insert
  // time, undo-safe). archived omitted → `@default(false)` [LOAD-BEARING].
  await tx.completed.createMany({
    data: completedTodos.map((todo) => ({
      userId,
      title: todo.text,
      categoryId: todo.categoryId,
      completedAt: todo.completedAt ?? todo.updatedAt,
    })),
  })

  // Remove the Todo rows. NodeAssignment rows orphan via onDelete:SetNull
  // (todoId → null), preserving earned XP through the todoText snapshot.
  const deleteResult = await tx.todo.deleteMany({
    where: {
      userId,
      id: { in: completedTodos.map((todo) => todo.id) },
    },
  })

  return deleteResult.count
}
