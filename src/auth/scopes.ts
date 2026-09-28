export const SCOPES = {
  cosmicRead: 'cosmic:read',
  spreadsRead: 'spreads:read',
  spreadsWrite: 'spreads:write',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * Scopes a `tools/call` needs, checked at the HTTP edge so a client with too narrow a
 * token gets a `403 insufficient_scope` challenge and can step up. Tools not listed here
 * only need a valid token.
 */
export const TOOL_REQUIRED_SCOPES: Readonly<Record<string, readonly Scope[]>> =
  {
    get_cosmic_snapshot: [SCOPES.cosmicRead],
  };

export const missingScopes = (
  granted: readonly string[],
  required: readonly string[],
): string[] => required.filter((scope) => !granted.includes(scope));
