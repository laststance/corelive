-- Skill Tree V1 hardening.
-- Fixes from /review: C1 (multi-node XP exploit), C3 (CASCADE wipes XP on
-- clearCompleted), C4 (concurrent template import creates duplicate trees),
-- C5 (SkillNode.updatedAt missing DEFAULT).

-- 1. SkillTree: one tree per user. Prevents duplicate-tree race on concurrent
--    first-load. The old @@index([userId]) is now redundant — UNIQUE creates
--    its own btree.
DROP INDEX IF EXISTS "SkillTree_userId_idx";
CREATE UNIQUE INDEX "SkillTree_userId_key" ON "SkillTree"("userId");

-- 2. SkillNode.updatedAt: backfill a default so future migrations that need to
--    add NOT NULL columns don't trip over the "no default on non-empty table"
--    footgun. The original migration added this column without a default; any
--    row created before that migration would have NULL, but SkillNode was
--    empty at migration time so no backfill is needed now.
ALTER TABLE "SkillNode" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- 3. NodeAssignment: drop the composite unique (now redundant) and the regular
--    todoId index (replaced by the new UNIQUE below).
DROP INDEX IF EXISTS "NodeAssignment_nodeId_todoId_key";
DROP INDEX IF EXISTS "NodeAssignment_todoId_idx";

-- 4. NodeAssignment.todoId: nullable + SET NULL on Todo delete. When the user
--    clearCompleted()s their todo list, the assignment row survives with
--    todoId = NULL, and the popover still reads the snapshot from todoText.
ALTER TABLE "NodeAssignment" DROP CONSTRAINT "NodeAssignment_todoId_fkey";
ALTER TABLE "NodeAssignment" ALTER COLUMN "todoId" DROP NOT NULL;
ALTER TABLE "NodeAssignment" ADD CONSTRAINT "NodeAssignment_todoId_fkey"
    FOREIGN KEY ("todoId") REFERENCES "Todo"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. NodeAssignment.todoText: snapshot the Todo text at assignment time so
--    the read path has something to show after the source Todo is gone.
--    Default '' is only used if a row is inserted without an explicit value;
--    application code (assignTask) always provides a real value.
ALTER TABLE "NodeAssignment" ADD COLUMN "todoText" VARCHAR(255) NOT NULL DEFAULT '';

-- 6. NodeAssignment: one assignment per todo, ever. Prevents the multi-node
--    XP exploit (same todoId across multiple nodes). PostgreSQL treats NULLs
--    as distinct in UNIQUE constraints, so multiple orphaned rows (todoId
--    NULL) coexist just fine.
CREATE UNIQUE INDEX "NodeAssignment_todoId_key" ON "NodeAssignment"("todoId");
