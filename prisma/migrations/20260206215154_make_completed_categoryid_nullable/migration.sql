-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_categoryId_fkey";

-- AlterTable
ALTER TABLE "Completed" ALTER COLUMN "categoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
