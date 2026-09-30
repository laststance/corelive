// Relative imports on purpose: the tsx-run dev seed imports this file, and tsx does not reliably honor `@/`. The schema import is type-only so this file never loads drizzle at runtime.
import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '../app/(main)/skill-tree/lib/template'
import type { skillNodeTable } from '../db/schema'

/** Builds the same default node rows for first-use import and development seeding.
 * @param skillTreeId - The newly created tree owning the nodes.
 * @returns Node rows for a bulk insert.
 * @example buildDefaultSkillNodes(1)
 */
export function buildDefaultSkillNodes(
  skillTreeId: number,
): (typeof skillNodeTable.$inferInsert)[] {
  return BACKEND_DEVELOPER_CORE_TEMPLATE.nodes.map(({ name, icon, x, y }) => ({
    skillTreeId,
    name,
    icon,
    x,
    y,
  }))
}
