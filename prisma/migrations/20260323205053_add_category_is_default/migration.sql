-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Create "General" default category for all existing users
INSERT INTO "Category" (name, color, "isDefault", "userId", "createdAt", "updatedAt")
SELECT 'General', 'blue', true, u.id, NOW(), NOW()
FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "Category" c WHERE c."userId" = u.id AND c."isDefault" = true
);

-- Backfill: Assign uncategorized TODOs to their user's General category
UPDATE "Todo" t
SET "categoryId" = c.id
FROM "Category" c
WHERE t."categoryId" IS NULL
  AND c."userId" = t."userId"
  AND c."isDefault" = true;

-- Backfill: Assign uncategorized Completed items to their user's General category
UPDATE "Completed" comp
SET "categoryId" = c.id
FROM "Category" c
WHERE comp."categoryId" IS NULL
  AND c."userId" = comp."userId"
  AND c."isDefault" = true;
