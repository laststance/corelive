-- Data-only migration: make "General" the single, fixed default category of
-- every account that has a default. No schema change; no Todo/Completed row
-- moves and no category id changes (LiveEditor drafts are keyed by id).
-- Accounts with no default are untouched. Idempotent: a re-run changes nothing.

-- Step 1: pick one target per account — its "General" row when it has one
-- (default or not), otherwise its oldest default — and make it the only default.
WITH target AS (
  SELECT DISTINCT ON (c."userId") c."userId", c.id
  FROM "Category" c
  WHERE (c.name = 'General' OR c."isDefault" = true)
    AND EXISTS (
      SELECT 1 FROM "Category" d
      WHERE d."userId" = c."userId" AND d."isDefault" = true
    )
  ORDER BY c."userId", (c.name = 'General') DESC, c.id ASC
)
UPDATE "Category" c
SET "isDefault" = (c.id = t.id), "updatedAt" = NOW()
FROM target t
WHERE c."userId" = t."userId"
  AND c."isDefault" <> (c.id = t.id);

-- Step 2: a target that is not already "General" belongs to an account with no
-- "General" row (step 1 would have picked it), so the rename cannot collide
-- with the unique (name, userId) index.
UPDATE "Category"
SET name = 'General', "updatedAt" = NOW()
WHERE "isDefault" = true
  AND name <> 'General';
