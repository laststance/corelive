-- AlterTable
ALTER TABLE "Completed" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "importBatchId" TEXT;

-- Backfill: stamp existing rows' semantic completion time from their insert
-- time. completedAt is added NULLABLE with NO DB default on purpose — a
-- non-null default would set every historical row to the migration timestamp,
-- jumping all old Completed rows to migration-day on the heatmap. This explicit
-- backfill keeps each historical row on its real day. New rows write completedAt
-- on insert; the heatmap coalesces `completedAt ?? createdAt` defensively.
UPDATE "Completed" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL;

-- AlterTable
ALTER TABLE "Todo" ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_userId_idx" ON "ImportBatch"("userId");

-- CreateIndex
CREATE INDEX "Completed_importBatchId_idx" ON "Completed"("importBatchId");

-- CreateIndex
CREATE INDEX "Todo_importBatchId_idx" ON "Todo"("importBatchId");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
