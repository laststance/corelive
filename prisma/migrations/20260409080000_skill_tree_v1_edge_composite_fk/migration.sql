-- Skill Tree V1: enforce both NodeEdge endpoints belong to the same SkillTree.
--
-- Before this migration, NodeEdge.fromNodeId and NodeEdge.toNodeId each had
-- independent single-column FKs to SkillNode.id. Nothing at the DB level
-- prevented inserting an edge whose two endpoints lived in different skill
-- trees — a corruption path the type system and application code couldn't
-- catch on their own.
--
-- The fix is a composite FK: swap the two single-column FKs for
-- (skillTreeId, fromNodeId) → SkillNode(skillTreeId, id), same for toNodeId.
-- This requires a new @@unique([skillTreeId, id]) on SkillNode as the FK
-- target. Since `id` is already the primary key, every (skillTreeId, id)
-- pair is trivially unique — the new constraint can't conflict with any
-- existing rows.
--
-- Referential actions: NO ACTION on both composite FKs because Prisma
-- forbids overlapping Cascade paths on a shared scalar field (skillTreeId).
-- End-to-end cascade still works via the existing NodeEdge.skillTreeId →
-- SkillTree(id) ON DELETE CASCADE constraint — deleting a SkillTree still
-- wipes its edges directly. The only behavior change: you can no longer
-- delete a SkillNode individually without first removing edges that
-- reference it, which we never do in normal operation.

-- DropForeignKey
ALTER TABLE "NodeEdge" DROP CONSTRAINT "NodeEdge_fromNodeId_fkey";

-- DropForeignKey
ALTER TABLE "NodeEdge" DROP CONSTRAINT "NodeEdge_toNodeId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "SkillNode_skillTreeId_id_key" ON "SkillNode"("skillTreeId", "id");

-- AddForeignKey
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_fromNodeId_fkey" FOREIGN KEY ("skillTreeId", "fromNodeId") REFERENCES "SkillNode"("skillTreeId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "NodeEdge" ADD CONSTRAINT "NodeEdge_skillTreeId_toNodeId_fkey" FOREIGN KEY ("skillTreeId", "toNodeId") REFERENCES "SkillNode"("skillTreeId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
