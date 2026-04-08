import { ORPCError } from '@orpc/server'
import { z } from 'zod'

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
 * Imports the default template as a new SkillTree for a user.
 * Runs inside a transaction so partial failures don't leave orphan nodes.
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

    // Create nodes and collect slug → id mapping for edge resolution
    const slugToId = new Map<string, number>()
    for (const node of BACKEND_DEVELOPER_CORE_TEMPLATE.nodes) {
      const created = await tx.skillNode.create({
        data: {
          skillTreeId: tree.id,
          name: node.name,
          icon: node.icon,
          x: node.x,
          y: node.y,
        },
      })
      slugToId.set(node.slug, created.id)
    }

    // Create edges, resolving slug references
    for (const [fromSlug, toSlug] of BACKEND_DEVELOPER_CORE_TEMPLATE.edges) {
      const fromNodeId = slugToId.get(fromSlug)
      const toNodeId = slugToId.get(toSlug)
      if (fromNodeId === undefined || toNodeId === undefined) {
        throw new Error(
          `Template edge references unknown slug: ${fromSlug} → ${toSlug}`,
        )
      }
      await tx.nodeEdge.create({
        data: { skillTreeId: tree.id, fromNodeId, toNodeId },
      })
    }

    // Re-fetch the full tree with relations for the response
    const fullTree = await tx.skillTree.findUniqueOrThrow({
      where: { id: tree.id },
      include: {
        nodes: { include: { assignments: true } },
        edges: true,
      },
    })
    return fullTree
  })
}

/**
 * Ensures the given nodeId and todoId both belong to the user.
 * Throws ORPCError('FORBIDDEN') if either does not.
 * @param userId - The user's Prisma ID (not Clerk ID).
 * @param nodeId - Skill node ID to verify ownership of.
 * @param todoId - Todo ID to verify ownership of.
 * @example
 * await assertOwnership(user.id, 5, 12)
 */
async function assertOwnership(userId: number, nodeId: number, todoId: number) {
  const [node, todo] = await Promise.all([
    prisma.skillNode.findFirst({
      where: { id: nodeId, skillTree: { userId } },
      select: { id: true },
    }),
    prisma.todo.findFirst({
      where: { id: todoId, userId },
      select: { id: true },
    }),
  ])
  if (!node) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Skill node not found or not owned by user',
    })
  }
  if (!todo) {
    throw new ORPCError('FORBIDDEN', {
      message: 'Todo not found or not owned by user',
    })
  }
}

/**
 * Fetches the user's skill tree. On first visit, imports the default template.
 * @returns The tree with nested nodes (+ assignments) and edges.
 */
export const getMyTree = authMiddleware
  .output(SkillTreeSchema)
  .handler(async ({ context }) => {
    try {
      let tree = await prisma.skillTree.findFirst({
        where: { userId: context.user.id },
        include: {
          nodes: { include: { assignments: true } },
          edges: true,
        },
      })
      if (!tree) {
        tree = await importDefaultTemplate(context.user.id)
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
 * Assigns a completed Todo to a skill node. Idempotent via upsert.
 * @param input.nodeId - Target skill node ID.
 * @param input.todoId - Completed Todo ID to assign.
 */
export const assignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(NodeAssignmentSchema)
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    return prisma.nodeAssignment.upsert({
      where: {
        nodeId_todoId: { nodeId: input.nodeId, todoId: input.todoId },
      },
      create: input,
      update: {},
    })
  })

/**
 * Removes the assignment of a Todo from a skill node.
 * @param input.nodeId - Node ID to unassign from.
 * @param input.todoId - Todo ID to unassign.
 */
export const unassignTask = authMiddleware
  .input(AssignTaskInputSchema)
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, context }) => {
    await assertOwnership(context.user.id, input.nodeId, input.todoId)
    try {
      await prisma.nodeAssignment.delete({
        where: {
          nodeId_todoId: { nodeId: input.nodeId, todoId: input.todoId },
        },
      })
      return { success: true }
    } catch (error) {
      // P2025 = record not found. Already unassigned is OK.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2025'
      ) {
        return { success: true }
      }
      throw error
    }
  })
