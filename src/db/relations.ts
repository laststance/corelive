/**
 * Drizzle relations used by relational queries (`db.query.*`).
 *
 * Only the skill tree's three-level read (tree → nodes → assignments, plus
 * edges) uses them; every other query is a plain select-builder statement.
 * Each `many()` needs its inverse `one()` so drizzle can resolve the join keys.
 *
 * @module db/relations
 */
import { relations } from 'drizzle-orm'

import {
  nodeAssignmentTable,
  nodeEdgeTable,
  skillNodeTable,
  skillTreeTable,
} from './schema'

export const skillTreeRelations = relations(skillTreeTable, ({ many }) => ({
  nodes: many(skillNodeTable),
  edges: many(nodeEdgeTable),
}))

export const skillNodeRelations = relations(
  skillNodeTable,
  ({ one, many }) => ({
    skillTree: one(skillTreeTable, {
      fields: [skillNodeTable.skillTreeId],
      references: [skillTreeTable.id],
    }),
    assignments: many(nodeAssignmentTable),
  }),
)

export const nodeEdgeRelations = relations(nodeEdgeTable, ({ one }) => ({
  skillTree: one(skillTreeTable, {
    fields: [nodeEdgeTable.skillTreeId],
    references: [skillTreeTable.id],
  }),
}))

export const nodeAssignmentRelations = relations(
  nodeAssignmentTable,
  ({ one }) => ({
    node: one(skillNodeTable, {
      fields: [nodeAssignmentTable.nodeId],
      references: [skillNodeTable.id],
    }),
  }),
)
