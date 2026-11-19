import {
  isSyncAuthenticationError,
  type McpAccountClient,
} from '../offline/createSyncTransport'

/** Page ownership and cancellation for one attachment of the ordinary app to an account. */
export interface McpAccountBinding {
  accountId: string
  generation: number
  epoch: number
  signal: AbortSignal
}

type AccountErrorCode =
  | 'account-required'
  | 'account-unavailable'
  | 'account-changed'
  | 'record-unavailable'
  | 'account-forbidden'
  | 'invalid-input'
  | 'command-conflict'

/** A redacted account failure, including whether the caller's operation could have reached the server. */
export class McpAccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    readonly dispatched: boolean,
    readonly definiteRefusal = false,
  ) {
    super(code)
    this.name = 'McpAccountError'
  }
}

/** Distinguishes a server refusal before a write from a broken connection with an uncertain result.
 * @example const failure = mcpAccountFailure(err, dispatched)
 */
export function mcpAccountFailure(
  error: unknown,
  dispatched: boolean,
): McpAccountError {
  if (error instanceof McpAccountError) return error
  if (isSyncAuthenticationError(error))
    return new McpAccountError('account-required', dispatched, true)
  if (typeof error === 'object' && error !== null && 'code' in error) {
    // Only known refusal codes from the approved methods have a definite write outcome.
    switch (error.code) {
      case 'NOT_FOUND':
        return new McpAccountError('record-unavailable', dispatched, true)
      case 'FORBIDDEN':
        return new McpAccountError('account-forbidden', dispatched, true)
      case 'BAD_REQUEST':
        return new McpAccountError('invalid-input', dispatched, true)
      case 'CONFLICT':
        return new McpAccountError('command-conflict', dispatched, true)
    }
  }
  return new McpAccountError('account-unavailable', dispatched)
}

/** Trusted main-process callbacks consume the whole account result before the final authorization check. */
export type McpAccountWork<T> = (
  client: McpAccountClient,
  signal: AbortSignal,
) => Promise<T>
