import type { NodeEdge, SkillNode } from '@/server/schemas/skillTree'

/**
 * @description Positive integer identifier of a skill node in the skill tree.
 * @example
 * const nodeId: SkillNodeId = 12
 */
export type SkillNodeId = SkillNode['id']

/**
 * @description Human-readable display name of a skill node.
 * @example
 * const skillName: SkillNodeName = 'API Design'
 */
export type SkillNodeName = SkillNode['name']

/**
 * @description Normalized node position value (0 to 1) used by the SVG layout.
 * @example
 * const x: NodeCoordinate = 0.42
 */
export type NodeCoordinate = SkillNode['x']

/**
 * @description A completed Todo id that can be assigned to a skill node.
 * @example
 * const todoId: TodoId = 101
 */
export type TodoId = NonNullable<SkillNode['assignments'][number]['todoId']>

/**
 * @description Snapshot display text stored for an assigned completed Todo.
 * @example
 * const text: TodoText = 'Refactor login flow'
 */
export type TodoText = SkillNode['assignments'][number]['todoText']

/**
 * @description XP amount displayed for a node in the constellation UI.
 * @example
 * const xp: NodeXp = 8
 */
export type NodeXp = number

/**
 * @description SVG viewbox coordinate value after converting normalized layout positions.
 * @example
 * const cx: ViewboxCoordinate = 500
 */
export type ViewboxCoordinate = number

/**
 * @description Unique identifier of an edge connecting two skill nodes.
 * @example
 * const edgeId: NodeEdgeId = 7
 */
export type NodeEdgeId = NodeEdge['id']

/**
 * @description Source skill node id of a directed edge.
 * @example
 * const from: EdgeFromNodeId = 2
 */
export type EdgeFromNodeId = NodeEdge['fromNodeId']

/**
 * @description Destination skill node id of a directed edge.
 * @example
 * const to: EdgeToNodeId = 3
 */
export type EdgeToNodeId = NodeEdge['toNodeId']
