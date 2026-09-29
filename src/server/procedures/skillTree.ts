import { ORPCError } from '@orpc/server'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  type SQL,
  isNull,
  notExists,
  or,
  sql,
} from 'drizzle-orm'

import { BACKEND_DEVELOPER_CORE_TEMPLATE } from '@/app/(main)/skill-tree/lib/template'
import { db } from '@/db'
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from '@/db/constants'
import { isPgError } from '@/db/isPgError'
import { requireRow } from '@/db/requireRow'
import {
  nodeAssignmentTable,
  nodeEdgeTable,
  skillNodeTable,
  skillTreeTable,
  todoTable,
} from '@/db/schema'
import { runTransaction } from '@/db/transaction'
import { createModuleLogger } from '@/lib/logger'
import { buildDefaultSkillEdges } from '@/server/buildDefaultSkillEdges'
import { buildDefaultSkillNodes } from '@/server/buildDefaultSkillNodes'

import { authMiddleware } from '../middleware/auth'
import {
  AssignTaskInputSchema,
  NodeAssignmentSchema,
  SkillTreeSchema,
  UnassignedPoolSchema,
} from '../schemas/skillTree'

const log = createModuleLogger('skillTree')

/**
 * Anything that can run relational queries: the shared {@link db} or a transaction handle.
 * Lets one query definition serve both `getMyTree` reads and the in-transaction post-import re-fetch.
 */
type RelationalQueryExecutor = Pick<typeof db, 'query'>

/**
 * Reads one skill tree with its nodes (+ live assignments) and edges.
 *
 * Explicit `orderBy` id ascending on every relation keeps SVG DOM order and
 * keyboard focus order deterministic across environments. Without it, Postgres
 * is free to hand back rows in any order (typically insertion order, but not
 * guaranteed), which makes the tab-through experience drift between environments.
 *
 * The assignment filter surfaces orphaned rows (`todoId IS NULL`) as well as
 * assignments whose source todo is still completed — orphans are the frozen XP
 * receipts left behind when a user deletes a completed task.
 *
 * @param executor - {@link db} or a transaction handle.
 * @param treeCondition - `WHERE` predicate selecting the tree (by owner or by id).
 * @returns The tree with nested `nodes[].assignments` and `edges`, or `undefined` when none matches.
 * @example
 * await findTreeWithRelations(db, eq(skillTreeTable.userId, 7))
 */
function findTreeWithRelations(
  executor: RelationalQueryExecutor,
  treeCondition: SQL,
) {
  return executor.query.skillTreeTable.findFirst({
    where: treeCondition,
    with: {
      nodes: {
        orderBy: (nodes, { asc }) => [asc(nodes.id)],
        with: {
          assignments: {
            where: (assignments) =>
              or(
                isNull(assignments.todoId),
                // Correlated on this assignment's todo, so Postgres probes the todo by primary key
                // instead of first collecting every completed todo of every user.
                exists(
                  db
                    .select({ one: sql`1` })
                    .from(todoTable)
                    .where(
                      and(
                        eq(todoTable.id, assignments.todoId),
                        eq(todoTable.completed, true),
                      ),
                    ),
                ),
              ),
            orderBy: (assignments, { asc }) => [asc(assignments.id)],
          },
        },
      },
      edges: {
        orderBy: (edges, { asc }) => [asc(edges.id)],
      },
    },
  })
}

/**
 * Imports the default template as a new SkillTree for a user. Uses batched
 * multi-row inserts for nodes and edges, so a 28-node / 32-edge template takes one
 * statement per table plus the final re-fetch instead of ~54 single-row inserts,
 * keeping the transaction short.
 *
 * @param userId - The user's database ID (not Clerk ID).
 * @returns The newly created tree with nodes, edges, and empty assignment arrays.
 */
async function importDefaultTemplate(userId: number) {
  return runTransaction(async (tx) => {
    const tree = requireRow(
      await tx
        .insert(skillTreeTable)
        .values({
          userId,
          name: BACKEND_DEVELOPER_CORE_TEMPLATE.name,
          templateKey: BACKEND_DEVELOPER_CORE_TEMPLATE.key,
        })
        .returning(),
      'skillTree.insert',
    )

    // Batch insert all nodes in one round-trip. RETURNING hands back the new ids so the
    // template edges, which reference nodes by name (unique within a template), resolve
    // without a second read.
    const createdNodes = await tx
      .insert(skillNodeTable)
      .values(buildDefaultSkillNodes(tree.id))
      .returning({ id: skillNodeTable.id, name: skillNodeTable.name })
    const edgeRows = buildDefaultSkillEdges(tree.id, createdNodes)
    if (edgeRows.length > 0) {
      await tx.insert(nodeEdgeTable).values(edgeRows)
    }

    // Re-fetch the full tree with relations for the response. Reuses the
    // shared query with deterministic orderBy so the caller sees the same
    // ordering it will see on subsequent reads. A missing row aborts the
    // transaction, like the throw-on-missing read it replaces.
    const fullTree = await findTreeWithRelations(
      tx,
      eq(skillTreeTable.id, tree.id),
    )
    if (!fullTree) throw new Error('skillTree re-fetch matched no row')
    return fullTree
  })
}

/**
 * Ensures the given nodeId and todoId both belong to the user, and (when
 * required) that the todo is completed. Throws `NOT_FOUND` for missing rows
 * — matches the error shape used by todo.ts / category.ts so clients can
 * consistently handle missing-resource cases.
 *
 * @param userId - The user's database ID (not Clerk ID).
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
  const [[node], [todo]] = await Promise.all([
    db
      .select({ id: skillNodeTable.id })
      .from(skillNodeTable)
      .innerJoin(
        skillTreeTable,
        eq(skillNodeTable.skillTreeId, skillTreeTable.id),
      )
      .where(
        and(eq(skillNodeTable.id, nodeId), eq(skillTreeTable.userId, userId)),
      )
      .limit(1),
    db
      .select({
        id: todoTable.id,
        text: todoTable.text,
        completed: todoTable.completed,
      })
      .from(todoTable)
      .where(
        and(
          eq(todoTable.id, todoId),
          eq(todoTable.userId, userId),
          // `and()` drops `undefined`, so the completed filter is opt-in.
          requireCompleted ? eq(todoTable.completed, true) : undefined,
        ),
      )
      .limit(1),
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
 * If a concurrent request already created the tree (unique violation on
 * the `userId` unique index), re-query and return the winner.
 *
 * @returns The tree with nested nodes (+ assignments) and edges.
 */
export const getMyTree = authMiddleware
  .output(SkillTreeSchema)
  .handler(async ({ context }) => {
    try {
      let tree = await findTreeWithRelations(
        db,
        eq(skillTreeTable.userId, context.user.id),
      )
      if (!tree) {
        try {
          tree = await importDefaultTemplate(context.user.id)
        } catch (error) {
          // Unique violation: a concurrent request already imported the
          // template. Re-query for the winning tree and return
          // that — the user never sees the race.
          if (isPgError(error, PG_UNIQUE_VIOLATION)) {
            const winner = await findTreeWithRelations(
              db,
              eq(skillTreeTable.userId, context.user.id),
            )
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
      return await db
        .select({ id: todoTable.id, text: todoTable.text })
        .from(todoTable)
        .where(
          and(
            eq(todoTable.userId, context.user.id),
            eq(todoTable.completed, true),
            // No assignment row points at this todo yet.
            notExists(
              db
                .select({ one: sql`1` })
                .from(nodeAssignmentTable)
                .where(eq(nodeAssignmentTable.todoId, todoTable.id)),
            ),
          ),
        )
        // `id` breaks updatedAt ties so equal timestamps still list in a stable insertion order.
        .orderBy(desc(todoTable.updatedAt), asc(todoTable.id))
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
 *   - One assignment per todo globally (unique index on `todoId`).
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
      return await runTransaction(async (tx) => {
        // Delete any existing assignment for this todo (supports move between
        // nodes). The unique index on todoId would otherwise reject the insert.
        await tx
          .delete(nodeAssignmentTable)
          .where(eq(nodeAssignmentTable.todoId, input.todoId))
        return requireRow(
          await tx
            .insert(nodeAssignmentTable)
            .values({
              nodeId: input.nodeId,
              todoId: input.todoId,
              todoText: todo.text,
            })
            .returning(),
          'nodeAssignment.insert',
        )
      })
    } catch (error) {
      if (error instanceof ORPCError) throw error
      // A foreign-key violation happens if the todo is deleted between
      // assertOwnership and the transaction insert (TOCTOU). A unique
      // violation on the todoId index happens when two concurrent
      // `assignTask` calls both pass `assertOwnership`, both run the delete,
      // and then the loser races past the deleted row into the insert.
      // Translate both to NOT_FOUND so the client converges on a single
      // consistent final assignment instead of surfacing a 500 for the loser
      // of a harmless race.
      if (
        isPgError(error, PG_UNIQUE_VIOLATION) ||
        isPgError(error, PG_FOREIGN_KEY_VIOLATION)
      ) {
        throw new ORPCError('NOT_FOUND', {
          message: 'Todo no longer exists',
        })
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
 * unique index on `todoId` means `todoId` identifies at most one row.
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
      // `todoId` is globally unique (unique index), so this is a
      // single-row lookup. If the row exists but points at a different
      // node, return null — the caller's mental model is out of sync and
      // `onSettled` query invalidation will rebase their optimistic state.
      const [existing] = await db
        .select()
        .from(nodeAssignmentTable)
        .where(eq(nodeAssignmentTable.todoId, input.todoId))
        .limit(1)
      if (!existing || existing.nodeId !== input.nodeId) {
        return null
      }
      const [deleted] = await db
        .delete(nodeAssignmentTable)
        .where(eq(nodeAssignmentTable.todoId, input.todoId))
        .returning()
      // A concurrent unassign call won the race between our read and this
      // delete — already-gone is OK, return null so the client can reconcile.
      return deleted ?? null
    } catch (error) {
      if (error instanceof ORPCError) throw error
      log.error({ error }, 'Error in unassignTask')
      throw new ORPCError('INTERNAL_SERVER_ERROR', {
        message: 'Failed to unassign task',
        cause: error,
      })
    }
  })
