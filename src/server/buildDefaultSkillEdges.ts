// Relative imports on purpose: the tsx-run dev seed imports this file, and tsx does not reliably honor `@/`. The schema import is type-only so this file never loads drizzle at runtime.
import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '../app/(main)/skill-tree/lib/template'
import type { nodeEdgeTable, skillNodeTable } from '../db/schema'

/** Resolves template edges after node creation for first-use import and development seeding.
 * @param skillTreeId - The newly created tree owning the edges.
 * @param createdNodes - Persisted node IDs and unique template names.
 * @returns Edge rows for a bulk insert; missing template nodes throw.
 * @example buildDefaultSkillEdges(1, createdNodes)
 */
export function buildDefaultSkillEdges(
  skillTreeId: number,
  createdNodes: Pick<typeof skillNodeTable.$inferSelect, 'id' | 'name'>[],
): (typeof nodeEdgeTable.$inferInsert)[] {
  const nameToId = new Map(createdNodes.map(({ name, id }) => [name, id]))
  const slugToId = new Map<string, number>()
  for (const node of BACKEND_DEVELOPER_CORE_TEMPLATE.nodes) {
    const id = nameToId.get(node.name)
    if (id === undefined)
      throw new Error(`Template node "${node.name}" missing after createMany`)
    slugToId.set(node.slug, id)
  }
  return BACKEND_DEVELOPER_CORE_TEMPLATE.edges.map(([fromSlug, toSlug]) => {
    const fromNodeId = slugToId.get(fromSlug)
    const toNodeId = slugToId.get(toSlug)
    if (fromNodeId === undefined || toNodeId === undefined) {
      throw new Error(
        `Template edge references unknown slug: ${fromSlug} → ${toSlug}`,
      )
    }
    return { skillTreeId, fromNodeId, toNodeId }
  })
}
