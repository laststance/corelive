import { z } from 'zod'

import { TodoSchema } from './todo'

/** A skill node with its assignments. Maps to Prisma SkillNode + NodeAssignment[]. */
export const SkillNodeSchema = z.object({
  id: z.number().int().positive(),
  skillTreeId: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  assignments: z.array(
    z.object({
      id: z.number().int().positive(),
      nodeId: z.number().int().positive(),
      todoId: z.number().int().positive(),
      createdAt: z
        .union([z.date(), z.string()])
        .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
    }),
  ),
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
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
  updatedAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

/** Pool of completed Todos not yet assigned. Reuses TodoSchema. */
export const UnassignedPoolSchema = z.array(TodoSchema)

/** Input for assign/unassign mutations. */
export const AssignTaskInputSchema = z.object({
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive(),
})

/** A single NodeAssignment row, returned by assign/unassign. */
export const NodeAssignmentSchema = z.object({
  id: z.number().int().positive(),
  nodeId: z.number().int().positive(),
  todoId: z.number().int().positive(),
  createdAt: z
    .union([z.date(), z.string()])
    .transform((val) => (typeof val === 'string' ? new Date(val) : val)),
})

export type SkillTree = z.infer<typeof SkillTreeSchema>
export type SkillNode = z.infer<typeof SkillNodeSchema>
export type NodeEdge = z.infer<typeof NodeEdgeSchema>
