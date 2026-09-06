import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '../app/(main)/skill-tree/lib/template'

/** Builds the same default node rows for first-use import and development seeding.
 * @param skillTreeId - The newly created tree owning the nodes.
 * @returns Node rows for Prisma's bulk insert.
 * @example buildDefaultSkillNodes(1)
 */
export function buildDefaultSkillNodes(skillTreeId: number) {
  return BACKEND_DEVELOPER_CORE_TEMPLATE.nodes.map(({ name, icon, x, y }) => ({
    skillTreeId,
    name,
    icon,
    x,
    y,
  }))
}
