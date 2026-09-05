-- AlterTable
ALTER TABLE "Completed" ADD COLUMN     "localCompletionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Completed_userId_localCompletionId_key" ON "Completed"("userId", "localCompletionId");

