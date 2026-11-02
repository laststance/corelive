ALTER TABLE "ImportBatch" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ImportBatch" CASCADE;--> statement-breakpoint
DROP INDEX "Completed_importBatchId_idx";--> statement-breakpoint
DROP INDEX "Todo_importBatchId_idx";--> statement-breakpoint
ALTER TABLE "Completed" DROP COLUMN "importBatchId";--> statement-breakpoint
ALTER TABLE "Todo" DROP COLUMN "importBatchId";