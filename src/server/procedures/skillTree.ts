import { ORPCError } from '@orpc/server'

import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '@/app/(main)/skill-tree/lib/template'
import { createModuleLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

import { authMiddleware } from '../middleware/auth'
import {
  AssignTaskInputSchema,
  NodeAssignmentSchema,
  SkillTreeSchema,
  UnassignedPoolSchema,
} from '../schemas/skillTree'

const log = createModuleLogger('skillTree')

/**
 * Imports the default template as a new SkillTree for a user. Uses batched
 * `createMany` for nodes and edges so a 28-node / 32-edge template completes
 * in 4 round-trips instead of ~54. This keeps the transaction well under the
 * 5s Prisma interactive-transaction default timeout.
 *
 * @param userId - The user's Prisma ID (not Clerk ID).
 * @returns The newly created tree with nodes, edges, and empty assignment arrays.
 */
async function importDefaultTemplate(userId: number) {
  return prisma.$transaction(async (tx) => {
    const tree = await tx.skillTree.create({
      data: {
        userId,
        name: BACKEND_DEVELOPER_CORE_TEMPLATE.name,
        templateKey: BACKEND_DEVELOPER_CORE_TEMPLATE.key,
      },
    })

    // Batch insert all nodes in one round-trip.
    await tx.skillNode.createMany({
      data: BACKEND_DEVELOPER_CORE_TEMPLATE.nodes.map((node) => ({
        skillTreeId: tree.id,
        name: node.name,
        icon: node.icon,
        x: node.x,
        y: node.y,
      })),
    })

    // Re-read to resolve slug → node ID. `createMany` doesn't return IDs, and
    // template edges reference nodes by slug. We look the newly-inserted nodes
    // up by name (which is unique-by-construction within a single template).
    const createdNodes = await tx.skillNode.findMany({
      where: { skillTreeId: tree.id },
      select: { id: true, name: true },
    })
    const nameToId = new Map(createdNodes.map((n) => [n.name, n.id]))
    const slugToId = new Map<string, number>()
    for (const tplNode of BACKEND_DEVELOPER_CORE_TEMPLATE.nodes) {
      const id = nameToId.get(tplNode.name)
      if (id === undefined) {
        throw new Error(
          `Template node "${tplNode.name}" missing after createMany`,
        )
      }
      slugToId.set(tplNode.slug, id)
    }

    // Batch insert all edges in one round-trip.
    const edgeRows = BACKEND_DEVELOPER_CORE_TEMPLATE.edges.map(
      ([fromSlug, toSlug]) => {
        const fromNodeId = slugToId.get(fromSlug)
        const toNodeId = slugToId.get(toSlug)
        if (fromNodeId === undefined || toNodeId === undefined) {
          throw new Error(
            `Template edge references unknown slug: ${fromSlug} → ${toSlug}`,
          )
        }
        return { skillTreeId: tree.id, fromNodeId, toNodeId }
      },
    )
    if (edgeRows.length > 0) {
      await tx.nodeEdge.createMany({ data: edgeRows })
    }

    // Re-fetch the full tree with relations for the response
    const fullTree = await tx.skillTree.findUniqueOrThrow({
      where: { id: tree.id },
      include: {
        nodes: {
          include: {
            assignments: {
              // Only surface assignments whose source todo is still completed.
              // Orphaned rows (todoId = null) are also returned so earned XP
              // persists after the source todo is cleared/deleted.
              where: {
                OR: [{ todoId: null }, { todo: { completed: true } }],
              },
            },
          },
        },
        edges: true,
      },
    })
    return fullTree
  })
}

/**
 * Ensures the given nodeId and todoId both belong to the user, and (when
 * required) that the todo is completed. Throws `NOT_FOUND` for missing rows
 * — matches the error shape used by todo.ts / category.ts so clients can
 * consistently handle missing-resource cases.
 *
 * @param userId - The user's Prisma ID (not Clerk ID).
 * @param nodeId - Skill node ID to verify ownership of.
 * @param todoId - Todo ID to verify ownership of.
 * @param requireCompleted - When true (default for assignTask), reject
 *   incomplete todos. XP must only be granted for completed work.
 */
async function assertOwnership(
  userId: number,
  nodeId: number,
  todoId: number,
  { requireCompleted }: { requireCompleted: boolean },
) {
  const [node, todo] = await Promise.all([
    prisma.skillNode.findFirst({
      where: { id: nodeId, skillTree: { userId } },
      select: { id: true },
    }),
    prisma.todo.findFirst({
      where: {
        id: todoId,
        userId,
        ...(requireCompleted ? { completed: true } : {}),
      },
      select: { id: true, text: true, completed: true },
    }),
  ])
  if (!node) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Skill node not found',
    })
  }
  if (!todo) {
    throw new ORPCError('NOT_FOUND', {
      message: requireCompleted ? 'Completed todo not found' : 'Todo not found',
    })
  }
  return { todo }
}

/**
 * Fetches the user's skill tree. On first visit, imports the default template.
 * If a concurrent request already created the tree (P2002 unique violation
 * on the `@@unique([userId])` constraint), re-query and return the winner.
 *
 * @returns The tree with nested nodes (+ assignments) and edges.
 */
export const getMyTree = authMiddleware
  .output(SkillTreeSchema)
  .handler(async ({ context }) => {
    try {
      let tree = await prisma.skillTree.findUnique({
        where: { userId: context.user.id },
        include: {
          nodes: {
            include: {
              assignments: {
                where: {
                  OR: [{ todoId: null }, { todo: { completed: true } }],
                },
              },
            },
          },
          edges: true,
        },
      })
      if (!tree) {
        try {
          tree = await importDefaultTemplate(context.user.id)
        } catch (error) {
          // P2002 = unique-constraint violation. A concurrent request already
          // imported the template. Re-query for the winning tree and return
          // that — the user never sees the race.
          if (
            error instanceof Error &&
            'code' in error &&
            (error as { code?: string }).code === 'P2002'
          ) {
            const winner = await prisma.skillTree.findUnique({
              where: { userId: context.user.id },
              include: {
                nodes: {
                  include: {
                    assignments: {
                      where: {
                        OR: [{ todoId: null }, { todo: { completed: true } }],
                      },
                    },
                  },
                },
                edges: true,
              },
            })
            if (!winner) throw error
            tree = winner
          } else {
            throw error
          }
        }
      }
      return tree
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in getMyTree')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch skill tree',
        cause: error,
      })
    }
  })

/**
 * Lists completed Todos the user has not yet assigned to any skill node.
 * Returns a narrow `{id, text}` shape — the skill tree UI doesn't need the
 * rest of the Todo (notes, categoryId, userId, timestamps) and dragging those
 * fields into the localStorage cache leaks PII across skill-tree sessions.
 *
 * @returns Array of unassigned completed Todos, newest first.
 */
export const getUnassignedPool = authMiddleware
  .output(UnassignedPoolSchema)
  .handler(async ({ context }) => {
    try {
      return await prisma.todo.findMany({
        where: {
          userId: context.user.id,
          completed: true,
          assignments: { none: {} },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, text: true },
      })
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in getUnassignedPool')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to fetch unassigned pool',
        cause: error,
      })
    }
  })

/**
 * Assigns a completed Todo to a skill node. If the todo is already assigned
 * to another node, the assignment is moved (delete-then-create inside a
 * transaction). Enforces:
 *   - The todo is completed (prevents XP inflation via "complete → assign →
 *     uncomplete → recomplete" loop).
 *   - One assignment per todo globally (`@@unique([todoId])`).
 *
 * @param input.nodeId - Target skill node ID.
 * @param input.todoId - Completed Todo ID to assign.
 * @returns The new NodeAssignment row (with snapshot text).
 */
export const assignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(NodeAssignmentSchema)
  .handler(async ({ input, context }) => {
    const { todo } = await assertOwnership(
      context.user.id,
      input.nodeId,
      input.todoId,
      { requireCompleted: true },
    )

    try {
      return await prisma.$transaction(async (tx) => {
        // Delete any existing assignment for this todo (supports move between
        // nodes). The @@unique([todoId]) constraint would otherwise reject
        // the create.
        await tx.nodeAssignment.deleteMany({
          where: { todoId: input.todoId },
        })
        return tx.nodeAssignment.create({
          data: {
            nodeId: input.nodeId,
            todoId: input.todoId,
            todoText: todo.text,
          },
        })
      })
    } catch (error) {
      if (error instanceof ORPCError) throw error
      // P2003 = FK violation, P2025 = record not found. Both can happen if
      // the todo is deleted between assertOwnership and the transaction
      // create (TOCTOU). Translate to NOT_FOUND so clients see a consistent
      // "missing resource" shape instead of a generic 500.
      if (error instanceof Error && 'code' in error) {
        const code = (error as { code?: string }).code
        if (code === 'P2003' || code === 'P2025') {
          throw new ORPCError('NOT_FOUND', {
            message: 'Todo no longer exists',
          })
        }
      }
      log.error({ error }, 'Error in assignTask')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to assign task',
        cause: error,
      })
    }
  })

/**
 * Removes the assignment of a Todo from a skill node.
 *
 * @param input.nodeId - Node ID to unassign from.
 * @param input.todoId - Todo ID to unassign.
 * @returns The deleted NodeAssignment row (for optimistic rollback).
 */
export const unassignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(NodeAssignmentSchema.nullable())
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId, {
      requireCompleted: false,
    })
    try {
      return await prisma.nodeAssignment.delete({
        where: {
          // The unique key is now just todoId, not the (nodeId, todoId) pair.
          todoId: input.todoId,
        },
      })
    } catch (error) {
      // P2025 = record not found. Already unassigned is OK — return null so
      // the client can reconcile optimistic state.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2025'
      ) {
        return null
      }
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in unassignTask')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to unassign task',
        cause: error,
      })
    }
  })
