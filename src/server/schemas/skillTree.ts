import { z } from 'zod'

/**
 * Coerces a DB/JSON date value to a Date. oRPC wire format hands us strings
 * after JSON round-trip; Prisma hands us Dates directly. This accepts either.
 */
const dateLike = z
  .union([z.date(), z.string()])
  .transform((val) => (typeof val === 'string' ? new Date(val) : val))

/** A single NodeAssignment row. todoId is nullable once the source Todo is gone. */
const AssignmentRowSchema = z.object({
  id: z.number().int().positive(),
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive().nullable(),
  todoText: z.string(),
  createdAt: dateLike,
})

/** A skill node with its assignments. Maps to Prisma SkillNode + NodeAssignment[]. */
export const SkillNodeSchema = z.object({
  id: z.number().int().positive(),
  skillTreeId: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  assignments: z.array(AssignmentRowSchema),
})

/** An edge between two skill nodes. */
export const NodeEdgeSchema = z.object({
  id: z.number().int().positive(),
  skillTreeId: z.number().int().positive(),
  fromNodeId: z.number().int().positive(),
  toNodeId: z.number().int().positive(),
})

/** The full tree response from `getMyTree`. */
export const SkillTreeSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  name: z.string(),
  templateKey: z.string().nullable(),
  nodes: z.array(SkillNodeSchema),
  edges: z.array(NodeEdgeSchema),
  createdAt: dateLike,
  updatedAt: dateLike,
})

/**
 * A single entry in the unassigned-task pool. The skill tree only needs id +
 * text, so we return a narrowed shape rather than the full TodoSchema. This
 * avoids dragging PII (notes, categoryId, userId) into the skill tree cache
 * and into the localStorage persister.
 */
export const UnassignedPoolItemSchema = z.object({
  id: z.number().int().positive(),
  text: z.string(),
})
export const UnassignedPoolSchema = z.array(UnassignedPoolItemSchema)

/** Input for assign/unassign mutations. */
export const AssignTaskInputSchema = z.object({
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive(),
})

/** A single NodeAssignment row, returned by assign/unassign. */
export const NodeAssignmentSchema = AssignmentRowSchema

export type SkillTree = z.infer<typeof SkillTreeSchema>
export type SkillNode = z.infer<typeof SkillNodeSchema>
export type NodeEdge = z.infer<typeof NodeEdgeSchema>
