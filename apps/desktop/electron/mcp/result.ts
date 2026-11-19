/** A structured tool result also readable by clients that show only the text content. */
export interface McpResult {
  [key: string]: unknown
  isError: boolean
  content: { type: 'text'; text: string }[]
  structuredContent: Record<string, unknown>
}

export const taskAdditionLookupAction =
  'Look up the original operationId with get_task_addition_result before considering another write.'

export type SaveEffect = 'none' | 'unknown' | 'partial'

/** Carries a caller-safe refusal across the ordinary app's action handlers.
 * @example throw new McpActionError('category-unavailable', 'List categories and select the intended category.')
 */
export class McpActionError extends Error {
  constructor(
    readonly code: string,
    readonly nextAction: string,
    readonly effect: SaveEffect = 'none',
    readonly detail?: Record<string, unknown>,
  ) {
    super(code)
  }
}

/** Exposes the same successful outcome to text-only and structured MCP clients.
 * @example mcpSuccess({ categoryId, revision })
 */
export function mcpSuccess(result: Record<string, unknown>): McpResult {
  return {
    isError: false,
    structuredContent: result,
    content: [{ type: 'text', text: JSON.stringify(result) }],
  }
}

const messages: Readonly<Record<string, string>> = {
  'request-too-large':
    'The tool arguments exceed the local request size limit.',
  'result-too-large':
    'The complete tool result exceeds the inline MCP response size limit.',
  'invalid-input': 'The supplied arguments do not match this operation.',
  'category-unavailable':
    'The requested category is unavailable in this workspace.',
  'revision-conflict':
    'The draft changed after the supplied revision was read.',
  'command-conflict':
    'This operation ID already belongs to a different request.',
  'undo-expired': 'The time to undo this completion has elapsed.',
  'result-unknown': 'CoreLive could not confirm the original task addition.',
  'worker-unavailable':
    'The workspace worker stopped before it returned the result.',
  'flush-failed': 'The editor could not confirm that current typing was saved.',
  'account-changed': 'The account changed during this operation.',
  'account-required': 'This operation needs a connected CoreLive account.',
  'connection-not-pending':
    'CoreLive could not match the request to a current connection prompt.',
  'account-unavailable': 'The connected account could not be reached.',
  'history-cursor-unavailable':
    'This history page is no longer available to this session.',
  'file-exists': 'A file already exists at the requested destination.',
}
const effects: Record<SaveEffect, string> = {
  none: 'The requested operation did not complete.',
  unknown: 'CoreLive could not verify whether the change was saved.',
  partial: 'CoreLive completed only part of the operation.',
}

/** Returns the observed write effect and a possible next action after a failed tool call.
 * @example mcpFailure('read_draft', 'storage-unavailable', 'none', 'Open CoreLive to inspect recovery.')
 */
export function mcpFailure(
  operation: string,
  code: string,
  effect: SaveEffect,
  nextAction: string,
  detail: Record<string, unknown> = {},
): McpResult {
  const body = {
    ...detail,
    operation,
    code,
    effect,
    message: messages[code] ?? effects[effect],
    nextAction,
  }
  return {
    isError: true,
    structuredContent: body,
    content: [{ type: 'text', text: JSON.stringify(body) }],
  }
}
