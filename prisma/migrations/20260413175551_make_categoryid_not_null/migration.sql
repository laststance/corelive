/*
  Warnings:

  - Made the column `categoryId` on table `Completed` required. This step will fail if there are existing NULL values in that column.
  - Made the column `categoryId` on table `Todo` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Completed" DROP CONSTRAINT "Completed_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_categoryId_fkey";

-- Backfill: Assign any remaining NULL categoryId rows to their user's default category
UPDATE "Todo" t
SET "categoryId" = c.id
FROM "Category" c
WHERE t."categoryId" IS NULL
  AND c."userId" = t."userId"
  AND c."isDefault" = true;

UPDATE "Completed" comp
SET "categoryId" = c.id
FROM "Category" c
WHERE comp."categoryId" IS NULL
  AND c."userId" = comp."userId"
  AND c."isDefault" = true;

-- Guard: abort if any user with NULL categoryId has no default category
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT "userId" FROM "Todo" WHERE "categoryId" IS NULL
      UNION
      SELECT DISTINCT "userId" FROM "Completed" WHERE "categoryId" IS NULL
    ) u
    WHERE NOT EXISTS (
      SELECT 1
      FROM "Category" c
      WHERE c."userId" = u."userId"
        AND c."isDefault" = true
    )
  ) THEN
    RAISE EXCEPTION 'Cannot set categoryId NOT NULL: some users have NULL categoryId but no default category';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Completed" ALTER COLUMN "categoryId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Todo" ALTER COLUMN "categoryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Completed" ADD CONSTRAINT "Completed_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
