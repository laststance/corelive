-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Data migration: backfill completedAt for already-completed todos.
-- Best-effort: a todo completed-then-edited gets completedAt = its last
-- updatedAt (the last time the old updatedAt-drift could bite). Incomplete
-- todos keep completedAt = NULL. This mirrors the Completed.completedAt
-- backfill (completedAt = createdAt) so existing rows do not shift heatmap days.
UPDATE "Todo" SET "completedAt" = "updatedAt" WHERE "completed" = true;
