import type { CategoryRefusal } from '@corelive/desktop-contract/category-validator'

/** Reasons the storage worker reports for a refused workspace command. */
export type WorkspaceCommandReason =
  | 'revision-conflict'
  | 'command-conflict'
  | 'category-unavailable'
  | 'undo-expired'
  | 'invalid-row'
  | 'finished-line'
  | 'record-unavailable'
  | 'conflict-unavailable'
  // Local category refusals (C5): never a storage failure.
  | CategoryRefusal

/**
 * A definite, non-storage refusal of a workspace command.
 *
 * Thrown inside the disk transaction by {@link WorkspaceService} and the category modules;
 * the worker maps it to `{ ok: false, reason, detail }` so the renderer can tell a refusal
 * from a storage failure (C5).
 *
 * @example
 * ```ts
 * throw new WorkspaceCommandError('name-taken-local', 'Work')
 * ```
 */
export class WorkspaceCommandError extends Error {
  constructor(
    readonly reason: WorkspaceCommandReason,
    /** Extra copy input, e.g. the child name of an EA8 promotion clash. */
    readonly detail?: string,
  ) {
    super(`Workspace command: ${reason}`)
    this.name = 'WorkspaceCommandError'
  }
}
