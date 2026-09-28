/**
 * An RFC 8693 exchange that the Authorization Server refused or that could not complete.
 * `oauthError` carries the AS's error code (`invalid_grant`, `invalid_target`, …) when there was one.
 */
export class TokenExchangeError extends Error {
  constructor(
    message: string,
    readonly oauthError?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'TokenExchangeError';
  }

  /** The user's grant is gone (expired, revoked, agent disconnected): only re-authorization helps. */
  get isGrantInvalid(): boolean {
    return this.oauthError === 'invalid_grant';
  }
}

/** The caller asked to act downstream with a scope its own token does not carry. */
export class DelegationScopeError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `token does not carry the scope needed downstream: ${missing.join(' ')}`,
    );
    this.name = 'DelegationScopeError';
  }
}
