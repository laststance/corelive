import { ORPCError } from '@orpc/server'
import type { Prisma } from '@prisma/client'

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
 * Shared Prisma `include` for `getMyTree` reads and the post-import re-fetch.
 *
 * Explicit `orderBy: { id: 'asc' }` on every relation keeps SVG DOM order and
 * keyboard focus order deterministic across environments. Without it, Postgres
 * is free to hand back rows in any order (typically insertion order, but not
 * guaranteed), which makes the tab-through experience drift between dev and
 * CI and causes intermittent E2E failures that key off positional selectors.
 *
 * The assignment `where` filter surfaces orphaned rows (`todoId = null`) as
 * well as assignments whose source todo is still completed — orphans are the
 * frozen XP receipts left behind when a user deletes a completed task.
 */
const skillTreeInclude = {
  nodes: {
    orderBy: { id: 'asc' },
    include: {
      assignments: {
        where: {
          OR: [{ todoId: null }, { todo: { completed: true } }],
        },
        orderBy: { id: 'asc' },
      },
    },
  },
  edges: {
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SkillTreeInclude

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

    // Re-fetch the full tree with relations for the response. Reuses the
    // shared include with deterministic orderBy so the caller sees the same
    // ordering it will see on subsequent reads.
    const fullTree = await tx.skillTree.findUniqueOrThrow({
      where: { id: tree.id },
      include: skillTreeInclude,
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
        include: skillTreeInclude,
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
              include: skillTreeInclude,
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
      // create (TOCTOU). P2002 = unique violation on `@@unique([todoId])`,
      // which can happen when two concurrent `assignTask` calls both pass
      // `assertOwnership`, both run `deleteMany`, and then the loser races
      // past the deleted row into `create`. Translate all three to NOT_FOUND
      // so the client converges on a single consistent final assignment
      // instead of surfacing a 500 for the loser of a harmless race.
      if (error instanceof Error && 'code' in error) {
        const code = (error as { code?: string }).code
        if (code === 'P2002' || code === 'P2003' || code === 'P2025') {
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
 * Only targets live (non-orphaned) assignments: orphaned rows (`todoId = null`
 * left behind when a completed todo is deleted) are intentionally frozen XP
 * receipts and are unreachable through this mutation by design — the
 * `AssignTaskInputSchema` requires a positive integer `todoId`, and the
 * schema's `@@unique([todoId])` means `todoId` identifies at most one row.
 *
 * Verifies the found row's `nodeId` matches `input.nodeId` so the API is
 * honest about what it targets: a caller that passes a wrong `nodeId` gets
 * `null` back instead of silently unassigning whatever row happens to hold
 * the todo. `assertOwnership` still guards against cross-user abuse.
 *
 * @param input.nodeId - Node ID the caller believes holds the assignment.
 * @param input.todoId - Todo ID to unassign.
 * @returns The deleted NodeAssignment row, or `null` when no matching
 *   assignment exists (already unassigned, nodeId mismatch, or the row was
 *   removed by a concurrent call).
 */
export const unassignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(NodeAssignmentSchema.nullable())
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId, {
      requireCompleted: false,
    })
    try {
      // Verify the assignment actually belongs to the node the caller named.
      // `todoId` is globally unique (`@@unique([todoId])`), so this is a
      // single-row lookup. If the row exists but points at a different
      // node, return null — the caller's mental model is out of sync and
      // `onSettled` query invalidation will rebase their optimistic state.
      const existing = await prisma.nodeAssignment.findUnique({
        where: { todoId: input.todoId },
      })
      if (!existing || existing.nodeId !== input.nodeId) {
        return null
      }
      return await prisma.nodeAssignment.delete({
        where: { todoId: input.todoId },
      })
    } catch (error) {
      // P2025 = record not found. A concurrent unassign call won the race —
      // already-gone is OK, return null so the client can reconcile.
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
