import type { CallToolResult } from '@modelcontextprotocol/server';
import type { Principal } from '../../auth/principal';
import { missingScopes } from '../../auth/scopes';
import {
  DelegationScopeError,
  TokenExchangeError,
} from '../../token-exchange/token-exchange.errors';

export const jsonResult = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value,
});

export const errorResult = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

/**
 * Second line of defence behind the HTTP-edge scope check: tool handlers never trust that
 * the middleware ran.
 */
export const scopeError = (
  principal: Principal,
  required: readonly string[],
): CallToolResult | undefined => {
  const missing = missingScopes(principal.scopes, required);
  return missing.length > 0
    ? errorResult(`This tool requires the scope: ${missing.join(' ')}`)
    : undefined;
};

/** Turns delegation failures into messages an agent can act on; anything else is rethrown. */
export const delegationErrorResult = (error: unknown): CallToolResult => {
  if (error instanceof TokenExchangeError && error.isGrantInvalid) {
    return errorResult(
      'Your Cosmic Arcana authorization has expired or was revoked. Reconnect to continue.',
    );
  }
  if (error instanceof TokenExchangeError) {
    return errorResult(
      'Could not obtain access to Cosmic Arcana services right now. Try again shortly.',
    );
  }
  if (error instanceof DelegationScopeError) {
    return errorResult(
      `Missing permission for this action: ${error.missing.join(' ')}`,
    );
  }
  throw error;
};
